const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const ytsr = require("ytsr");
const serverYt = require("../server/youtube.js");

const limit = process.env.LIMIT || 50;

// 検索ページは10ページまで(server/youtube.js の MAX_SEARCH_PAGES と同じ値)
const pageOf = (q) => Math.min(Math.max(1, Math.floor(Number(q.p)) || 1), 10);

router.use("/watch", require("../controllers/tube/getvideo"));
router.use("/w", require("../controllers/tube/getvideo"));
router.use("/live", require("../controllers/tube/live"));
router.use("/yt", require("../controllers/tube/youtube"));

const REMOTE_VERSION_URL =
  "https://raw.githubusercontent.com/toka-kun/wkt-Plus/refs/heads/master/version.json";

function getLocalVersion() {
  try {
    const versionPath = path.join(__dirname, "../version.json");
    const versionData = JSON.parse(fs.readFileSync(versionPath, "utf8"));
    return versionData.version || "unknown";
  } catch (err) {
    console.error("version.json の読み込みに失敗:", err);
    return "unknown";
  }
}

async function getRemoteVersion() {
  const res = await fetch(REMOTE_VERSION_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch remote version: HTTP ${res.status}`);
  }

  const versionData = await res.json();
  return versionData.version || "unknown";
}

router.get("/", async (req, res) => {
  const version = getLocalVersion();

  try {
    const latestVersion = await getRemoteVersion();
    const isOutdated =
      version !== "unknown" &&
      latestVersion !== "unknown" &&
      version !== latestVersion;

    res.render("tube/home", {
      version,
      isOutdated
    });
  } catch (err) {
    console.error("最新 version.json の取得に失敗:", err);
    res.render("tube/home", {
      version,
      isOutdated: false
    });
  }
});

// ejs を文字列にして返す(描画で失敗したときも、呼び出し側で拾ってフォールバックできるようにする)
function renderToString(res, view, data) {
    return new Promise((resolve, reject) => {
        res.render(view, data, (err, html) => (err ? reject(err) : resolve(html)));
    });
}

// 失敗したとき、同じ検索語・ページ番号のまま別URL(/ss, /pp)へ飛ばす
function fallbackTo(req, res, path) {
    const i = req.url.indexOf("?");
    res.redirect(req.baseUrl + path + (i < 0 ? "" : req.url.slice(i)));
}

// 検索ページ(2ページ目以降もviews/tube/search.ejs のみ)
// 失敗したら /wkt/ss にフォールバックする
router.get("/s", async (req, res) => {
    const query = req.query.q;
    const page = pageOf(req.query);
    try {
        const searchResult = await serverYt.search(query, page);
        if (searchResult?.results?.length > 0) {
            const html = await renderToString(res, "tube/search.ejs", { res: searchResult, query, page });
            return res.send(html);
        }
    } catch {}
    fallbackTo(req, res, "/ss");
});

// ytsr の検索ページ(views/tube/opu/search.ejs)
router.get("/ss", async (req, res) => {
    const query = req.query.q;
    const page = pageOf(req.query);
    try {
        const result = await ytsr(query, { limit, pages: page, gl: "JP", hl: "ja" });
        res.render("tube/opu/search.ejs", { res: result, query, page });
    } catch (error) {
        res.status(500).render("error.ejs", { title: "ytsr Error", content: error });
    }
});

// 再生リストページ(views/tube/playlist.ejs のみ)
router.get("/p/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const data = await serverYt.getPlaylist(id);
    if (data?.items?.length > 0) {
      const html = await renderToString(res, "tube/playlist.ejs", { ...data, playlistId: id });
      return res.send(html);
    }
  } catch {}
  res.status(500).render("error.ejs", {
    title: "エラー",
    content: "再生リストの取得に失敗しました。"
  });
});

// /wkt/pp/:id は /wkt/p/:id へ
router.get("/pp/:id", (req, res) => res.redirect(req.baseUrl + "/p/" + encodeURIComponent(req.params.id)));

router.get("/c/:id/tab/:tabName", async (req, res) => {
  const { id, tabName } = req.params;
  const sort = req.query.sort || 'newest';
  try {
    const data = await serverYt.getChannelTab(id, tabName, sort);
    res.json(data);
  } catch (err) {
    console.error("Tab fetch failed:", tabName, err);
    res.status(500).json({ items: [], error: err.message });
  }
});

router.get("/c/:id", async (req, res) => {
  try {
    const data = await serverYt.getChannel(req.params.id);
    if (!data) {
      return res.status(404).render("error.ejs", {
        title: "チャンネルが見つかりません",
        content: "チャンネル情報を取得できませんでした。"
      });
    }
    res.render("tube/channel.ejs", { ...data, channelId: req.params.id });
  } catch (err) {
    console.error("Failed to fetch channel", req.params.id, err);
    res.status(500).render("error.ejs", {
      title: "Sorry. Something went wrong",
      content: "Failed to fetch channel information:\n" + err.toString()
    });
  }
});

router.use("/back", require("../controllers/tube/back"));
router.use("/redirect", require("../controllers/tube/redirect"));
router.use("/trend", require("../controllers/tube/trend"));
router.use("/cl", require("../controllers/tube/cl"));

module.exports = router;
