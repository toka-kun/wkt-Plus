let client = null;
const ytpl = require("ytpl");

function setClient(newClient) {
  client = newClient;
}

async function infoGet(id) {
  try {
    let info = await client.getInfo(id);
    return info;
  } catch (error) {
    return;
  }
}

async function search(q, page, limit) {
  if (!q) return;
  try {
    return(await client.search(q, {type: "all"}));
  } catch (error) {
    return null;
  }
}

async function getComments(id) {
  if (!id) return;
  try {
    return(await client.getComments(id));
  } catch (error) {
    return null;
  }
}

async function getChannel(id) {
  let channel = null;
  let recentVideos = null;
  try {
    channel = await client.getChannel(id);
  } catch (err) {
    console.error("channel取得失敗:", err);
  }
  try {
    recentVideos = await ytpl(id, { pages: 1 });
  } catch (err) {
    console.error("recentVideos取得失敗:", err);
  }
  if (!channel && !recentVideos) {
    return null;
  }
  return({channel, recentVideos});
}

// watch_next_feed を正規化する共通関数
// CompactAutoplay を展開し、LockupView を CompactVideo 互換形式に変換する
function normalizeWatchNextFeed(rawFeed) {
  const feed = Array.isArray(rawFeed) ? rawFeed : [];

  // CompactAutoplay の中にある動画を展開する
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

  // LockupView（YouTube新形式）を CompactVideo 互換形式に変換する
  return expanded.map(item => {
    if (!item || !item.type) return null;
    if (item.type !== 'LockupView') return item;
    if (item.content_type !== 'VIDEO') return null;

    const rows = item.metadata?.metadata?.metadata_rows || [];
    const channelName = rows[0]?.metadata_parts?.[0]?.text?.text || '';
    const rawViewCount = rows[1]?.metadata_parts?.[0]?.text?.text || '';
    const publishedText = rows[1]?.metadata_parts?.[1]?.text?.text || '';

    // 「25万」のように単位なしで返ってくる場合は「回視聴」を補完する
    // すでに「視聴」が含まれている場合（「回視聴」「人が視聴中」等）はそのまま
    const viewCountText = rawViewCount && !rawViewCount.includes('視聴')
      ? rawViewCount + '回視聴'
      : rawViewCount;
    const videoId = item.content_id
      || item.renderer_context?.command_context?.on_tap?.payload?.videoId
      || null;

    if (!videoId) return null;

    // チャンネルIDはアバターのrenderer_contextに格納されている
    const channelId = item.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId || '';
    // チャンネルアイコンはアバター画像から取得
    const channelThumbUrl = item.metadata?.image?.avatar?.image?.[0]?.url || '';

    // サムネイルオーバーレイ（ThumbnailOverlayBadgeView / ThumbnailBottomOverlayView）から再生時間を取得
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
// 戻り値: [{id, name, icon, subsc}] (primary が先頭、collab チャンネルが続く)
function extractChannels(Info) {
  const owner = Info.secondary_info.owner;
  const primary = {
    id:    owner.author.id || '',
    name:  owner.author.name || '',
    icon:  owner.author.thumbnails?.[0]?.url || '',
    subsc: owner.subscriber_count?.text || ''
  };

  const channels = [primary];

  // MetadataRowContainer の各行を検索してコラボチャンネルリンクを収集
  try {
    const rows = Info.secondary_info.metadata?.rows;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!row || row.type !== 'MetadataRow') continue;
        const contents = row.contents;
        if (!Array.isArray(contents)) continue;
        for (const content of contents) {
          const runs = content?.runs;
          if (!Array.isArray(runs)) continue;
          for (const run of runs) {
            const browseId = run.endpoint?.payload?.browseId;
            if (!browseId) continue;
            // チャンネルIDは UC で始まる
            if (!browseId.startsWith('UC')) continue;
            // primary と重複するものは除外
            if (channels.some(ch => ch.id === browseId)) continue;
            channels.push({
              id:    browseId,
              name:  run.text || '',
              icon:  '',
              subsc: ''
            });
          }
        }
      }
    }
  } catch (_) {}

  return channels;
}

module.exports = {
  infoGet, 
  setClient,
  search,
  getComments,
  getChannel,
  normalizeWatchNextFeed,
  extractChannels
};
