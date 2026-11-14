const express = require("express");
const router = express.Router();

// twitch-gql-queries は ESM 専用なので require() は使えない。import() で1回だけ読み込む
let mod;
const T = () => (mod ||= import("twitch-gql-queries"));

const BASE = "/other/ttv";
const TTL = 60 * 1000;
// twitch-gql-queries と同じ Client-Id。パッケージは headers を渡すと Client-Id を上書きして消すので、こちらで一緒に付ける。
// User-Agent は streamlink と同じ。UA の無い通信は、Twitch に断られることがある。
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0";
const MAX_CACHE = 100;
// メモリキャッシュのみ。Vercel/Netlifyでは再起動で消えるので効きは弱い。
const cache = new Map();

const fail = (status, msg) => Object.assign(new Error("HTTP " + status), { status, msg });

// 補助的な情報のクエリ用。取得に失敗してもページの表示は続けたいので、失敗したら null を返す
const soft = (p) => p.catch((e) => { console.error("Twitch soft query error:", e.message); return null; });

// list = [["クエリ名", 変数], ...]。1回の通信にまとめて送る。ttl=0 ならキャッシュしない(再生トークン用)
async function gql(list, ttl = TTL) {
  const key = ttl && JSON.stringify(list);
  const hit = ttl && cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return hit.data;

  const q = await T();
  const res = await q.gqlRequest(
    list.map(([name, vars]) => q.getQuery(q[name], vars)),
    { signal: AbortSignal.timeout(8000), headers: { "Client-Id": CLIENT_ID, "User-Agent": UA } }
  );
  const data = res.map((r) => {
    if (!r || !r.data) throw new Error((r && r.errors && r.errors[0] && r.errors[0].message) || "データがありません");
    return r.data;
  });

  if (ttl) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { time: Date.now(), data });
  }
  return data;
}

// ---- 表示用の整形 ----
const E = encodeURIComponent;
const qs = (o) => "?" + new URLSearchParams(o);
const fmt = (n) => Number(n || 0).toLocaleString("ja-JP");
const day = (s) => (s ? String(s).slice(0, 10) : "");
const img = (u, w, h) => String(u || "").replace("{width}", w).replace("{height}", h);
const dur = (s) => {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
};
const json = (v) => JSON.stringify(v === undefined ? null : v).replace(/</g, "\\u003c");

// カード = { href, img, title, sub, meta, badge, live }
const game = (g) => g && g.slug && {
  href: `${BASE}/cat/${E(g.slug)}`,
  img: img(g.templateBoxArtURL || g.avatarURL || g.boxArtURL, 285, 380),
  title: g.displayName,
  sub: g.viewersCount != null ? `${fmt(g.viewersCount)}人が視聴中` : "",
};
const live = (n, b) => n && b && {
  href: `${BASE}/l/${E(b.login)}`,
  img: img(n.templatePreviewImageURL || n.previewImageURL, 440, 248),
  live: true,
  badge: `${fmt(n.viewersCount)}人`,
  title: n.title || (b.broadcastSettings && b.broadcastSettings.title) || b.displayName,
  sub: b.displayName,
  meta: n.game ? n.game.name : "",
};
const vod = (v) => v && v.id && v.lengthSeconds != null && {
  href: `${BASE}/v/${v.id}${v.owner && v.owner.login ? "/" + E(v.owner.login) : ""}`,
  img: img(v.previewThumbnailURL || v.templatePreviewThumbnailURL, 440, 248),
  badge: dur(v.lengthSeconds),
  title: v.title || "(無題)",
  sub: v.owner ? v.owner.displayName : "",
  meta: [v.viewCount != null && `${fmt(v.viewCount)}回視聴`, day(v.publishedAt || v.createdAt)].filter(Boolean).join(" ・ "),
};
const clip = (c) => c && c.slug && {
  href: `${BASE}/c/${E(c.slug)}${c.broadcaster && c.broadcaster.login ? "/" + E(c.broadcaster.login) : ""}`,
  img: c.thumbnailURL,
  badge: dur(c.durationSeconds),
  title: c.title || c.clipTitle || "(無題)",
  sub: c.broadcaster ? c.broadcaster.displayName : "",
  meta: `${fmt(c.viewCount != null ? c.viewCount : c.clipViewCount)}回視聴 ・ ${day(c.createdAt)}`,
};
const channel = (u) => u && u.login && {
  href: `${BASE}/ch/${E(u.login)}`,
  img: u.profileImageURL,
  title: u.displayName,
  sub: u.followers && u.followers.totalCount != null ? `${fmt(u.followers.totalCount)}フォロワー` : "",
};
const list = (edges, fn) => (edges || []).map((e) => fn(e.node || e.item)).filter(Boolean);

