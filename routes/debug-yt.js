"use strict";
// ─────────────────────────────────────────────────────────────
// 【一時的な確認用ページ】YouTube から実際に返ってくるデータを、ブラウザで見るためのものです。
//
//   使い方: サイトにログインした状態で、次のURLを開きます。
//     https://(あなたのサイトのアドレス)/wkt-debug?key=d06702f5646b
//
//   ・「まとめて全部取得」ボタンを押すと、必要なデータを自動で全部集めて、1つのファイルに保存できます。
//   ・下の ENABLED_UNTIL の日付を過ぎると、自動的に使えなくなります(404になります)。
//   ・使い終わったら、このファイルと server.js の「wkt-debug」の1行を削除してください。
// ─────────────────────────────────────────────────────────────
const express = require("express");
const fs = require("fs");
const path = require("path");
const serverYt = require("../server/youtube.js");

const router = express.Router();

const DEBUG_KEY = "d06702f5646b"; // URL の ?key= に付ける合言葉(好きな文字列に変えてOK)
const ENABLED_UNTIL = new Date("2026-10-21T00:00:00+09:00"); // この日時を過ぎると無効
const TIMEOUT_MS = 40000;

// ── 共通の道具 ──────────────────────────────────────────────
const esc = (t) => String(t ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const kind = (x) => (x?.type === "LockupView" ? `LockupView/${x.content_type}` : (x?.type ?? "(none)"));

function hist(arr) {
  const m = {};
  for (const x of Array.from(arr || [])) m[kind(x)] = (m[kind(x)] || 0) + 1;
  return m;
}

const unwrap = (x) => (x?.type === "RichItem" && x.content ? x.content : x);

// 1件の中身を、読みやすい小さなデータにまとめる
function brief(n) {
  if (!n) return n;
  const o = {
    kind: kind(n),
    id: n.id ?? n.content_id ?? n.entity_id,
    title: n.title?.text ?? n.metadata?.title?.text ?? n.overlay_metadata?.primary_text?.text,
  };
  // 飛び先の動画ID(ショートやLockupViewでは、idと食い違うことがある)
  const ep = n.on_tap_endpoint?.payload?.videoId
    ?? n.renderer_context?.command_context?.on_tap?.payload?.videoId
    ?? n.endpoint?.payload?.videoId;
  if (ep) o.endpoint_video_id = ep;
  if (n.first_videos?.length) o.first_video_id = n.first_videos[0]?.id;
  if (n.accessibility_text) o.accessibility_text = n.accessibility_text;
  if (n.author) o.author = { id: n.author.id, name: n.author.name, thumbs: n.author.thumbnails?.length };
  const rows = n.metadata?.metadata?.metadata_rows;
  if (rows) o.rows = rows.map((r) => (r.metadata_parts || []).map((p) => p.text?.text ?? null));
  if (n.metadata?.image) o.avatar_kind = n.metadata.image.type;
  const badges = [];
  const ci = n.content_image;
  for (const ov of [...(ci?.overlays || []), ...(ci?.primary_thumbnail?.overlays || [])]) {
    for (const b of (ov?.badges || [])) if (b?.text) badges.push(b.text);
  }
  if (badges.length) o.badges = badges;
  for (const k of ["view_count", "published", "duration", "video_count", "subscriber_count", "description_snippet"]) {
    if (n[k]?.text) o[k] = n[k].text;
  }
  if (!o.title) o.keys = Object.keys(n).slice(0, 15);
  return o;
}

// 種類ごとに最大 per 件ずつサンプルを取る(各種類の最初の1件には、持っている項目名 props も付ける)
function samples(arr, per = 3) {
  const count = {};
  const out = [];
  for (const x of Array.from(arr || [])) {
    const k = kind(x);
    count[k] = (count[k] || 0) + 1;
    if (count[k] <= per) {
      const b = brief(x);
      if (count[k] === 1 && x && typeof x === "object") b.props = Object.keys(x).slice(0, 25);
      out.push(b);
    }
  }
  return out;
}

// 1件の「動画ID候補」(ショートは entity_id と遷移先IDの両方)
function rawIds(n) {
  const ids = [n?.id, n?.content_id, n?.on_tap_endpoint?.payload?.videoId,
    n?.renderer_context?.command_context?.on_tap?.payload?.videoId,
    (n?.entity_id || "").replace(/^shorts-shelf-item-/, "")];
  return [...new Set(ids.filter((x) => typeof x === "string" && x))];
}

// 「サイトが付けた分類」と「YouTubeの元の種類」の対応表と、表示されずに消えたものを調べる
function crossTab(normItems, rawItems) {
  const kindById = new Map();
  const rawList = Array.from(rawItems || []).map(unwrap);
  for (const r of rawList) for (const id of rawIds(r)) kindById.set(id, kind(r));
  const table = {};
  const annotated = [];
  const shownIds = new Set();
  for (const it of normItems) {
    shownIds.add(it.id);
    const k = kindById.get(it.id) || "(元データ不明)";
    const key = it.itemType + " ← " + k;
    table[key] = (table[key] || 0) + 1;
    annotated.push({ ...it, 元の種類: k });
  }
  const dropped = {};
  for (const r of rawList) {
    if (!rawIds(r).some((id) => shownIds.has(id))) dropped[kind(r)] = (dropped[kind(r)] || 0) + 1;
  }
  return { table, annotated, dropped };
}

// 検索結果が、検索ページ(search.ejs / back/search.ejs)でどう扱われるか
function templateCheckSearch(norm) {
  if (!norm) return { 結果: "検索に失敗(null)→ /wkt/s は ytsr(/ss)に切り替わります" };
  const L = Array.from(norm.results || []);
  const t = (x) => x?.type || "";
  const videos = L.filter((x) => t(x).endsWith("Video"));
  const playlists = L.filter((x) => t(x).endsWith("Playlist"));
  const channels = L.filter((x) => t(x).endsWith("Channel"));
  const shown = videos.length + playlists.length + channels.length;
  const ignored = L.filter((x) => !/(Video|Playlist|Channel)$/.test(t(x)));
  return {
    受け取った件数: L.length,
    画面に出る: { 動画: videos.length, 再生リスト: playlists.length, チャンネル: channels.length },
    "画面に出ない(種類ごと)": hist(ignored),
    "修正前の search.ejs で落ちる(500になる)条件": {
      動画の作者アイコンが無い: videos.filter((x) => !x.author?.thumbnails?.[0]?.url).length,
      "再生リストの first_videos が無い": playlists.filter((x) => !x.first_videos).length,
      チャンネルのアイコンが無い: channels.filter((x) => !x.author?.thumbnails?.[0]?.url).length,
    },
    "/wkt/s の動き": L.length === 0 ? "0件 → ytsr(/ss)に切り替わる"
      : shown === 0 ? "結果はあるのに何も表示されない(空の画面)" : "通常表示",
  };
}

// 関連動画の生データが、関連動画ページ(back/next.ejs)でどう扱われるか
function templateCheckNext(feed) {
  const L = Array.from(feed || []);
  const ok = (x) => /(Video|Playlist|Channel)$/.test(x?.type || "");
  return { 件数: L.length, 画面に出る: L.filter(ok).length, "画面に出ない(種類ごと)": hist(L.filter((x) => !ok(x))) };
}

const summarize = (items) => ({
  count: items.length,
  kinds: hist(items),
  samples: samples(items),
});

function tabItems(t) {
  const c = t?.current_tab?.content;
  if (c?.type === "SectionList") {
    return (c.contents || []).flatMap((s) => (s.contents || []).flatMap((i) => (i?.type === "Grid" ? i.items : [i])));
  }
  return c?.contents || c?.items || t?.videos || [];
}

// 再生リストのIDを自動で探す(「まとめて取得」で、入力が空のときに使う)。"RD…" のミックスは除く
function pickPlaylistId(items) {
  for (const x of Array.from(items || [])) {
    const n = unwrap(x);
    const isPl = n?.type === "Playlist" || n?.type === "GridPlaylist"
      || (n?.type === "LockupView" && n.content_type === "PLAYLIST");
    const id = n?.id ?? n?.content_id;
    if (isPl && typeof id === "string" && id.startsWith("PL")) return id;
  }
  return null;
}

// 結果を読みやすい文字にする(長すぎる文字は切る)
const fmt = (result) => JSON.stringify(result, (k, v) => (typeof v === "string" && v.length > 140 ? v.slice(0, 140) + "…" : v), 2);

// ── YouTube から取る(生データ用) ──────────────────────────────
// サイト本体(server.js)が使っているクライアントをそのまま使う。別のクライアントで取ると、
// サイトが受け取るデータと食い違うことがあるため。server.js が setClient を呼ぶ瞬間に受け取る。
let siteClient = null;
{
  const originalSetClient = serverYt.setClient;
  serverYt.setClient = function (c) {
    siteClient = c;
    return originalSetClient.apply(this, arguments);
  };
}
let ownClient = null; // サイト本体のクライアントがまだ無いときだけ使う予備
async function getRaw() {
  if (siteClient) return siteClient;
  if (!ownClient) {
    const { Innertube } = await import("youtubei.js");
    ownClient = await Innertube.create({ lang: "ja", location: "JP" });
  }
  return ownClient;
}

const withTimeout = (p) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error("時間切れ(" + TIMEOUT_MS / 1000 + "秒)")), TIMEOUT_MS)),
]);

