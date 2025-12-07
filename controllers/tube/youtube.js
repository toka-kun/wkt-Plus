// routes/wkt/yt.js
const axios = require("axios");
const express = require("express");
const router = express.Router();
const serverYt = require("../../server/youtube.js");

/* -------------------------------------------------
   ① video_config.json の params を取得
--------------------------------------------------- */
async function getYtInfo() {
  const url = "https://raw.githubusercontent.com/siawaseok3/wakame/master/video_config.json";
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000
    });

    if (response.data && response.data.params) {
      return JSON.stringify(response.data.params);
    }
  } catch (error) {
    console.log(`ytinfo fetch error ${url}: ${error.message}`);
  }
  throw new Error('必要なデータを取得できませんでした。');
}

/* -------------------------------------------------
   ② 🔥 trend.json を取得して返す（修正版）
   正しい raw URL を使用（キャッシュ付き）
   エンドポイント: /wkt/yt/trend
--------------------------------------------------- */
// 正しい raw URL（ご提示のもの）
const TREND_URL = "https://raw.githubusercontent.com/siawaseok3/wakame/refs/heads/master/trend.json";

// 簡易キャッシュ（メモリ）
let trendCache = null;
let trendCacheFetchedAt = 0;
// キャッシュTTL（ミリ秒） — 必要なら変更
const TREND_CACHE_TTL = 5 * 60 * 1000; // 5分

async function getTrendJson() {
  const now = Date.now();
  if (trendCache && (now - trendCacheFetchedAt) < TREND_CACHE_TTL) {
    return trendCache;
  }

  try {
    const res = await axios.get(TREND_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000
    });

    // 正常取得したらキャッシュ更新
    trendCache = res.data;
    trendCacheFetchedAt = Date.now();
    return trendCache;
  } catch (error) {
    console.log(`trend.json fetch error: ${error.message}`);

    // 取得失敗時にキャッシュがあればそれを返す（フォールバック）
    if (trendCache) {
      console.log("trend.json fetch failed — returning cached data");
      return trendCache;
    }

    throw new Error("trend.json を取得できませんでした");
  }
}

router.get("/trend", async (req, res) => {
  try {
    const trend = await getTrendJson();
    res.json(trend);
  } catch (error) {
    res.status(500).json({
      error: "トレンド取得に失敗しました。",
      details: error.message
    });
  }
});

/* -------------------------------------------------
   ③ /edu/:id（既存機能）
--------------------------------------------------- */
router.get('/edu/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const ytinfo = await getYtInfo();
    const videosrc = `https://www.youtubeeducation.com/embed/${videoId}?${ytinfo}`;
    
    const Info = await serverYt.infoGet(videoId);
    const videoInfo = {
      title: Info.primary_info.title.text || "",
      channelId: Info.secondary_info.owner.author.id || "",
      channelIcon: Info.secondary_info.owner.author.thumbnails[0]?.url || '',
      channelName: Info.secondary_info.owner.author.name || "",
      channelSubsc: Info.secondary_info.owner.subscriber_count.text || "",
      published: Info.primary_info.published,
      viewCount: Info.primary_info.view_count.short_view_count?.text 
               || Info.primary_info.view_count.view_count?.text 
               || "",
      likeCount: Info.primary_info.menu.top_level_buttons.short_like_count 
              || Info.primary_info.menu.top_level_buttons.like_count 
              || Info.basic_info.like_count 
              || "",
      description: Info.secondary_info.description.text || "",
      watch_next_feed: Info.watch_next_feed || "",
    };
          
    res.render('tube/umekomi/edu.ejs', { videosrc, videoInfo, videoId });
  } catch (error) {
     res.status(500).render('tube/mattev', { 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

/* -------------------------------------------------
   ④ /edurl（既存機能）
--------------------------------------------------- */
router.get('/edurl', async (req, res) => {
  try {
    const ytinfo = await getYtInfo();
    res.send(`${ytinfo}`);
  } catch (error) {
     res.status(500).send(error);
  }
});

/* -------------------------------------------------
   ⑤ /nocookie/:id（既存機能）
--------------------------------------------------- */
router.get('/nocookie/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const videosrc = `https://www.youtube-nocookie.com/embed/${videoId}`;
    const Info = await serverYt.infoGet(videoId);
    
    const videoInfo = {
      title: Info.primary_info.title.text || "",
      channelId: Info.secondary_info.owner.author.id || "",
      channelIcon: Info.secondary_info.owner.author.thumbnails[0]?.url || '',
      channelName: Info.secondary_info.owner.author.name || "",
      channelSubsc: Info.secondary_info.owner.subscriber_count.text || "",
      published: Info.primary_info.published,
      viewCount: Info.primary_info.view_count.short_view_count?.text 
               || Info.primary_info.view_count.view_count?.text 
               || "",
      likeCount: Info.primary_info.menu.top_level_buttons.short_like_count 
              || Info.primary_info.menu.top_level_buttons.like_count 
              || Info.basic_info.like_count 
              || "",
      description: Info.secondary_info.description.text || "",
      watch_next_feed: Info.watch_next_feed || "",
    };
          
    res.render('tube/umekomi/nocookie.ejs', { videosrc, videoInfo, videoId });
  } catch (error) {
     res.status(500).render('matte', { 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

module.exports = router;