// ---- 入力チェック ----
const login = (s) => (/^\w{1,25}$/.test(s) ? s.toLowerCase() : null);
const slug = (s) => (/^[\w.-]{1,100}$/.test(s) ? s : null);
const need = (v) => { if (!v) throw fail(400); return v; };
const str = (v, max) => String(v || "").trim().slice(0, max);
const cursor = (req) => str(req.query.cursor, 300) || null;

// ---- 再生 ----
// 再生用トークンを取る。取れなかった(Twitch側の本人確認で弾かれた等)場合は null。その時、画面は再生用のURLが無いというメッセージを出す
// playerType / platform は streamlink(Twitchの再生URLを作る定番ツール)と同じ値
async function token(vars) {
  try {
    const [d] = await gql([["PlaybackAccessTokenQuery", { playerType: "embed", platform: "site", ...vars }]], 0);
    const t = d.streamPlaybackAccessToken || d.videoPlaybackAccessToken;
    return t && !(t.authorization && t.authorization.isForbidden) ? t : null;
  } catch (e) {
    console.error("Twitch token error:", e.message);
    return null;
  }
}
const signed = (url, t) => `${url}${url.includes("?") ? "&" : "?"}sig=${t.signature}&token=${E(t.value)}`;
const httpUrl = (u) => /^https?:\/\//i.test(u || "");
// 再生URL(usher)。streamlink の最新の作りに合わせている。
// ライブは /api/v2/channel/hls/名前 に sig / token、VODは /vod/v2/ID に nauthsig / nauth(名前が違う)。
// multigroup_video だけは、ブラウザの再生ライブラリ(hls.js)で扱いやすいよう false にしている
const usher = (path, t, live) =>
  `https://usher.ttvnw.net/${path}.m3u8?` +
  new URLSearchParams({
    platform: "web", p: Math.floor(Math.random() * 999999),
    allow_source: "true", allow_audio_only: "true", playlist_include_framerate: "true",
    multigroup_video: "false", supported_codecs: "h264",
    ...(live ? { sig: t.signature, token: t.value, fast_bread: "true" } : { nauthsig: t.signature, nauth: t.value }),
  });

// ---- ページ ----
const page = (view, fn) => async (req, res) => {
  try {
    res.render(`other/twitch/${view}`, { json, ...(await fn(req)) });
  } catch (e) {
    console.error(`Twitch ${view} error:`, e.message);
    const status = e.status || 502;
    const message = e.msg || (status === 400 ? "指定が正しくありません。" : status === 404 ? "見つかりませんでした。" : "Twitchから取得できませんでした。しばらくしてからもう一度お試しください。");
    res.status(status).render("error", { title: "エラー", content: message });
  }
};

// チャンネルの存在確認。停止・削除されている時は、その理由つきで 404 にする。
// 確認クエリ自体が失敗した時は null を返し、ページの表示は続ける(補助的な確認なので)。
const REASONS = {
  DEACTIVATED: "このチャンネルは無効化されています。",
  DMCA: "著作権の申し立てにより、このチャンネルは利用できません。",
  TOS_INDEFINITE: "このチャンネルは利用規約違反により、永久に停止されています。",
  TOS_TEMPORARY: "このチャンネルは利用規約違反により、一時的に停止されています。",
  UNKNOWN: "このチャンネルは利用できません。",
};
async function channelCheck(u) {
  let o;
  try {
    o = (await gql([["ChannelShellQuery", { login: u }]]))[0].userOrError;
  } catch (e) {
    console.error("Twitch channel check error:", e.message);
    return null;
  }
  if (o && o.reason) throw fail(404, REASONS[o.reason] || REASONS.UNKNOWN);
  return o && o.userDoesNotExist === undefined && o.userError === undefined ? o : null;
}

// ホーム (検索バーと戻るボタンだけを持つ枠。中身は iframe で各ページを表示する)
router.get("/", (req, res) => res.render("other/twitch/home"));

