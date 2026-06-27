let client = null;

function setClient(newClient) {
  client = newClient;
}

async function infoGet(id) {
  try {
    return await client.getInfo(id);
  } catch (error) {
    return;
  }
}

async function search(q, page, limit) {
  if (!q) return;
  try {
    return await client.search(q, {type: "all"});
  } catch (error) {
    return null;
  }
}

async function getComments(id) {
  if (!id) return;
  try {
    return await client.getComments(id);
  } catch (error) {
    return null;
  }
}

async function getChannel(id) {
  try {
    const channel = await client.getChannel(id);
    return { channel, shelves: channel.shelves || [] };
  } catch (err) {
    console.error("channel取得失敗:", err);
    return null;
  }
}

// youtubei.js v17 のチャンネルアイテムを統一フォーマットに正規化
function normalizeChannelItem(raw, tabName) {
  if (!raw) return null;

  // RichItem ラッパーを展開
  const item = (raw.type === 'RichItem' && raw.content) ? raw.content : raw;
  if (!item) return null;

  const type = item.type || '';

  // ── ShortsLockupView (ショート) ──────────────────────────
  if (type === 'ShortsLockupView') {
    // entity_id は "shorts-shelf-item-{videoId}" 形式なのでプレフィックスを除去
    const id = (item.entity_id || '').replace(/^shorts-shelf-item-/, '');
    if (!id) return null;
    const om = item.overlay_metadata || {};
    const title = om.primary_text?.text
               || (item.accessibility_text || '').split(',')[0].trim()
               || '';
    const views = om.secondary_text?.text || '';
    return { itemType: 'short', id, title, views };
  }

  // ── LockupView (動画/ライブ/リリース/再生リスト) ────────────
  if (type === 'LockupView') {
    const id = item.content_id || '';
    if (!id) return null;

    const contentType = item.content_type || 'VIDEO';
    const title = item.metadata?.title?.text || '';

    if (contentType === 'PLAYLIST') {
      const thumb = item.content_image?.image?.sources?.[0]?.url
                 || item.content_image?.image?.image?.[0]?.url || '';
      return { itemType: 'playlist', id, title, count: '', thumbnail: thumb };
    }

    // 動画時間 → content_image.overlays のバッジから取得
    let duration = '';
    for (const overlay of (item.content_image?.overlays || [])) {
      for (const badge of (overlay.badges || [])) {
        if (badge.text && /^\d/.test(badge.text)) { duration = badge.text; break; }
      }
      if (duration) break;
    }

    // 視聴回数・投稿日時 → metadata_rows から収集
    const rows = item.metadata?.metadata?.metadata_rows || [];
    const allTexts = [];
    for (const row of rows) {
      const parts = row?.metadata_parts || [];
      for (const part of parts) {
        const t = part?.text?.text;
        if (t) allTexts.push(String(t));
      }
      // metadata_parts が無い場合は行自体の text を試す
      if (row?.text?.text) allTexts.push(String(row.text.text));
    }

    let views = '', published = '';
    for (const t of allTexts) {
      if (!views && /回|view/i.test(t))                              views     = t;
      else if (!published && /ago|前|年|ヶ月|週|日|時間|秒/i.test(t)) published = t;
      else if (!published && !views)                                  published = t;
    }

    const itemType = tabName === 'shorts' ? 'short' : 'video';
    return { itemType, id, title, duration, views, published };
  }

  // ── 旧形式動画 (GridVideo / CompactVideo / Video) ──────────
  if (type.endsWith('Video') || type === 'Video') {
    const id = item.id || item.video_id || '';
    if (!id) return null;
    return {
      itemType: tabName === 'shorts' ? 'short' : 'video',
      id,
      title:     item.title?.text || (typeof item.title === 'string' ? item.title : '') || '',
      duration:  item.duration?.text || (typeof item.duration === 'string' ? item.duration : '') || '',
      views:     item.short_view_count?.text || item.view_count?.text || '',
      published: item.published?.text || (typeof item.published === 'string' ? item.published : '') || ''
    };
  }

  // ── 再生リスト (GridPlaylist など) ────────────────────────
  if (type.includes('Playlist') || tabName === 'playlists') {
    const id = item.id || item.content_id || '';
    if (!id) return null;
    return {
      itemType:  'playlist',
      id,
      title:     item.title?.text || (typeof item.title === 'string' ? item.title : '') || '',
      count:     item.video_count?.text || '',
      thumbnail: item.thumbnails?.[0]?.url || ''
    };
  }

  return null;
}

