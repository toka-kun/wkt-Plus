const express = require("express");
const router = express.Router();
const path = require("path");

// 通常のNode.jsサーバー用のインメモリキャッシュ変数
let cachedStatsData = null;
let statsCacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間（ミリ秒）

router.get("/", (req, res) => {
  res.end(JSON.stringify(process.versions, null, 2));
});

// Stats用のルートを /b/:id より前に定義する
router.get("/b/stats", async (req, res) => {
  try {
    // VercelやNetlifyのCDN(エッジ)とブラウザに1時間(3600秒)キャッシュさせるヘッダーを設定
    // max-age: ブラウザのキャッシュ期間, s-maxage: CDN(エッジサーバー)のキャッシュ期間
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    const now = Date.now();

    // 1. メモリ上のキャッシュが有効期間内（1時間以内）かチェック
    if (cachedStatsData && (now - statsCacheTimestamp < CACHE_TTL_MS)) {
      console.log("Serving stats from memory cache");
      return res.render("blog/stats", { monitorData: cachedStatsData });
    }

    // 2. キャッシュが古い、または無い場合はAPIから取得
    console.log("Fetching new stats from UptimeRobot API");
    const response = await fetch("https://stats.uptimerobot.com/api/getMonitorList/h5He3VeuIe");
    const data = await response.json();

    // 次回以降のためにデータをメモリに保存し、時間を更新
    if (data && data.status === 'ok') {
      cachedStatsData = data;
      statsCacheTimestamp = now;
    }

    // EJSにデータを渡してレンダリング
    res.render("blog/stats", { monitorData: data });

  } catch (error) {
    console.error("Failed to fetch UptimeRobot stats:", error);
    // エラーが発生した場合はキャッシュさせないように no-store を上書き設定
    res.set('Cache-Control', 'no-store');
    res.render("blog/stats", { monitorData: null });
  }
});

// 汎用的なブログページのレンダリング
router.get("/b/:id", (req, res) => {
  res.render(`blog/${req.params.id}`);
});

router.use("/n", require("../controllers/blog/getblog"));

module.exports = router;
