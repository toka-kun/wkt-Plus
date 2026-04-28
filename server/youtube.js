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

    return {
      type: 'CompactVideo',
      id: videoId,
      title: { text: item.metadata?.title?.text || '' },
      author: {
        id: channelId,
        name: channelName,
        thumbnails: channelThumbUrl ? [{ url: channelThumbUrl }] : []
      },
      short_view_count: { text: viewCountText },
      published: publishedText ? { text: publishedText } : null
    };
  }).filter(Boolean);
}

module.exports = {
  infoGet, 
  setClient,
  search,
  getComments,
  getChannel,
  normalizeWatchNextFeed
};
