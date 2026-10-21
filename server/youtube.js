let client = null;

function setClient(newClient) {
  client = newClient;
}

// YouTube CDN の直リンクを /wkt/back 経由のプロキシリンクに変換する
// （動画サムネと同様、i.ytimg.com / yt3.ggpht.com / *.googleusercontent.com への
//   直アクセスはブロックされることがあるため）
function toProxyThumb(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    // i.ytimg.com / i0〜i9.ytimg.com: pathname が元々 "/vi/{videoId}/{quality}" や
    // リリース(アルバム)カバーの "/s_p/{id}/{quality}" 形式なので、
    // back.js の "/vi*" "/s_p/*" ルートにそのまま乗るよう pathname をそのまま付与。
    // ただし "/s_p/" は番号付きサブドメイン間でミラーされておらず、元のホストに
    // そのまま当てないと404になるため、__h に元のホスト名を付けて back.js に伝える。
    if (/^i\d*\.ytimg\.com$/.test(u.hostname)) {
      if (u.pathname.startsWith('/s_p/')) {
        const params = new URLSearchParams(u.search);
        params.set('__h', u.hostname);
        return `/wkt/back${u.pathname}?${params.toString()}`;
      }
      return `/wkt/back${u.pathname}${u.search}`;
    }
    // yt3.ggpht.com / yt3.googleusercontent.com（同じ画像を返すミラーホスト）:
    // pathname は "/ytc/xxx" 形式のこともあれば、プレフィックス無しでハッシュが
    // 直接来ることもあり一定しない。back.js の "/yt3/*" ルートは先頭の "/yt3" だけ
    // 剥がしてそのまま yt3.ggpht.com に転送するので、pathname の中身によらず
    // 常に "/wkt/back/yt3" を付ければ元のパスを完全に復元できる
    // （"/ytc/" を含むパスでも二重にはならない）。
    if (u.hostname === 'yt3.ggpht.com' || u.hostname.endsWith('.googleusercontent.com')) {
      return `/wkt/back/yt3${u.pathname}${u.search}`;
    }
  } catch (err) {
    // 相対URLや不正なURLの場合はそのまま返す
  }
  return url;
}

// LockupView の content_image（ThumbnailView / CollectionThumbnailView）から
// サムネイルURLを取り出す。CollectionThumbnailView（アルバム等の重ね表示）は
// primary_thumbnail の下にネストされ、image はいずれも Thumbnail の配列。
function extractLockupThumb(contentImage) {
  if (!contentImage) return '';
  const tv = contentImage.primary_thumbnail || contentImage;
  const images = tv?.image;
  if (Array.isArray(images) && images.length > 0) {
    return images[0]?.url || '';
  }
  return '';
}

// LockupView が content_type: 'CHANNEL' のとき、アバター画像は content_image ではなく
// metadata.image（DecoratedAvatarView か AvatarStackView）側に入っている。
// ここを見ずに content_image だけ見ていると、チャンネル推薦カードのサムネが
// 空になって壊れて見える（他の itemType と違い content_image 自体が使われないため）。
function extractLockupAvatar(metadataImage) {
  if (!metadataImage) return '';
  // DecoratedAvatarView: { avatar: { image: [Thumbnail, ...] } }
  const avatarImages = metadataImage.avatar?.image;
  if (Array.isArray(avatarImages) && avatarImages.length > 0) {
    return avatarImages[0]?.url || '';
  }
  // AvatarStackView: { avatars: [{ image: [Thumbnail, ...] }, ...] }
  if (Array.isArray(metadataImage.avatars) && metadataImage.avatars.length > 0) {
    const images = metadataImage.avatars[0]?.image;
    if (Array.isArray(images) && images.length > 0) {
      return images[0]?.url || '';
    }
  }
  return '';
}

