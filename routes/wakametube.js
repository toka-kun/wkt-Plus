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

router.get("/s", async (req, res) => {
    let query = req.query.q;
    let page = Number(req.query.p || 1);
    try {
        // 先に検索結果を変数に入れる
        const searchResult = await serverYt.search(query, limit, page);
        
        // ★ 修正ポイント: 検索結果が null、results が無い、または 0件 の場合
        if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
            // 自動的に /ss (views/tube/opu/search.ejs を処理するルート) へリダイレクトする
            const redirectUrl = (req.baseUrl || '') + `/ss?q=${encodeURIComponent(query)}&p=${page}`;
            return res.redirect(redirectUrl);
        }

        // 成功した場合は通常通り渡す
        res.render("tube/search.ejs", {
            res: searchResult,
            query: query,
            page
        });
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

router.get("/ss", async (req, res) => {
        let query = req.query.q;
        let page = Number(req.query.p || 3);
    try {
                res.render("tube/opu/search.ejs", {
                        res: await ytsr(query, {limit, pages: page}),
                        query: query,
                        page
                });
        } catch (error) {
                console.error(error);
                res.status(500).render("error.ejs", {
                        title: "ytsr Error",
                        content: error
                });
        }
});

router.get("/c/:id", async (req, res) => {
  try {
    const channel = await serverYt.getChannel(req.params.id);
    
    res.render("tube/channel.ejs", channel);
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