// 検索候補(入力中に表示する。失敗したら空にして、画面側は検索履歴を出す)
router.get("/suggest", async (req, res) => {
  const q = str(req.query.q, 100);
  if (!q) return res.json([]);
  try {
    const [d] = await gql([["SearchTraySearchSuggestionsQuery", { queryFragment: q, requestID: "wkt", withOfflineChannelContent: true }]], 60 * 1000);
    const out = ((d.searchSuggestions && d.searchSuggestions.edges) || [])
      .map((e) => e && e.node)
      .filter((n) => n && n.text)
      .slice(0, 8)
      .map((n) => {
        const c = n.content;
        if (c && c.login) return { label: `${n.text}(チャンネル${c.isLive ? "・ライブ中" : ""})`, value: n.text, href: `${BASE}/${c.isLive ? "l" : "ch"}/${E(c.login)}` };
        if (c && c.game && c.game.slug) return { label: `${n.text}(カテゴリー)`, value: n.text, href: `${BASE}/cat/${E(c.game.slug)}` };
        return { label: n.text, value: n.text };
      });
    res.json(out);
  } catch (e) {
    console.error("Twitch suggest error:", e.message);
    res.json([]);
  }
});

// 検索
router.get("/s", page("search", async (req) => {
  const q = str(req.query.q, 100);
  if (!q) return { q, sections: [] };
  const [d] = await gql([["SearchResultsPageSearchResultsQuery", { query: q, options: { targets: null, shouldSkipDiscoveryControl: false }, requestID: "wkt", platform: "web" }]]);
  const s = d.searchFor || {};
  const items = (x) => (x && x.edges ? x.edges.map((e) => e.item) : []);
  const sections = [
    { heading: "ライブ中", kind: "wide", cards: items(s.relatedLiveChannels).map((i) => i && live(i.stream, i.stream && i.stream.broadcaster)).filter(Boolean) },
    { heading: "チャンネル", kind: "channel", cards: items(s.channels).map(channel).filter(Boolean) },
    { heading: "カテゴリー", kind: "game", cards: items(s.games).map(game).filter(Boolean) },
    { heading: "動画", kind: "wide", cards: items(s.videos).map(vod).filter(Boolean) },
  ].filter((x) => x.cards.length);
  return { q, sections };
}));

// カテゴリー: /cat = 人気のカテゴリー一覧、/cat/名前 = そのカテゴリーのライブ、/cat/名前/clips = そのカテゴリーのクリップ
router.get(["/cat", "/cat/:g", "/cat/:g/:tab"], page("category", async (req) => {
  const cur = cursor(req);
  if (!req.params.g) {
    // ホーム画面は、人気の上位30件だけを表示する(「もっと見る」は無い)
    const [d] = await gql([["BrowsePageAllDirectoriesQuery", { limit: 30, cursor: null, options: { sort: "VIEWER_COUNT", tags: [], requestID: "wkt" } }]], 5 * 60 * 1000);
    const c = d.directoriesWithTags || {};
    return { mode: "list", g: "", name: "", cards: list(c.edges, game), next: null };
  }
  const g = need(slug(str(req.params.g, 100)));
  if (req.params.tab && req.params.tab !== "clips") throw fail(404);

  if (req.params.tab === "clips") {
    const get = (filter) => gql([["ClipsCardsGameQuery", { categorySlug: g, limit: 24, cursor: cur, criteria: { filter } }]]).then((r) => r[0].game);
    let gm = await get("LAST_WEEK");
    // 直近1週間にクリップが無い小さなカテゴリーは、全期間にする
    if (gm && !cur && !(gm.clips && gm.clips.edges && gm.clips.edges.length)) gm = (await get("ALL_TIME")) || gm;
    if (!gm) throw fail(404);
    const con = gm.clips || {};
    const edges = con.edges || [];
    return {
      mode: "clips", g, name: gm.displayName,
      cards: list(edges, clip),
      next: con.pageInfo && con.pageInfo.hasNextPage && edges.length ? qs({ cursor: edges[edges.length - 1].cursor }) : null,
    };
  }

  const [d] = await gql([["DirectoryPageGameQuery", {
    slug: g, limit: 30, cursor: cur,
    options: { sort: "VIEWER_COUNT", recommendationsContext: { platform: "web" }, requestID: "wkt", tags: [] },
    sortTypeIsRecency: false, imageWidth: 440, includeCostreaming: false,
  }]]);
  if (!d.game) throw fail(404);
  const st = d.game.streams || {};
  const edges = st.edges || [];
  return {
    mode: "live", g, name: d.game.displayName,
    cards: list(edges, (n) => live(n, n.broadcaster)),
    next: st.pageInfo && st.pageInfo.hasNextPage && edges.length ? qs({ cursor: edges[edges.length - 1].cursor }) : null,
  };
}));

