const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const ytsr = require("ytsr");
const serverYt = require("../server/youtube.js");

const limit = process.env.LIMIT || 50;

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

// ytsr で検索して views/tube/opu/search.ejs を描画する(フォールバック用)
async function renderYtsrSearch(res, query, page) {
    const result = await ytsr(query, {
        limit,
        pages: page,
        gl: "JP",
        hl: "ja"
    });
    return renderToString(res, "tube/opu/search.ejs", {
        res: result,
        query: query,
        page
    });
}

// 検索ページ(2ページ目以降も、ここ → views/tube/search.ejs)
// views/tube/search.ejs が失敗したら、ytsr の views/tube/opu/search.ejs にフォールバックする
router.get("/s", async (req, res) => {
    const query = req.query.q;
    const page = Math.max(1, Math.floor(Number(req.query.p)) || 1);

    // 1. 通常: youtubei.js の結果を views/tube/search.ejs で表示
    try {
        const searchResult = await serverYt.search(query, page);
        if (searchResult && searchResult.results && searchResult.results.length > 0) {
            const html = await renderToString(res, "tube/search.ejs", {
                res: searchResult,
                query: query,
                page
            });
            return res.send(html);
        }
        console.warn("search.ejs: 検索結果が取得できなかったため、ytsr にフォールバックします");
    } catch (error) {
        console.error("search.ejs が失敗したため、ytsr にフォールバックします:", error);
    }

    // 2. 失敗したら: ytsr の結果を views/tube/opu/search.ejs で表示
    try {
        res.send(await renderYtsrSearch(res, query, page));
    } catch (error) {
        console.error(error);
        try {
            res.status(500).render("error.ejs", {
                title: "ytsr Error",
                content: error
            });
        } catch (error) {
            console.error(error);
        }
    }
});

// 旧URL /wkt/ss は /wkt/s に飛ばす(検索語・ページ番号はそのまま引き継ぐ)
router.get("/ss", (req, res) => {
    const params = new URLSearchParams();
    if (req.query.q !== undefined) params.set("q", String(req.query.q));
    if (req.query.p !== undefined) params.set("p", String(req.query.p));
    const qs = params.toString();
    res.redirect((req.baseUrl || "") + "/s" + (qs ? "?" + qs : ""));
});

router.get("/p/:id", async (req, res) => {
  try {
    const data = await serverYt.getPlaylist(req.params.id);
    if (!data) {
      return res.status(404).render("error.ejs", {
        title: "再生リストが見つかりません",
        content: "再生リスト情報を取得できませんでした。"
      });
    }
    res.render("tube/playlist.ejs", { ...data, playlistId: req.params.id });
  } catch (err) {
    console.error("Failed to fetch playlist", req.params.id, err);
    res.status(500).render("error.ejs", {
      title: "エラー",
      content: "再生リストの取得に失敗しました:\n" + err.toString()
    });
  }
});

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