// 失敗しても全体を止めず、エラーの内容を結果に書く(生データは必ず残す)
async function attempt(fn) {
  try { return { value: await fn() }; } catch (e) { return { error: (e && e.message) || String(e) }; }
}
const errSection = (r) => ({ エラー: r.error });

// サイトの画面ファイル(ejs)に、サイトと同じ値を渡して実際に描画してみる。
// 「500エラーになるか」「どんなリンクが何個できるか」が、推測ではなく実際の結果で分かる。
function renderCheck(app, view, locals) {
  return new Promise((resolve) => {
    try {
      app.render(view, locals, (err, html) => {
        if (err) {
          resolve({
            結果: "描画エラー(実際のサイトではこの画面が500になります)",
            理由: String(err.message || err).split("\n").filter(Boolean).slice(0, 3).join(" | "),
          });
          return;
        }
        const count = (re) => (html.match(re) || []).length;
        resolve({
          結果: "描画OK",
          html_文字数: html.length,
          "リンク先の内訳": {
            "動画ページ /wkt/watch/": count(/href="\/wkt\/watch\//g),
            "再生リスト /wkt/p/": count(/href="\/wkt\/p\//g),
            "チャンネル /wkt/c/": count(/href="\/wkt\/c\//g),
          },
        });
      });
    } catch (e) {
      resolve({ 結果: "描画エラー", 理由: (e && e.message) || String(e) });
    }
  });
}
const doRender = (ctx, view, locals) => (ctx && ctx.render ? ctx.render(view, locals) : { 結果: "(描画チェックなし)" });

const countBy = (items, f) => items.reduce((m, i) => ((m[f(i)] = (m[f(i)] || 0) + 1), m), {});

// ── 各調査 ─────────────────────────────────────────────────
const PARTS = {
  // 動作環境と、サーバー上の youtube.js がどの版かを調べる
  async env() {
    let ytjs;
    try {
      ytjs = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "node_modules", "youtubei.js", "package.json"), "utf8")).version;
    } catch (e) { ytjs = "不明(" + e.message + ")"; }
    let code = {};
    try {
      const src = fs.readFileSync(path.join(__dirname, "..", "server", "youtube.js"), "utf8");
      let back = "";
      try { back = fs.readFileSync(path.join(__dirname, "..", "controllers", "tube", "back.js"), "utf8"); } catch (e) { back = ""; }
      code = {
        short_fix: src.includes("contentType === 'SHORT'"),
        shorts_shelf_fix: src.includes("shelf.items"),
        collaborators_fix: src.includes("author?.collaborators"),
        playlist_items_fix: src.includes("toPlaylistEntry"),
        related_videos_panel_fix: back.includes("normalizeWatchNextFeed"),
        collab_meta_fix: src.includes("parseLockupMeta"),
      };
    } catch (e) { code = "読み取り失敗: " + e.message; }
    return {
      node: process.version,
      youtubei_js: ytjs,
      "server/youtube.js の状態": code,
      "生データの取得に使うクライアント": siteClient ? "サイト本体と同じもの" : "確認ページ専用(サイト本体のクライアントがまだ初期化されていません)",
      "この確認ページがカバーする範囲": {
        "/wkt/s 検索ページ (search.ejs, back/search.ejs): 実際の描画まで確認": "[search]",
        "動画ページ (watch / edu / nocookie) の題名・公開日・再生回数・いいね・説明・チャンネル": "[info]",
        "関連動画 (watch各ページ / back/next.ejs)": "[info]",
        "コメント欄 (back/comment.ejs)": "[comments]",
        "チャンネルのヘッダーとホーム (channel.ejs)": "[home]",
        "チャンネルの各タブと並び替え (/c/:id/tab/*)": "[tab:videos] [tab:shorts] [tab:live] [tab:playlists] [tab:releases]",
        "再生リストページ (playlist.ejs)": "[playlist]",
      },
      time: new Date().toISOString(),
    };
  },

  async search({ q }, ctx) {
    const yt = await getRaw();
    const raw = await yt.search(q, { type: "all" });
    if (ctx) ctx.found.playlistId = ctx.found.playlistId || pickPlaylistId(raw.results);
    const r = await attempt(() => serverYt.search(q));
    const norm = r.value;
    return {
      "■ YouTubeから届いた生データ": summarize(raw.results),
      "■ 検索ページが受け取る形(youtube.js の search の戻り値)": r.error ? errSection(r) : {
        count: norm?.results?.length ?? null,
        kinds: hist(norm?.results),
        samples: samples(norm?.results, 3),
      },
      "■ 検索ページ(search.ejs / back/search.ejs)での扱い": r.error ? errSection(r) : templateCheckSearch(norm),
      "■ 実際に描画してみた結果(/wkt/s のページ)": r.error || !norm?.results?.length
        ? { 結果: "描画せず(取得失敗または0件 → サイトは /ss に切り替える)" }
        : await doRender(ctx, "tube/search", { res: norm, query: q, page: 1 }),
      "■ 実際に描画してみた結果(/wkt/back/search のページ)": r.error || !norm
        ? { 結果: "描画せず" }
        : await doRender(ctx, "tube/back/search", { res: norm, query: q, page: 1 }),
    };
  },

  async home({ c }, ctx) {
    const yt = await getRaw();
    const ch = await yt.getChannel(c);
    const rows = ch.header?.content?.metadata?.metadata_rows;
    const header = {
      title: ch.metadata?.title,
      avatar_url: ch.metadata?.avatar?.[0]?.url,
      description_length: String(ch.metadata?.description || "").length,
      banner_url: ch.header?.content?.banner?.image?.[0]?.url,
      header_type: ch.header?.type,
      header_content_type: ch.header?.content?.type,
      "表示される行(channel.ejs の row0-part0 / row1-part1 / row1-part0)": [
        rows?.[0]?.metadata_parts?.[0]?.text != null ? String(rows[0].metadata_parts[0].text) : null,
        rows?.[1]?.metadata_parts?.[1]?.text != null ? String(rows[1].metadata_parts[1].text) : null,
        rows?.[1]?.metadata_parts?.[0]?.text != null ? String(rows[1].metadata_parts[0].text) : null,
      ],
      all_rows: Array.from(rows || []).map((r) => (r.metadata_parts || []).map((p) => (p.text != null ? String(p.text) : null))),
    };
    const rawShelves = Array.from(ch.shelves || []);
    const shelvesRaw = rawShelves.map((s) => {
      const items = s.content?.items || s.content?.playlists || s.items || [];
      return { title: s.title?.text, shelf_type: s.type, content_type: s.content?.type, ...summarize(items) };
    });
    const r = await attempt(() => serverYt.getChannel(c));
    const shown = r.error ? errSection(r) : r.value == null ? { エラー: "サイト側の getChannel が null を返しました(取得失敗)" } : (r.value.shelves || []).map((s, idx) => {
      const rawItems = rawShelves[idx]?.content?.items || rawShelves[idx]?.content?.playlists || rawShelves[idx]?.items || [];
      const x = crossTab(s.items, rawItems);
      return {
        title: s.title?.text ?? s.title,
        raw_count: Array.from(rawItems).length,
        shown_count: s.items.length,
        "分類の対応表(画面側の分類 ← YouTubeの元の種類)": x.table,
        "表示されずに消えたもの(元の種類)": x.dropped,
        samples: x.annotated.slice(0, 4),
      };
    });
    return {
      "■ チャンネルのヘッダー(生データ。channel.ejs が使う項目)": header,
      "■ ホームタブの棚(生データ)": { shelf_count: shelvesRaw.length, shelves: shelvesRaw },
      "■ ホームタブの表示(サイトが画面に出す形)": shown,
      "■ 実際に描画してみた結果(/wkt/c/ のページ)": r.error || r.value == null
        ? { 結果: "描画せず(サイト側の getChannel が失敗)" }
        : await doRender(ctx, "tube/channel", { ...r.value, channelId: c }),
    };
  },

  async tab({ c, tab }, ctx) {
    const yt = await getRaw();
    const ch = await yt.getChannel(c);
    const fn = { videos: "getVideos", shorts: "getShorts", live: "getLiveStreams", playlists: "getPlaylists", releases: "getReleases" }[tab];
    if (!fn || typeof ch[fn] !== "function") return { 結果: "このタブはありません" };
    const feed = await ch[fn]();
    const raw = tabItems(feed).map(unwrap);
    if (ctx && tab === "playlists") ctx.found.playlistId = ctx.found.playlistId || pickPlaylistId(raw);
    const r = await attempt(() => serverYt.getChannelTab(c, tab, "newest"));
    if (r.error || !r.value) {
      return {
        ["■ " + tab + "タブ(生データ)"]: summarize(raw),
        "■ サイトが画面に出す形(変換後)": { エラー: r.error || "サイト側の getChannelTab が null を返しました" },
      };
    }
    const norm = r.value;
    const x = crossTab(norm.items, raw);
    const out = {
      ["■ " + tab + "タブ(生データ)"]: summarize(raw),
      "■ サイトが画面に出す形(変換後)": {
        raw_count: raw.length,
        shown_count: norm.items.length,
        itemTypes: countBy(norm.items, (i) => i.itemType),
        "分類の対応表(画面側の分類 ← YouTubeの元の種類)": x.table,
        "表示されずに消えたもの(元の種類)": x.dropped,
        samples: x.annotated.slice(0, 6),
      },
    };
    if (tab === "videos") {
      let filters = null;
      try {
        filters = Array.from(feed.filters || []).map((f) => (typeof f === "string" ? f : (f?.label ?? f?.title ?? f?.type ?? "?")));
      } catch (e) { filters = "取得エラー: " + e.message; }
      const sorts = { newest: { count: norm.items.length, first_ids: norm.items.slice(0, 3).map((i) => i.id) } };
      for (const sort of ["popular", "oldest"]) {
        try {
          const r = await serverYt.getChannelTab(c, "videos", sort);
          sorts[sort] = { count: r.items.length, first_ids: r.items.slice(0, 3).map((i) => i.id) };
        } catch (e) { sorts[sort] = "エラー: " + e.message; }
      }
      out["■ 並び替え(新しい順 / 人気順 / 古い順)"] = {
        "YouTubeが返した並び替えの選択肢": filters,
        結果: sorts,
        "人気順・古い順が新しい順と違う結果になっているか": {
          人気順: sorts.popular?.first_ids?.[0] !== undefined && sorts.popular.first_ids[0] !== sorts.newest.first_ids[0],
          古い順: sorts.oldest?.first_ids?.[0] !== undefined && sorts.oldest.first_ids[0] !== sorts.newest.first_ids[0],
        },
      };
    }
    return out;
  },

  async info({ v }, ctx) {
    const yt = await getRaw();
    const i = await yt.getInfo(v);
    const feed = Array.from(i.watch_next_feed || []);
    let norm = [];
    let normError = null;
    try { norm = serverYt.normalizeWatchNextFeed(i.watch_next_feed) || []; } catch (e) { normError = e.message; }
    let channels;
    let channelsError = null;
    try { channels = serverYt.extractChannels(i); } catch (e) { channels = []; channelsError = e.message; }
    const ch0 = Array.isArray(channels) ? channels[0] : undefined;
    const pi = i.primary_info;
    const au = i.secondary_info?.owner?.author;
    let collab;
    try {
      collab = Array.from(au?.collaborators || []).map((c) => ({ name: c.title?.text, id: c.renderer_context?.command_context?.on_tap?.payload?.browseId }));
    } catch (e) { collab = "取得エラー: " + e.message; }
    let endpointCommand = null;
    try { endpointCommand = au?.endpoint?.command?.type ?? null; } catch (e) { endpointCommand = "取得エラー: " + e.message; }
    const buttons = pi?.menu?.top_level_buttons;
    // 動画ページ(watch / edu / nocookie)に渡される値。controllers の作り方と同じ式
    const videoInfo = {
      title: pi?.title?.text || "",
      channelId: ch0?.id,
      channelName: ch0?.name,
      channelIcon: ch0?.icon,
      channelSubsc: ch0?.subsc,
      published: String(pi?.published ?? ""),
      viewCount: pi?.view_count?.view_count?.text || "",
      likeCount: buttons?.short_like_count || buttons?.like_count || i.basic_info?.like_count || "",
      description: i.secondary_info?.description?.text || "",
    };
    const empty = Object.entries(videoInfo).filter(([, val]) => val === "" || val == null).map(([k]) => k);
    const rawIdSet = new Set(norm.map((n) => n.id));
    const expanded = feed.flatMap((x) => (x?.type === "CompactAutoplay" && Array.isArray(x.videos) ? x.videos : [x]));
    const dropped = {};
    for (const r of expanded) if (!rawIds(r).some((id) => rawIdSet.has(id))) dropped[kind(r)] = (dropped[kind(r)] || 0) + 1;
    return {
      "■ 動画の基本情報(生データ)": {
        has_primary_info: !!pi,
        primary_info_keys: pi ? Object.keys(pi).slice(0, 25) : null,
        primary_title: pi?.title?.text,
        basic_title: i.basic_info?.title,
        published: String(pi?.published ?? ""),
        view_count_node_keys: pi?.view_count ? Object.keys(pi.view_count) : null,
        top_level_buttons: Array.isArray(buttons) ? "配列(short_like_count / like_count は取れない → basic_info.like_count を使う)" : (buttons ? "配列ではない" : "なし"),
        like_count_basic_info: i.basic_info?.like_count,
        has_secondary_info: !!i.secondary_info,
        description_length: String(i.secondary_info?.description?.text || "").length,
        owner_name: i.secondary_info?.owner?.author?.name,
        owner_id: i.secondary_info?.owner?.author?.id ?? null,
        "コラボ動画の手がかり": (() => {
          const os = i.secondary_info?.owner;
          const tap = os?.avatar_stack?.renderer_context?.command_context?.on_tap;
          let items = null;
          try { items = Array.from(tap?.command?.inline_content?.custom_content?.items || []).length; } catch (e) { items = "取得エラー: " + e.message; }
          return {
            collaborators: collab,
            author_endpoint_command: endpointCommand,
            owner_keys: os ? Object.keys(os) : null,
            owner_endpoint: os?.endpoint?.name ?? null,
            "avatar_stack(コラボ動画のアイコンの束)": os?.avatar_stack ? {
              avatars: os.avatar_stack.avatars?.length,
              text: os.avatar_stack.text?.text,
              on_tap: tap?.name ?? null,
              on_tap_command: tap?.command?.type ?? null,
              解析済みの一覧の件数: items,
              生の一覧の件数: tap?.payload?.panelLoadingStrategy?.inlineContent?.dialogViewModel?.customContent?.listViewModel?.listItems?.length ?? null,
            } : null,
          };
        })(),
      },
      "■ 動画ページに渡される値(controllers と同じ作り方)": { videoInfo: { ...videoInfo, description: "(" + videoInfo.description.length + "文字)" }, 空になった項目: empty },
      "■ チャンネル一覧(コラボ対応。extractChannels)": channelsError ? "エラー: " + channelsError : channels,
      "■ 関連動画(生データ)": summarize(feed),
      "■ 関連動画(サイトが画面に出す形 / watch各ページ)": normError ? { エラー: normError } : {
        raw_count: expanded.length,
        shown_count: norm.length,
        "表示されずに消えたもの(元の種類)": dropped,
        samples: norm.slice(0, 4).map((x) => ({
          id: x.id, title: x.title?.text, author: x.author?.name, authorId: x.author?.id,
          duration: x.duration?.text, views: x.view_count?.text, published: x.published?.text,
        })),
      },
      "■ 関連動画ページ(back/next.ejs)での扱い(生データをそのまま使う)": templateCheckNext(feed),
      "■ 実際に描画してみた結果(関連動画パネル /wkt/back/next ・生の関連動画をそのまま渡した場合=修正前のルート)": await doRender(ctx, "tube/back/next", { videoInfo: i }),
      "■ 実際に描画してみた結果(関連動画パネル /wkt/back/next ・変換した関連動画を渡した場合=修正後のルート)": normError
        ? { 結果: "描画せず(関連動画の変換でエラー)" }
        : await doRender(ctx, "tube/back/next", { videoInfo: { watch_next_feed: norm } }),
    };
  },

  async playlist({ p }, ctx) {
    if (!p) return { 結果: "再生リストIDが見つかりませんでした(検索結果にも、チャンネルの再生リストタブにも無かった)" };
    const yt = await getRaw();
    const raw = await yt.getPlaylist(p);
    let viaItems = [];
    try { viaItems = Array.from(raw.items || []); } catch (e) { viaItems = []; }
    const viaPage = [];
    for (const s of Array.from(raw.page_contents?.contents || [])) for (const x of Array.from(s.contents || [])) viaPage.push(x);
    const pr = await attempt(() => serverYt.getPlaylist(p));
    const norm = pr.value;
    const hd = norm?.info ?? raw.info;
    const x = crossTab(norm?.items || [], viaItems.length ? viaItems : viaPage);
    return {
      "■ 再生リストのヘッダー(playlist.ejs が使う項目)": hd && {
        title: hd.title,
        author: hd.author ? { id: hd.author.id, name: hd.author.name, thumbs: hd.author.thumbnails?.length } : null,
        total_items: hd.total_items,
        last_updated: hd.last_updated,
        description_length: String(hd.description || "").length,
        thumbnails: hd.thumbnails?.length,
        keys: Object.keys(hd).slice(0, 20),
      },
      "■ 再生リストの動画(生データ)": {
        via_items: summarize(viaItems),
        via_page_contents: summarize(viaPage),
        has_continuation: raw.has_continuation,
      },
      "■ サイトが画面に出す形(変換後)": pr.error ? errSection(pr) : {
        "生データの件数(items)": viaItems.length,
        "画面に出る件数": norm?.items?.length ?? null,
        "表示されずに消えたもの(元の種類)": x.dropped,
        samples: (norm?.items || []).slice(0, 5),
      },
      "■ 実際に描画してみた結果(/wkt/p/ のページ)": pr.error || !norm
        ? { 結果: "描画せず(サイト側の getPlaylist が失敗 → 404のエラー画面になる)" }
        : await doRender(ctx, "tube/playlist", { ...norm, playlistId: p }),
    };
  },

  async comments({ v }, ctx) {
    const yt = await getRaw();
    let raw = null;
    let rawError = null;
    try { raw = await yt.getComments(v); } catch (e) { rawError = e.message; }
    const sr = await attempt(() => serverYt.getComments(v)); // サイトが実際に呼ぶ方法(失敗すると null)
    const site = sr.value;
    const threads = Array.from(raw?.contents || []);
    const withComment = threads.filter((t) => t?.comment);
    return {
      "■ コメント(生データ)": {
        youtubeからの結果: raw ? "取得できた" : (rawError ? "エラー: " + rawError : "null"),
        thread_count: threads.length,
        with_comment: withComment.length,
        first_comment_keys: withComment[0] ? Object.keys(withComment[0].comment).slice(0, 40) : null,
        "先頭5件の項目(コメント機能の追加用)": withComment.slice(0, 5).map((t) => {
          const cm = t.comment;
          return {
            like_count: cm.like_count, published_time: cm.published_time, is_pinned: cm.is_pinned,
            author_is_channel_owner: cm.author_is_channel_owner, is_member: cm.is_member, is_hearted: cm.is_hearted,
            reply_count: cm.reply_count, reply_level: cm.reply_level, content_length: String(cm.content?.text || "").length,
            thread_keys: Object.keys(t).slice(0, 15), thread_has_replies: t.has_replies, thread_replies: Array.isArray(t.replies) ? t.replies.length : (t.replies ? "あり" : null),
          };
        }),
        "コメント欄のヘッダー": raw?.header ? { keys: Object.keys(raw.header).slice(0, 15), count_text: raw.header.comments_count?.text ?? null } : null,
        続きの読み込み: typeof raw?.getContinuation === "function" ? "getContinuation あり" : "なし",
      },
      "■ コメント欄(back/comment.ejs)での扱い": {
        サイトの取得結果: sr.error ? "エラー: " + sr.error : site ? "取得できた" : "null(修正前の comment.ejs は cm.contents でエラーになる)",
        "表示対象の件数": withComment.length,
        "修正前の comment.ejs で落ちる(500になる)条件": {
          作者情報が無い: withComment.filter((t) => !t.comment.author).length,
          作者アイコンが無い: withComment.filter((t) => !t.comment.author?.thumbnails?.length).length,
          本文が無い: withComment.filter((t) => !t.comment.content).length,
        },
      },
      "■ 実際に描画してみた結果(/wkt/back/comment のページ)": sr.error
        ? { 結果: "描画せず(サイト側の getComments がエラー)" }
        : await doRender(ctx, "tube/back/comment", { cm: site }),
    };
  },
};