async function infoGet(id) {
  // ここでエラーを握りつぶして undefined を返すと、呼び出し元が
  // Info.primary_info / Info.secondary_info / Info.watch_next_feed などを
  // 無条件でプロパティアクセスしてしまい、"Cannot read properties of
  // undefined" という分かりにくいエラーになる。
  // 呼び出し元は全て try/catch で囲われているので、ここでは握りつぶさず
  // そのまま投げて、各所の catch（動画を取得できませんでした 等）に
  // 委ねる。
  return await client.getInfo(id);
}

// 再生リストは、従来の Playlist ではなく新形式(LockupView)で返ってくることがある(検索結果・関連動画)。
// 画面は従来形式の Playlist を前提に作られているため、ここで従来形式に直す。
// (実データ: 1行目 ["チャンネル名","プレイリスト"]、バッジ "2,580 本の動画"、遷移先の videoId = 先頭の動画)
function toSearchResult(item) {
  if (item?.type !== 'LockupView' || item.content_type !== 'PLAYLIST' || !item.content_id) return item;

  const rows = item.metadata?.metadata?.metadata_rows || [];
  const ci = item.content_image;
  const badgeTexts = [...(ci?.overlays || []), ...(ci?.primary_thumbnail?.overlays || [])]
    .flatMap(o => (o?.badges || []).map(b => b?.text).filter(Boolean));
  const count = badgeTexts.map(t => (String(t).match(/[\d,]+/) || [])[0]).find(Boolean) || '';

  return {
    type: 'Playlist',
    id: item.content_id,
    title: { text: item.metadata?.title?.text || '' },
    author: {
      id: item.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId || '',
      name: rows[0]?.metadata_parts?.[0]?.text?.text || ''
    },
    endpoint: { payload: { videoId: item.renderer_context?.command_context?.on_tap?.payload?.videoId || '' } },
    first_videos: [],
    video_count: { text: count }
  };
}

// 従来形式の動画がライブ配信中なら、画面が使う isLive の印を付ける
function markClassicLive(item) {
  if (item && /Video$/.test(item.type || '') && classicIsLive(item)) item.isLive = true;
  return item;
}

async function search(q, page, limit) {
  if (!q) return;
  try {
    const res = await client.search(q, {type: "all"});
    // 画面が使うのは results だけ
    return { results: Array.from(res?.results || []).map(toSearchResult).map(markClassicLive) };
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
    const rawShelves = channel.shelves || [];
    // ホームタブのシェルフも各タブ取得と同じ正規化関数を通し、
    // itemType(video/playlist/short/channel) を統一しておく。
    // こうしないと LockupView のリリース/再生リストが動画カード扱いになり、
    // サムネ404や /wkt/watch/{id} への誤リンクが発生する。
    const shelves = rawShelves.map(shelf => {
      // 通常の棚は content.items、ショート棚(ReelShelf)は棚の直下の items に入っている
      const rawItems = shelf.content?.items || shelf.content?.playlists || shelf.items || [];
      const items = rawItems.map(i => normalizeChannelItem(i, 'home')).filter(Boolean);
      return { title: shelf.title, items };
    });
    return { channel, shelves };
  } catch (err) {
    console.error("channel取得失敗:", err);
    return null;
  }
}

// LockupView の metadata_rows から表示テキスト(視聴回数・投稿日など)を順に集める
function collectLockupTexts(item) {
  const texts = [];
  for (const row of (item.metadata?.metadata?.metadata_rows || [])) {
    for (const part of (row?.metadata_parts || [])) {
      const t = part?.text?.text;
      if (t) texts.push(String(t));
    }
    // metadata_parts が無い場合は行自体の text を試す
    if (row?.text?.text) texts.push(String(row.text.text));
  }
  return texts;
}