// チャンネルの各タブを取得（AJAX用）
async function getChannelTab(id, tab, sort) {
  const ch = await client.getChannel(id);
  let t = null;
  let rawContents = [];

  try {
    switch (tab) {
      case 'videos':
        t = await ch.getVideos();
        // ソートフィルターが使える場合だけ適用
        if (sort === 'popular' || sort === 'oldest') {
          const filters = t.filters || [];
          if (filters.length > 0) {
            const target = sort === 'popular' ? /popular|人気/i : /oldest|古い/i;
            const f = filters.find(fi =>
              target.test(typeof fi === 'string' ? fi : (fi?.label || fi?.title || ''))
            );
            if (f) {
              try { t = await t.applyFilter(f); } catch (_) {}
            }
          }
        }
        break;
      case 'shorts':
        t = await ch.getShorts();
        break;
      case 'live':
        t = await ch.getLiveStreams();
        break;
      case 'releases':
        if (typeof ch.getReleases === 'function') t = await ch.getReleases();
        break;
      case 'playlists':
        t = await ch.getPlaylists();
        break;
    }

    if (t) {
      const content = t.current_tab?.content;
      if (content?.type === 'SectionList') {
        // 再生リストタブ: SectionList -> ItemSection -> Grid -> items
        for (const section of (content.contents || [])) {
          for (const inner of (section.contents || [])) {
            if (inner?.type === 'Grid') {
              rawContents.push(...(inner.items || []));
            } else if (inner) {
              rawContents.push(inner);
            }
          }
        }
      } else {
        rawContents = content?.contents || content?.items
                   || t.videos || t.items || t.playlists || [];
      }
    }
  } catch (err) {
    console.error(`Tab "${tab}" 取得失敗:`, err.message);
  }

  const items = rawContents.map(i => normalizeChannelItem(i, tab)).filter(Boolean);
  return { items, tab, sort };
}

// watch_next_feed を正規化する共通関数
// CompactAutoplay を展開し、LockupView を CompactVideo 互換形式に変換する
function normalizeWatchNextFeed(rawFeed) {
  const feed = Array.isArray(rawFeed) ? rawFeed : [];

  const expanded = [];
  for (const item of feed) {
    if (!item || !item.type) continue;
    if (item.type === 'CompactAutoplay' && Array.isArray(item.videos)) {
      for (const inner of item.videos) {
        if (inner && inner.type) expanded.push(inner);
      }
    } else {
      expanded.push(item);
    }
  }

  return expanded.map(item => {
    if (!item || !item.type) return null;
    if (item.type !== 'LockupView') return item;
    if (item.content_type !== 'VIDEO') return null;

    const rows = item.metadata?.metadata?.metadata_rows || [];
    const channelName = rows[0]?.metadata_parts?.[0]?.text?.text || '';
    const rawViewCount = rows[1]?.metadata_parts?.[0]?.text?.text || '';
    const publishedText = rows[1]?.metadata_parts?.[1]?.text?.text || '';

    const viewCountText = rawViewCount && !rawViewCount.includes('視聴')
      ? rawViewCount + '回視聴'
      : rawViewCount;
    const videoId = item.content_id
      || item.renderer_context?.command_context?.on_tap?.payload?.videoId
      || null;

    if (!videoId) return null;

    const channelId = item.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId || '';
    const channelThumbUrl = item.metadata?.image?.avatar?.image?.[0]?.url || '';

    let durationText = '';
    for (const overlay of (item.content_image?.overlays || [])) {
      for (const badge of (overlay.badges || [])) {
        if (badge.text && /^\d/.test(badge.text)) {
          durationText = badge.text;
          break;
        }
      }
      if (durationText) break;
    }

    return {
      type: 'CompactVideo',
      id: videoId,
      title: { text: item.metadata?.title?.text || '' },
      author: {
        id: channelId,
        name: channelName,
        thumbnails: channelThumbUrl ? [{ url: channelThumbUrl }] : []
      },
      duration: durationText ? { text: durationText } : null,
      short_view_count: { text: viewCountText },
      published: publishedText ? { text: publishedText } : null
    };
  }).filter(Boolean);
}