// チャンネル: /ch/名前 = 棚(ホーム)、/ch/名前/videos = 動画、/ch/名前/clips = クリップ
const SHELF_TITLES = {
  LATEST_BROADCASTS: "最近の配信", LATEST_NON_BROADCASTS: "ハイライトとアップロード", TOP_CLIPS: "人気のクリップ",
  ALL_VIDEOS: "すべての動画", LONG_VIDEOS: "長い動画", SHORT_VIDEOS: "短い動画",
};
const shelfItem = (i) => (i && i.slug ? clip(i) : vod(i));

router.get(["/ch/:u", "/ch/:u/:tab"], page("channel", async (req) => {
  const u = need(login(str(req.params.u, 25)));
  const t = req.params.tab;
  if (t && t !== "videos" && t !== "clips") throw fail(404);
  const cur = cursor(req);

  // 紹介欄と存在確認は補助。取得に失敗してもページは表示する
  const [shell, about, [m]] = await Promise.all([
    channelCheck(u),
    soft(gql([["ChannelRootAboutPanelQuery", { channelLogin: u, skipSchedule: false }]])),
    gql([["StreamMetadataQuery", { channelLogin: u }]]),
  ]);
  if (!m.user) throw fail(404);

  let tab = t || "home", shelves = [], cards = [], next = null;
  if (tab === "home") {
    const r = await soft(gql([["ChannelVideoShelvesQuery", { channelLogin: u, first: 6, cursor: null, options: null, includePreviewBlur: false }]]));
    const edges = (r && r[0].user && r[0].user.videoShelves && r[0].user.videoShelves.edges) || [];
    shelves = edges.map((e) => e && e.node).filter((n) => n && n.items && n.items.length)
      .map((n) => ({
        heading: SHELF_TITLES[n.type] || n.title,
        // 見出しの「すべて見る」の行き先(クリップの棚はクリップ、動画の棚は動画。それ以外はリンクなし)
        more: n.type === "TOP_CLIPS" ? "clips" : /VIDEOS|BROADCASTS/.test(n.type) ? "videos" : "",
        cards: n.items.map(shelfItem).filter(Boolean),
      }))
      .filter((x) => x.cards.length);
    if (!shelves.length) tab = "videos"; // 棚が取れない時は動画一覧にする
  }
  if (tab !== "home") {
    const q = tab === "clips"
      ? ["ClipsCardsUserQuery", { login: u, limit: 24, cursor: cur, criteria: { filter: "ALL_TIME" } }]
      : ["FilterableVideoTowerVideosQuery", { channelOwnerLogin: u, limit: 24, cursor: cur, broadcastType: null, videoSort: "TIME", options: {}, includePreviewBlur: false }];
    const [l] = await gql([q]);
    const con = l.user && (tab === "clips" ? l.user.clips : l.user.videos);
    const edges = (con && con.edges) || [];
    cards = list(edges, tab === "clips" ? clip : vod);
    next = con && con.pageInfo && con.pageInfo.hasNextPage && edges.length ? qs({ cursor: edges[edges.length - 1].cursor }) : null;
  }

  const au = about && about[0].user;
  const ach = au && au.channel;
  return {
    u, tab, shelves, cards, next,
    name: m.user.displayName,
    avatar: m.user.profileImageURL,
    banner: shell && httpUrl(shell.bannerImageURL) ? shell.bannerImageURL : "",
    isLive: !!m.user.stream,
    game: m.user.stream && m.user.stream.game,
    description: (au && au.description) || "",
    followers: au && au.followers ? au.followers.totalCount : null,
    badge: au && au.roles ? (au.roles.isPartner ? "パートナー" : au.roles.isAffiliate ? "アフィリエイト" : "") : "",
    team: au && au.primaryTeam ? au.primaryTeam.displayName : "",
    lastGame: au && au.lastBroadcast && au.lastBroadcast.game ? au.lastBroadcast.game.displayName : "",
    socials: ((ach && ach.socialMedias) || []).filter((x) => x && httpUrl(x.url)).map((x) => ({ title: x.title || x.name, url: x.url })),
    nextStream: ach && ach.schedule && ach.schedule.nextSegment ? ach.schedule.nextSegment.startAt : null,
  };
}));