// ── LockupView の表示テキスト(チャンネル名・視聴回数・投稿日時)を、中身で見分ける ──
// 何行目・何番目かで決めつけると、コラボ動画で崩れる。実際の YouTube では行の並びが違う:
//   通常(一覧)        : [チャンネル名] / [視聴回数, 投稿日時]
//   チャンネルのタブ   : [視聴回数, 投稿日時]
//   コラボ(一覧)      : [チャンネル名, "、チャンネル名2"] / [視聴回数, 投稿日時]
//   コラボ(タブ)      : [チャンネル名, "、チャンネル名2", 視聴回数, 投稿日時]   ← 1行にまとまる
// 視聴回数は "103万" "794" のように、単位が付かないこともある。
const RE_VIEWS_TEXT = /^[\d,.]+\s*(?:万|億|千|[KMB])?\s*(?:回視聴|人が視聴中|人が視聴|人が待機中|views?|watching|waiting)?$/i;
const RE_DATE_TEXT  = /(?:秒|分|時間|日|週間|週|か月|ヶ月|年)\s*前$|\bago$|公開予定|配信済み|プレミア公開|Streamed|Premiered|Scheduled|^\d{4}\/\d{1,2}\/\d{1,2}/i;

function parseLockupMeta(item) {
  const names = [];
  let views = '', published = '';
  for (const t of collectLockupTexts(item)) {
    if (RE_VIEWS_TEXT.test(t))     views = t;       // 複数あれば後ろのものを採用
    else if (RE_DATE_TEXT.test(t)) published = t;
    else                           names.push(t);   // 残りはチャンネル名(コラボは複数に分かれる)
  }
  return { channelName: names.join(''), views, published };
}

// ── ライブ配信の判定 ──────────────────────────────────────────
// 新形式(LockupView)では、サムネイルの「動画の長さ」の位置に、配信中なら「ライブ」、
// 配信予定なら「配信予定」というバッジが付く(実データ)。ここでは配信中だけを判定する。
function lockupIsLive(item) {
  const ci = item.content_image;
  for (const overlay of [...(ci?.overlays || []), ...(ci?.primary_thumbnail?.overlays || [])]) {
    for (const badge of (overlay?.badges || [])) {
      if (/^(ライブ|LIVE)$/i.test(String(badge?.text || '').trim())) return true;
    }
  }
  // バッジが無いときの予備: 「1424 人が視聴中」は配信中の動画にだけ付く
  return collectLockupTexts(item).some(t => /人が視聴中|\bwatching\b/i.test(t));
}

// 従来形式の動画(Video / CompactVideo など)の判定。
// youtubei.js の is_live は、サムネイルの情報が無いと「ライブ」と答えてしまうため使わない。
function classicIsLive(v) {
  try {
    const byBadge = Array.from(v.badges || []).some(b =>
      b?.style === 'BADGE_STYLE_TYPE_LIVE_NOW' || /^(LIVE|ライブ)$/i.test(String(b?.label || '').trim()));
    if (byBadge) return true;
    return Array.from(v.thumbnail_overlays || []).some(o => o?.type === 'ThumbnailOverlayTimeStatus' && o.style === 'LIVE');
  } catch (_) {
    return false;
  }
}

