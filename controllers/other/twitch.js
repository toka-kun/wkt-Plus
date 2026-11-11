const express = require("express");
const router = express.Router();

// twitch-gql-queries は ESM 専用なので require() は使えない。import() で1回だけ読み込む
let mod;
const T = () => (mod ||= import("twitch-gql-queries"));

const BASE = "/other/ttv";
const TTL = 60 * 1000;
const MAX_CACHE = 100;
// メモリキャッシュのみ。Vercel/Netlifyでは再起動で消えるので効きは弱い。
const cache = new Map();

const fail = (status) => Object.assign(new Error("HTTP " + status), { status });

// list = [["クエリ名", 変数], ...]。1回の通信にまとめて送る。ttl=0 ならキャッシュしない(再生トークン用)
async function gql(list, ttl = TTL) {
  const key = ttl && JSON.stringify(list);
  const hit = ttl && cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return hit.data;

  const q = await T();
  const res = await q.gqlRequest(
    list.map(([name, vars]) => q.getQuery(q[name], vars)),
    { signal: AbortSignal.timeout(8000) }
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
  title: c.title,
  sub: c.broadcaster ? c.broadcaster.displayName : "",
  meta: `${fmt(c.viewCount)}回視聴 ・ ${day(c.createdAt)}`,
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
// 再生用トークンを取る。取れなかった(Twitch側の本人確認で弾かれた等)場合は null。その時は画面側で公式の埋め込みプレイヤーに切り替える
async function token(vars) {
  try {
    const [d] = await gql([["PlaybackAccessTokenQuery", { playerType: "site", platform: "web", ...vars }]], 0);
    const t = d.streamPlaybackAccessToken || d.videoPlaybackAccessToken;
    return t && !(t.authorization && t.authorization.isForbidden) ? t : null;
  } catch (e) {
    console.error("Twitch token error:", e.message);
    return null;
  }
}
const usher = (path, t) =>
  `https://usher.ttvnw.net/${path}.m3u8?` +
  new URLSearchParams({
    player: "twitchweb", type: "any", p: Math.floor(Math.random() * 1e7),
    allow_source: "true", allow_audio_only: "true", allow_spectre: "false",
    sig: t.signature, token: t.value,
  });

// ---- ページ ----
const page = (view, fn) => async (req, res) => {
  try {
    res.render(`other/twitch/${view}`, { json, ...(await fn(req)) });
  } catch (e) {
    console.error(`Twitch ${view} error:`, e.message);
    const status = e.status || 502;
    const message = status === 400 ? "指定が正しくありません。" : status === 404 ? "見つかりませんでした。" : "Twitchから取得できませんでした。しばらくしてからもう一度お試しください。";
    res.status(status).render("error", { title: "エラー", content: message });
  }
};

// ホーム (人気のカテゴリー)
router.get("/", page("home", async (req) => {
  const [d] = await gql([["BrowsePageAllDirectoriesQuery", { limit: 30, cursor: cursor(req), options: { sort: "VIEWER_COUNT", tags: [], requestID: "wkt" } }]], 5 * 60 * 1000);
  const c = d.directoriesWithTags || {};
  const edges = c.edges || [];
  return {
    cards: list(edges, game),
    next: c.pageInfo && c.pageInfo.hasNextPage && edges.length ? qs({ cursor: edges[edges.length - 1].cursor }) : null,
  };
}));

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

// カテゴリー (そのカテゴリーのライブ一覧)
router.get("/cat/:g", page("category", async (req) => {
  const g = need(slug(str(req.params.g, 100)));
  const [d] = await gql([["DirectoryPageGameQuery", {
    slug: g, limit: 30, cursor: cursor(req),
    options: { sort: "VIEWER_COUNT", recommendationsContext: { platform: "web" }, requestID: "wkt", tags: [] },
    sortTypeIsRecency: false, imageWidth: 440, includeCostreaming: false,
  }]]);
  if (!d.game) throw fail(404);
  const st = d.game.streams || {};
  const edges = st.edges || [];
  return {
    name: d.game.displayName,
    cards: list(edges, (n) => live(n, n.broadcaster)),
    next: st.pageInfo && st.pageInfo.hasNextPage && edges.length ? qs({ cursor: edges[edges.length - 1].cursor }) : null,
  };
}));

// チャンネル (動画 / クリップ)
router.get(["/ch/:u", "/ch/:u/:tab"], page("channel", async (req) => {
  const u = need(login(str(req.params.u, 25)));
  if (req.params.tab && req.params.tab !== "clips") throw fail(404);
  const tab = req.params.tab === "clips" ? "clips" : "videos";
  const cur = cursor(req);
  const second = tab === "clips"
    ? ["ClipsCardsUserQuery", { login: u, limit: 24, cursor: cur, criteria: { filter: "ALL_TIME" } }]
    : ["FilterableVideoTowerVideosQuery", { channelOwnerLogin: u, limit: 24, cursor: cur, broadcastType: null, videoSort: "TIME", options: {}, includePreviewBlur: false }];
  const [m, l] = await gql([["StreamMetadataQuery", { channelLogin: u }], second]);
  if (!m.user) throw fail(404);
  const con = l.user && (tab === "clips" ? l.user.clips : l.user.videos);
  const edges = (con && con.edges) || [];
  return {
    u, tab,
    name: m.user.displayName,
    avatar: m.user.profileImageURL,
    isLive: !!m.user.stream,
    game: m.user.stream && m.user.stream.game,
    cards: list(edges, tab === "clips" ? clip : vod),
    next: con && con.pageInfo && con.pageInfo.hasNextPage && edges.length ? qs({ cursor: edges[edges.length - 1].cursor }) : null,
  };
}));

// ライブ再生
router.get("/l/:u", page("live", async (req) => {
  const u = need(login(str(req.params.u, 25)));
  const [[m, v], t] = await Promise.all([
    gql([["StreamMetadataQuery", { channelLogin: u }], ["UseViewCountQuery", { channelLogin: u }]], 30 * 1000),
    token({ login: u, isLive: true, vodID: "", isVod: false }),
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
    src: stream && t ? usher(`api/channel/hls/${u}`, t) : null,
    embed: `https://player.twitch.tv/?channel=${u}&parent=${E(req.hostname)}`,
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
    src: t ? usher(`vod/${id}`, t) : null,
    embed: `https://player.twitch.tv/?video=v${id}&parent=${E(req.hostname)}`,
  };
}));

// クリップ再生 (/c/クリップID/チャンネル名)
router.get(["/c/:id", "/c/:id/:u"], page("clip", async (req) => {
  const id = need(slug(str(req.params.id, 100)));
  const u = login(str(req.params.u, 25));
  const [d] = await gql([["VideoAccessTokenClipQuery", { slug: id, platform: "web", supportedCodecs: ["AVC"] }]], 0);
  if (!d.clip) throw fail(404);
  const t = d.clip.playbackAccessToken;
  const qualities = d.clip.videoQualities && d.clip.videoQualities.length ? d.clip.videoQualities : (d.clip.assets && d.clip.assets[0] && d.clip.assets[0].videoQualities) || [];
  return {
    id, u,
    qualities: t ? qualities.map((x) => ({
      name: /p$/.test(x.quality) ? x.quality : x.quality + "p",
      url: `${x.sourceURL}${x.sourceURL.includes("?") ? "&" : "?"}sig=${t.signature}&token=${E(t.value)}`,
    })) : [],
    embed: `https://clips.twitch.tv/embed?clip=${E(id)}&parent=${E(req.hostname)}`,
  };
}));

module.exports = router;
