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
  const owner = Info.secondary_info?.owner;

  // コラボ動画の判定: author.id が 'N/A' のとき、showDialogCommand でチャンネル一覧が渡される
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

          // subtitle: "⁨@handle⁩ • ⁨チャンネル登録者数 X万人⁩" → "チャンネル登録者数 X万人"
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

  // 通常動画 (チャンネル1つ)
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
  normalizeWatchNextFeed,
  extractChannels
};