// 視聴回数に単位が無いとき("103万" など)は「回視聴」を付ける。"1424 人が視聴中" はそのまま。
function withViewsUnit(text) {
  return text && !/視聴|views?|watching|待機/i.test(text) ? text + '回視聴' : text;
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
    // 遷移先(reelWatchEndpoint)の videoId を優先し、無ければ
    // entity_id("shorts-shelf-item-{videoId}")からプレフィックスを除去して使う
    const id = item.on_tap_endpoint?.payload?.videoId
            || (item.entity_id || '').replace(/^shorts-shelf-item-/, '');
    if (!id) return null;
    const om = item.overlay_metadata || {};
    const title = om.primary_text?.text
               || (item.accessibility_text || '').split(',')[0].trim()
               || '';
    const views = om.secondary_text?.text || '';
    return { itemType: 'short', id, title, views };
  }

  // ── ReelItem (旧形式のショート。ホームのショート棚で使われることがある) ──
  if (type === 'ReelItem') {
    if (!item.id) return null;
    return { itemType: 'short', id: item.id, title: item.title?.text || '', views: item.views?.text || '' };
  }

  // ── LockupView (動画/ライブ/リリース/再生リスト) ────────────
  if (type === 'LockupView') {
    const contentType = item.content_type || 'VIDEO';
    const id = item.content_id
            || (contentType === 'SHORT' ? item.renderer_context?.command_context?.on_tap?.payload?.videoId : '')
            || '';
    if (!id) return null;

    const title = item.metadata?.title?.text || '';

    // ショート: 下の「VIDEO 以外は再生リスト扱い」に落ちると /wkt/p/{id} へ飛んでしまうため、
    // ここで先に short として返す(遷移先は通常の動画ページ /wkt/watch/{id})。
    if (contentType === 'SHORT') {
      const views = withViewsUnit(parseLockupMeta(item).views);
      return { itemType: 'short', id, title, views };
    }

    // チャンネルの推薦カード（アバターは content_image ではなく metadata.image 側）
    if (contentType === 'CHANNEL') {
      const thumb = extractLockupAvatar(item.metadata?.image) || extractLockupThumb(item.content_image);
      return { itemType: 'channel', id, title, thumbnail: toProxyThumb(thumb) };
    }

    // PLAYLIST はもちろん、リリース（アルバム/シングル等）は content_type が
    // 'PLAYLIST' 以外（'ALBUM' など）になることがあるため、動画・ライブ・
    // チャンネル以外（content_type !== 'VIDEO'）はまとめて再生リスト系カードにする。
    // これをしないと動画カード扱いになり、リリース/再生リストIDを動画IDとして
    // /wkt/back/vi/{id}/mqdefault.jpg を組み立てて404になったり、
    // /wkt/watch/{id} に誤ってリンクしてしまう。
    if (contentType !== 'VIDEO' || tabName === 'releases' || tabName === 'playlists') {
      const thumb = extractLockupThumb(item.content_image);
      return { itemType: 'playlist', id, title, count: '', thumbnail: toProxyThumb(thumb) };
    }

    // 動画時間 → content_image.overlays のバッジから取得
    let duration = '';
    for (const overlay of (item.content_image?.overlays || [])) {
      for (const badge of (overlay.badges || [])) {
        if (badge.text && /^\d/.test(badge.text)) { duration = badge.text; break; }
      }
      if (duration) break;
    }

    // 視聴回数・投稿日時 → 並び順ではなく中身で見分ける(コラボ動画はチャンネル名が混ざる)
    const meta = parseLockupMeta(item);

    const itemType = tabName === 'shorts' ? 'short' : 'video';
    return { itemType, id, title, duration, views: withViewsUnit(meta.views), published: meta.published,
             ...(lockupIsLive(item) ? { isLive: true } : {}) };
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
      views:     item.view_count?.text || '',
      published: item.published?.text || (typeof item.published === 'string' ? item.published : '') || '',
      ...(classicIsLive(item) ? { isLive: true } : {})
    };
  }

  // ── 旧形式チャンネル ────────────────────────────────────
  if (type.endsWith('Channel')) {
    const id = item.author?.id || item.id || '';
    if (!id) return null;
    return {
      itemType: 'channel',
      id,
      title: item.author?.name || '',
      thumbnail: toProxyThumb(item.author?.thumbnails?.[0]?.url || ''),
      description: item.description_snippet?.text || '',
      subscribers: item.subscriber_count?.text || item.subscribers?.text || '',
      videos: item.videos?.text || item.video_count?.text || ''
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
      thumbnail: toProxyThumb(item.thumbnails?.[0]?.url || '')
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
// CompactAutoplay を展開し、LockupView を CompactVideo 互換形式(再生リストは Playlist 形式)に変換する
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
    if (item.type !== 'LockupView') {
      if (classicIsLive(item)) item.isLive = true;
      return item;
    }

    // 再生リスト: 従来の Playlist と同じ形に直して、画面に出す。
    // ミックス("RD…")は /wkt/p/ で開けないので出さない。
    if (item.content_type === 'PLAYLIST') {
      if (/^RD/.test(item.content_id || '')) return null;
      const playlist = toSearchResult(item);
      return playlist && playlist.type === 'Playlist' ? playlist : null;
    }

    if (item.content_type !== 'VIDEO') return null;

    // チャンネル名・視聴回数・投稿日時は、並び順ではなく中身で見分ける(コラボ動画は行の並びが違う)
    const meta = parseLockupMeta(item);
    const channelName = meta.channelName;
    const publishedText = meta.published;
    const viewCountText = withViewsUnit(meta.views);
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
      view_count: { text: viewCountText },
      published: publishedText ? { text: publishedText } : null,
      ...(lockupIsLive(item) ? { isLive: true } : {})
    };
  }).filter(Boolean);
}