// ── 画面 ───────────────────────────────────────────────────
const PAGE_STYLE = "body{font-family:sans-serif;background:#111;color:#eee;margin:0;padding:12px}"
  + "input{width:100%;box-sizing:border-box;padding:8px;margin:2px 0 10px;background:#222;color:#eee;border:1px solid #555;border-radius:6px}"
  + "button,a.btn{display:inline-block;padding:10px 14px;margin:4px 4px 4px 0;background:#2563eb;color:#fff;border:0;border-radius:6px;font-size:15px;text-decoration:none}"
  + "pre{white-space:pre-wrap;word-break:break-all;background:#000;padding:10px;border-radius:6px;font-size:12px}"
  + "label{font-size:13px;color:#bbb}h1{font-size:18px}";
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>確認用</title><style>${PAGE_STYLE}</style></head><body>${body}</body></html>`;

router.use((req, res, next) => {
  if (Date.now() > ENABLED_UNTIL.getTime() || req.query.key !== DEBUG_KEY) {
    return res.status(404).send("Not found");
  }
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/", (req, res) => {
  const f = (name, label, value, ph = "") =>
    `<label>${label}</label><input name="${name}" value="${esc(value)}" placeholder="${esc(ph)}">`;
  res.send(page(`
    <h1>YouTube データ確認(一時用)</h1>
    <p style="font-size:13px;color:#bbb">下の欄はそのままでも動きます。調べたい項目のボタンを押し、出てきた結果を全部コピーして貼ってください。</p>
    <form action="/wkt-debug/run" method="get">
      <input type="hidden" name="key" value="${esc(req.query.key)}">
      ${f("q", "検索ワード", "ゲーム実況")}
      ${f("v", "動画ID(/wkt/watch/ の後ろ)", "dQw4w9WgXcQ")}
      ${f("c", "チャンネルID(/wkt/c/ の後ろ。UCから始まる)", "UC_x5XG1OV2P6uZZ5FSM9Ttw")}
      ${f("p", "再生リストID(/wkt/p/ の後ろ。PLから始まる)", "", "サイトで開いた再生リストのIDを入れてください")}
      <div>
        <button formaction="/wkt-debug/all" style="background:#16a34a;font-size:17px;width:100%">まとめて全部取得(ファイルに保存)</button>
      </div>
      <p style="font-size:12px;color:#999">↑ 押すと、下の項目を順番に全部調べます(1〜2分かかることがあります)。個別に見たいときは下のボタンです。</p>
      <div>
        <button name="part" value="search">検索</button>
        <button name="part" value="info">動画情報・関連動画</button>
        <button name="part" value="comments">コメント</button>
        <button name="part" value="playlist">再生リスト</button>
      </div>
      <div>
        <button name="part" value="home">チャンネル ホーム</button>
        <button name="part" value="tab:videos">動画タブ</button>
        <button name="part" value="tab:shorts">ショートタブ</button>
        <button name="part" value="tab:live">ライブタブ</button>
        <button name="part" value="tab:playlists">再生リストタブ</button>
        <button name="part" value="tab:releases">リリースタブ</button>
      </div>
    </form>`));
});

router.get("/run", async (req, res) => {
  const [name, tab] = String(req.query.part || "").split(":");
  const fn = PARTS[name];
  const params = { q: req.query.q || "", v: req.query.v || "", c: req.query.c || "", p: req.query.p || "", tab };
  const back = `<a class="btn" href="/wkt-debug?key=${encodeURIComponent(req.query.key)}">← 戻る</a>`;
  if (!fn) return res.send(page(back + "<p>項目が不明です</p>"));

  let text;
  try {
    text = fmt(await withTimeout(fn(params, { found: {}, render: (view, locals) => renderCheck(req.app, view, locals) })));
  } catch (e) {
    text = "エラー: " + (e && e.message ? e.message : e);
  }
  const header = `[${req.query.part}] node ${process.version} / ${new Date().toISOString()}\n`;
  res.send(page(`${back}<button onclick="navigator.clipboard.writeText(document.getElementById('o').innerText).then(()=>this.textContent='コピーしました')">結果をコピー</button>
    <pre id="o">${esc(header + text)}</pre>`));
});

// 1項目ぶんを返す(ブラウザ側のプログラムから、項目ごとに1回ずつ呼ばれる)
router.get("/api", async (req, res) => {
  const [name, tab] = String(req.query.part || "").split(":");
  const fn = PARTS[name];
  if (!fn) return res.status(400).json({ text: "項目が不明です", found: {} });
  const params = { q: req.query.q || "", v: req.query.v || "", c: req.query.c || "", p: req.query.p || "", tab };
  const ctx = { found: {}, render: (view, locals) => renderCheck(req.app, view, locals) };
  let text;
  try { text = fmt(await withTimeout(fn(params, ctx))); } catch (e) { text = "エラー: " + (e && e.message ? e.message : e); }
  res.json({ text, found: ctx.found });
});

// ブラウザで動くプログラム(サーバーでは実行されません。文字にして画面に埋め込みます)
function clientMain(P) {
  var parts = ["env", "search", "info", "comments", "home", "tab:videos", "tab:shorts", "tab:live", "tab:playlists", "tab:releases", "playlist"];
  var st = document.getElementById("st");
  var out = document.getElementById("o");
  var text = "";
  function add(s) { text += s; out.textContent = text; }

  function fetchPart(part) {
    var qs = new URLSearchParams({ key: P.key, part: part, q: P.q, v: P.v, c: P.c, p: P.p });
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 70000);
    return fetch("/wkt-debug/api?" + qs.toString(), { signal: ctl.signal })
      .then(function (r) {
        return r.text().then(function (t) {
          try { return JSON.parse(t); } catch (e) { return { text: "取得失敗: HTTP " + r.status + " " + t.slice(0, 120), found: {} }; }
        });
      })
      .catch(function (e) { return { text: "取得失敗: " + e.message, found: {} }; })
      .then(function (j) { clearTimeout(timer); return j; });
  }

  document.getElementById("copy").onclick = function () {
    var btn = this;
    var done = function () { btn.textContent = "コピーしました"; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { btn.textContent = "コピー失敗(ファイル保存を使ってください)"; });
    } else {
      btn.textContent = "この端末ではコピーできません(ファイル保存を使ってください)";
    }
  };
  document.getElementById("save").onclick = function () {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "yt-data-" + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "") + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  (async function () {
    add("入力: 検索=" + P.q + " / 動画=" + P.v + " / チャンネル=" + P.c + " / 再生リスト=" + (P.p || "(自動で探す)") + "\n");
    for (var i = 0; i < parts.length; i++) {
      st.textContent = "(" + (i + 1) + "/" + parts.length + ") " + parts[i] + " を取得中…";
      var j = await fetchPart(parts[i]);
      add("\n===== [" + parts[i] + "] =====\n" + j.text + "\n");
      if (j.found && j.found.playlistId && !P.p) {
        P.p = j.found.playlistId;
        add("(再生リストID " + P.p + " を自動で見つけました。最後の playlist で使います)\n");
      }
    }
    st.textContent = "完了。「ファイルに保存」を押して、できたファイルをそのまま送ってください。";
  })();
}

const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

router.get("/all", (req, res) => {
  const P = {
    key: String(req.query.key || ""),
    q: String(req.query.q || "ゲーム実況"),
    v: String(req.query.v || ""),
    c: String(req.query.c || ""),
    p: String(req.query.p || ""),
  };
  const back = `<a class="btn" href="/wkt-debug?key=${encodeURIComponent(P.key)}">← 戻る</a>`;
  res.send(page(`${back}
    <h1>まとめて取得</h1>
    <p id="st">準備中…</p>
    <div>
      <button id="save" style="background:#16a34a">ファイルに保存</button>
      <button id="copy">結果をコピー</button>
    </div>
    <pre id="o"></pre>
    <script>(${clientMain.toString()})(${safeJson(P)});</script>`));
});

// テスト用(本番では使われません)
router.__setRawClient = (c) => { ownClient = c; };

module.exports = router;
