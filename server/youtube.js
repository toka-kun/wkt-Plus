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

// チャンネルの各タブを取得（AJAX用）
async function getChannelTab(id, tab, sort) {
  const ch = await client.getChannel(id);
  let items = [];

  try {
    if (tab === 'videos') {
      let t = await ch.getVideos();
      const rawFilters = t.filters || [];
      const filterLabels = rawFilters.map(f =>
        typeof f === 'string' ? f : f?.label || String(f)
      );

      if (sort === 'popular') {
        const f = rawFilters[filterLabels.findIndex(s => /popular/i.test(s))];
        if (f != null) t = await t.applyFilter(f);
      } else if (sort === 'oldest') {
        const f = rawFilters[filterLabels.findIndex(s => /oldest|古/i.test(s))];
        if (f != null) t = await t.applyFilter(f);
      }

      items = t?.videos || t?.items || [];

    } else if (tab === 'shorts') {
      const t = await ch.getShorts();
      items = t?.videos || t?.items || [];

    } else if (tab === 'live') {
      const t = await ch.getLiveStreams();
      items = t?.videos || t?.items || [];

    } else if (tab === 'releases') {
      if (typeof ch.getReleases === 'function') {
        const t = await ch.getReleases();
        items = t?.videos || t?.items || [];
      }

    } else if (tab === 'playlists') {
      const t = await ch.getPlaylists();
      items = t?.playlists || t?.items || [];
    }
  } catch (err) {
    console.error(`Tab "${tab}" 取得失敗:`, err.message);
  }

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

module.exports = {
  infoGet,
  setClient,
  search,
  getComments,
  getChannel,
  getChannelTab,
  normalizeWatchNextFeed,
  extractChannels
};