// コラボ動画を含む全チャンネルを channels 配列として抽出する
function extractChannels(Info) {
  const owner = Info.secondary_info?.owner;
  const author = owner?.author;

  // コラボ動画は投稿者の id が無い。以前は 'N/A' のときだけ調べていたが、
  // 実際の YouTube ではコラボ動画の id が空で返ってくるため、空の場合も調べる。
  if (!author?.id || author.id === 'N/A') {
    // "チャンネル名 • 登録者数" の形から登録者数だけを取り出す
    const pickSubsc = (text) => text.includes('•')
      ? text.split('•').slice(1).join('•').replace(/[\u200e\u200f\u2068\u2069]/g, '').trim()
      : '';

    // 0) youtubei.js が用意している Author#collaborators(使えれば一番簡単)
    try {
      const channels = Array.from(author?.collaborators || []).map(item => {
        const id   = item.renderer_context?.command_context?.on_tap?.payload?.browseId || '';
        const name = item.title?.text || '';
        if (!id || !name) return null;
        return {
          id,
          name,
          icon: item.leading_accessory?.image?.[0]?.url || '',
          subsc: pickSubsc(item.subtitle?.text || '')
        };
      }).filter(Boolean);
      if (channels.length > 0) return channels;
    } catch (_) {}

    // 共同投稿者の一覧が入っている「遷移先」の候補。YouTube や youtubei.js の版によって
    // 置き場所が違う(実データでは author.endpoint が空だった)ため、全部調べる:
    //   author.endpoint(以前の場所) / owner.endpoint / owner.avatar_stack のタップ先(コラボ動画で使われる)
    const endpoints = [
      author?.endpoint,
      owner?.endpoint,
      owner?.avatar_stack?.renderer_context?.command_context?.on_tap
    ].filter(Boolean);

    for (const ep of endpoints) {
      // (a) youtubei.js が解析済みの一覧(ListItemView)
      try {
        const channels = Array.from(ep.command?.inline_content?.custom_content?.items || []).map(item => {
          const id = item.renderer_context?.command_context?.on_tap?.payload?.browseId
                  || item.title?.runs?.[0]?.endpoint?.payload?.browseId
                  || item.title?.endpoint?.payload?.browseId
                  || '';
          const name = item.title?.text || '';
          if (!id || !name) return null;
          return {
            id,
            name,
            icon: item.leading_accessory?.image?.[0]?.url || '',
            subsc: pickSubsc(item.subtitle?.text || '')
          };
        }).filter(Boolean);
        if (channels.length > 0) return channels;
      } catch (_) {}

      // (b) 生のペイロードをたどる(解析済みの一覧が使えない場合)
      try {
        const listItems = ep.payload
          ?.panelLoadingStrategy?.inlineContent?.dialogViewModel
          ?.customContent?.listViewModel?.listItems;

        if (Array.isArray(listItems) && listItems.length > 0) {
          const channels = listItems.map(item => {
            const lvm = item?.listItemViewModel;
            if (!lvm) return null;

            const name = lvm.title?.content || '';
            const id   = lvm.title?.commandRuns?.[0]?.onTap?.innertubeCommand
                           ?.browseEndpoint?.browseId
                      || lvm.rendererContext?.commandContext?.onTap?.innertubeCommand
                           ?.browseEndpoint?.browseId
                      || '';
            const icon = lvm.leadingAccessory?.avatarViewModel?.image?.sources?.[0]?.url || '';
            const subsc = pickSubsc(lvm.subtitle?.content || '');

            if (!id || !name) return null;
            return { id, name, icon, subsc };
          }).filter(Boolean);

          if (channels.length > 0) return channels;
        }
      } catch (_) {}
    }
  }

  const primary = {
    id:    owner?.author?.id    || '',
    name:  owner?.author?.name  || '',
    icon:  owner?.author?.thumbnails?.[0]?.url || '',
    subsc: owner?.subscriber_count?.text || ''
  };
  return [primary];
}