// コラボ動画を含む全チャンネルを channels 配列として抽出する
function extractChannels(Info) {
  const owner = Info.secondary_info?.owner;

  if (owner?.author?.id === 'N/A') {
    try {
      const listItems = owner.author?.endpoint?.payload
        ?.panelLoadingStrategy?.inlineContent?.dialogViewModel
        ?.customContent?.listViewModel?.listItems;

      if (Array.isArray(listItems) && listItems.length > 0) {
        const channels = listItems.map(item => {
          const lvm = item?.listItemViewModel;
          if (!lvm) return null;

          const name = lvm.title?.content || '';
          const id   = lvm.title?.commandRuns?.[0]?.onTap?.innertubeCommand
                         ?.browseEndpoint?.browseId || '';
          const icon = lvm.leadingAccessory?.avatarViewModel?.image?.sources?.[0]?.url || '';

          const rawSubtitle = lvm.subtitle?.content || '';
          const subsc = rawSubtitle.includes('•')
            ? rawSubtitle.split('•').slice(1).join('•')
                .replace(/[\u200e\u200f\u2068\u2069]/g, '').trim()
            : '';

          if (!id || !name) return null;
          return { id, name, icon, subsc };
        }).filter(Boolean);

        if (channels.length > 0) return channels;
      }
    } catch (_) {}
  }

  const primary = {
    id:    owner?.author?.id    || '',
    name:  owner?.author?.name  || '',
    icon:  owner?.author?.thumbnails?.[0]?.url || '',
    subsc: owner?.subscriber_count?.text || ''
  };
  return [primary];
}

// YouTube v17 では動画が PlaylistVideo ではなく LockupView で返る。
// page_contents → ItemSection → LockupView[] を直接取得して正規化する。
async function getPlaylist(id) {
  try {
    const pl = await client.getPlaylist(id);

    const rawItems = [];
    for (const section of (pl.page_contents?.contents || [])) {
      for (const inner of (section.contents || [])) {
        if (inner?.type === 'LockupView' && inner.content_type === 'VIDEO') {
          rawItems.push(inner);
        }
      }
    }

    const items = rawItems.map((item, idx) => {
      const videoId = item.content_id || '';
      if (!videoId) return null;

      const title = item.metadata?.title?.text || '';

      // 再生時間 → content_image.overlays のバッジ
      let duration = '';
      for (const overlay of (item.content_image?.overlays || [])) {
        for (const badge of (overlay.badges || [])) {
          if (badge.text && /^\d/.test(badge.text)) { duration = badge.text; break; }
        }
        if (duration) break;
      }

      // row0 = チャンネル名、row1 = [視聴回数, 投稿日時]
      const rows     = item.metadata?.metadata?.metadata_rows || [];
      const channelName = rows[0]?.metadata_parts?.[0]?.text?.text || '';
      const row1parts   = rows[1]?.metadata_parts || [];
      const views       = row1parts[0]?.text?.text || '';
      const published   = row1parts[1]?.text?.text || '';

      // チャンネルID → metadata.image の renderer_context
      const channelId = item.metadata?.image?.renderer_context
        ?.command_context?.on_tap?.payload?.browseId || '';

      return { id: videoId, title, duration, views, published, channelName, channelId, index: idx + 1 };
    }).filter(Boolean);

    return { info: pl.info, items, has_continuation: pl.has_continuation };
  } catch (err) {
    console.error('playlist取得失敗:', err);
    return null;
  }
}

module.exports = {
  infoGet,
  setClient,
  search,
  getComments,
  getChannel,
  getChannelTab,
  getPlaylist,
  normalizeWatchNextFeed,
  extractChannels
};