// ライブ再生
router.get("/l/:u", page("live", async (req) => {
  const u = need(login(str(req.params.u, 25)));
  const [[m, v], t, , lv] = await Promise.all([
    gql([["StreamMetadataQuery", { channelLogin: u }], ["UseViewCountQuery", { channelLogin: u }]], 30 * 1000),
    token({ login: u, isLive: true, vodID: "", isVod: false }),
    channelCheck(u),
    soft(gql([["UseLiveQuery", { channelLogin: u }]], 30 * 1000)),
  ]);
  if (!m.user) throw fail(404);
  const stream = m.user.stream;
  return {
    u,
    name: m.user.displayName,
    avatar: m.user.profileImageURL,
    title: (m.user.lastBroadcast && m.user.lastBroadcast.title) || "",
    game: stream && stream.game,
    isLive: !!stream,
    viewers: v.user && v.user.stream ? v.user.stream.viewersCount : null,
    startedAt: lv && lv[0].user && lv[0].user.stream ? lv[0].user.stream.createdAt : null,
    src: stream && t ? usher(`api/v2/channel/hls/${u}`, t, true) : null,
  };
}));

// VOD再生 (/v/動画ID/チャンネル名 と、チャンネル名まで付けると、タイトルなどの詳細も出る)
router.get(["/v/:id", "/v/:id/:u"], page("vod", async (req) => {
  const id = need(/^\d{1,15}$/.test(req.params.id) ? req.params.id : null);
  const u = login(str(req.params.u, 25));
  const [t, meta] = await Promise.all([
    token({ login: "", isLive: false, vodID: id, isVod: true }),
    u ? gql([["VideoMetadataQuery", { channelLogin: u, videoID: id }]]).then((r) => r[0]).catch(() => null) : null,
  ]);
  const video = meta && meta.video;
  return {
    id, u,
    title: (video && video.title) || "",
    name: video && video.owner ? video.owner.displayName : "",
    avatar: meta && meta.user ? meta.user.profileImageURL : "",
    game: video && video.game,
    views: video ? video.viewCount : null,
    date: video ? day(video.publishedAt) : "",
    src: t ? usher(`vod/v2/${id}`, t, false) : null,
  };
}));

// クリップ再生 (/c/クリップID。チャンネル名を付けても付けなくてもよい)
const CLIP_TYPES = { SOURCE: "通常", RECOMPOSED: "縦向き", ENHANCED: "強化版" };
const qname = (x) => (/p$/.test(x) ? x : x + "p");
router.get(["/c/:id", "/c/:id/:u"], page("clip", async (req) => {
  const id = need(slug(str(req.params.id, 100)));
  const u = login(str(req.params.u, 25));
  // 再生に必要なのは1つ目だけ。詳細とダウンロードは補助なので、失敗してもページは表示する
  const [[d], info, dl] = await Promise.all([
    gql([["VideoAccessTokenClipQuery", { slug: id, platform: "web", supportedCodecs: ["AVC"] }]], 0),
    soft(gql([["ShareClipRenderStatusQuery", { slug: id }]], 0)),
    soft(gql([["ClipsDownloadButtonQuery", { slug: id }]], 0)),
  ]);
  if (!d.clip) throw fail(404);
  const t = d.clip.playbackAccessToken;
  const qualities = d.clip.videoQualities && d.clip.videoQualities.length ? d.clip.videoQualities : (d.clip.assets && d.clip.assets[0] && d.clip.assets[0].videoQualities) || [];

  const c = info && info[0].clip;
  const dc = dl && dl[0].clip;
  const dt = dc && dc.playbackAccessToken;
  return {
    id, u,
    qualities: t ? qualities.map((x) => ({ name: qname(x.quality), url: signed(x.sourceURL, t) })) : [],
    info: c && {
      title: c.title || "",
      views: c.viewCount,
      date: day(c.createdAt),
      duration: dur(c.durationSeconds),
      game: c.game ? { name: c.game.displayName || c.game.name, slug: c.game.slug } : null,
      channel: c.broadcaster ? { login: c.broadcaster.login, name: c.broadcaster.displayName, avatar: c.broadcaster.profileImageURL } : null,
      curator: c.curator ? c.curator.displayName : "",
    },
    downloads: dt ? (dc.assets || []).flatMap((a) => (a.downloadQualities || []).filter((q) => httpUrl(q.sourceURL)).map((q) => ({
      name: `${CLIP_TYPES[a.type] || a.type} ${qname(q.quality)}`,
      url: signed(q.sourceURL, dt),
    }))) : [],
  };
}));

module.exports = router;