// 再生リストの1件を共通形式に変換する(動画以外・未対応の形式は null)
function toPlaylistEntry(item) {
  if (!item) return null;
  const type = item.type || '';

  // 新形式(LockupView)
  if (type === 'LockupView') {
    const ct = item.content_type;
    if (ct !== 'VIDEO' && ct !== 'SHORT') return null;
    const videoId = item.content_id
                 || item.renderer_context?.command_context?.on_tap?.payload?.videoId
                 || '';
    if (!videoId) return null;
    const title = item.metadata?.title?.text || '';

    // ショートは行の並びが違うので、視聴回数だけ拾う
    if (ct === 'SHORT') {
      const views = withViewsUnit(parseLockupMeta(item).views);
      return { id: videoId, title, duration: '', views, published: '', channelName: '', channelId: '' };
    }

    // 再生時間 → content_image.overlays のバッジ
    let duration = '';
    for (const overlay of (item.content_image?.overlays || [])) {
      for (const badge of (overlay.badges || [])) {
        if (badge.text && /^\d/.test(badge.text)) { duration = badge.text; break; }
      }
      if (duration) break;
    }

    // チャンネル名・視聴回数・投稿日時は、並び順ではなく中身で見分ける(コラボ動画は行の並びが違う)
    const meta = parseLockupMeta(item);

    // チャンネルID → metadata.image の renderer_context
    const channelId = item.metadata?.image?.renderer_context
      ?.command_context?.on_tap?.payload?.browseId || '';

    return { id: videoId, title, duration, views: withViewsUnit(meta.views), published: meta.published, channelName: meta.channelName, channelId,
             ...(lockupIsLive(item) ? { isLive: true } : {}) };
  }

  // 旧形式
  if (type === 'PlaylistVideo') {
    if (!item.id) return null;
    const authorId = item.author?.id;
    return {
      id: item.id,
      title: item.title?.text || '',
      duration: item.duration?.text || '',
      views: '',
      published: '',
      channelName: item.author?.name || '',
      channelId: (authorId && authorId !== 'N/A') ? authorId : ''
    };
  }

  // ショート(「人気のショート動画」などの再生リスト)
  // 注意: この形式の entity_id は動画IDではなくハッシュ値なので、遷移先の videoId を使う
  if (type === 'ShortsLockupView') {
    const videoId = item.on_tap_endpoint?.payload?.videoId || '';
    if (!videoId) return null;
    return {
      id: videoId,
      title: item.overlay_metadata?.primary_text?.text
          || (item.accessibility_text || '').split(',')[0].trim(),
      duration: '',
      views: item.overlay_metadata?.secondary_text?.text || '',
      published: '', channelName: '', channelId: ''
    };
  }

  return null;
}

async function getPlaylist(id) {
  try {
    const pl = await client.getPlaylist(id);

    // 取り出し方を2通り試し、どちらかで取れなくてももう一方で補う:
    //  1) page_contents を直接たどる(従来の方法。ショートの再生リストでは空になる)
    //  2) youtubei.js が用意している pl.items(LockupView / PlaylistVideo / ショート)
    const candidates = [];
    for (const section of (pl.page_contents?.contents || [])) {
      for (const inner of (section.contents || [])) candidates.push(inner);
    }
    try {
      for (const it of Array.from(pl.items || [])) candidates.push(it);
    } catch (e) {
      // pl.items が使えない場合は 1) だけで続行
    }

    const seen = new Set();
    const items = [];
    for (const c of candidates) {
      const entry = toPlaylistEntry(c);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      items.push({ ...entry, index: items.length + 1 });
    }

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
