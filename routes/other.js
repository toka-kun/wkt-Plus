const express = require("express");
const router = express.Router();
const path = require("path");

// 対応させたいパスのリスト
const targets = ["sia", "xerox", "wista", "nkys", "uow", "labo5", "player", "min", "yuto"];

// キャッシュ用の変数と24時間の有効期限設定 (コンテナ生存期間用)
let tvCache = { data: null, timestamp: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24時間 (ミリ秒)
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/hlsUrls.json";

router.get("/", (req, res) => {
  res.render("other/home");
});

// TV専用ルーティング（キャッシュとデータフェッチ）
router.get("/tv", async (req, res) => {
  const now = Date.now();

  // キャッシュがない、または24時間経過している場合にフェッチ
  if (!tvCache.data || now - tvCache.timestamp > CACHE_TTL) {
    try {
      const response = await fetch(GITHUB_RAW_URL);
      const jsonData = await response.json();

      // hlsUrlもfallbackVideoIdもない項目をフィルタリングして削除
      const filteredData = {};
      for (const [key, item] of Object.entries(jsonData)) {
        if (item.hlsUrl || item.fallbackVideoId) {
          filteredData[key] = item;
        }
      }

      tvCache = { data: filteredData, timestamp: now };
    } catch (error) {
      console.error("HLS Data fetch error:", error);
      // フェッチ失敗時は既存のキャッシュを使用するか、空のデータを渡す
      if (!tvCache.data) tvCache.data = {};
    }
  }

  // Vercel / Netlify の CDNエッジでキャッシュするためのヘッダーを設定
  // s-maxage=86400 : CDN側で24時間 (86400秒) キャッシュする
  // stale-while-revalidate=86400 : キャッシュ切れでも次の1日は古いキャッシュを返しつつ、裏で非同期更新する
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");

  // 取得・フィルタリング済みのデータをEJSに渡す
  res.render("other/tv/home", { tvData: JSON.stringify(tvCache.data) });
});

// リスト内の各項目に対して自動的にルーティングを設定
targets.forEach((target) => {
  router.get(`/${target}`, (req, res) => {
    res.render(`other/${target}/home`);
  });

  router.get(`/${target}/:id`, async (req, res) => {
    const id = req.params.id;
    res.render(`other/${target}/${id}`);
  });
});

module.exports = router;
