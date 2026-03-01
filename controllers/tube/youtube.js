const axios = require("axios");
const express = require("express");
const router = express.Router();
const serverYt = require("../../server/youtube.js");

// 取得先の設定（URL、取得するキー、エンドポイント名の対応表）
const fetchConfigs = [
  { name: "edurl",        url: "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key1.json", type: "json", key: "result" },
  { name: "edurl_wakame", url: "https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/edu.text", type: "text" },
  { name: "edurl_sia",    url: "https://raw.githubusercontent.com/siawaseok3/wakame/master/video_config.json", type: "json", key: "params" },
  { name: "edurl_toka1",  url: "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key1.json", type: "json", key: "result" },
  { name: "edurl_toka2",  url: "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key2.json", type: "json", key: "result" },
  { name: "edurl_wool1",  url: "https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/parameter.txt", type: "text" },
  { name: "edurl_wool2",  url: "https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/edu.txt", type: "text" },
  { name: "edurl_wool3",  url: "https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/ep.txt", type: "text" },
  { name: "edurl_wool4",  url: "https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/key1.txt", type: "text" },
  { name: "edurl_wool5",  url: "https://raw.githubusercontent.com/woolisbest-4520/about-youtube/refs/heads/main/edu/key2.txt", type: "text" },
  { name: "min2_api",     url: "https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube-api.json", type: "text" }  
];

// 汎用的なデータ取得関数
async function getParamData(config) {
  try {
    const response = await axios.get(config.url);
    if (config.type === "json") {
      // JSONの場合は指定されたキー（paramsやresult）を返す
      return response.data[config.key] || "";
    }
    // テキストの場合はそのまま返す
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${config.name}: ${error.message}`);
    return ""; // 失敗時は空文字を返す（エラーで止めないため）
  }
}

// 1. 各edurl系エンドポイントを自動生成
fetchConfigs.forEach(config => {
  router.get(`/${config.name}`, async (req, res) => {
    const data = await getParamData(config);
    res.send(`${data}`);
  });
});

// 2. /edu/:id の処理（デフォルトとして toka-kun の key1.json = /edurl を使う例）
router.get('/edu/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    // デフォルトのパラメータとして fetchConfigs[5] (edurl) を取得
    const ytinfo = await getParamData(fetchConfigs.find(c => c.name === 'edurl'));
    const videosrc = `https://www.youtubeeducation.com/embed/${videoId}${ytinfo}`;
    
    const Info = await serverYt.infoGet(videoId);
    const videoInfo = {
      title: Info.primary_info.title.text || "",
      channelId: Info.secondary_info.owner.author.id || "",
      channelIcon: Info.secondary_info.owner.author.thumbnails[0].url || '',
      channelName: Info.secondary_info.owner.author.name || "",
      channelSubsc: Info.secondary_info.owner.subscriber_count.text || "",
      published: Info.primary_info.published,
      viewCount: Info.primary_info.view_count.short_view_count?.text || Info.primary_info.view_count.view_count?.text || "",
      likeCount: Info.primary_info.menu.top_level_buttons.short_like_count || Info.primary_info.menu.top_level_buttons.like_count || Info.basic_info.like_count || "",
      description: Info.secondary_info.description.text || "",
      watch_next_feed: Info.watch_next_feed || "",
    };
          
    res.render('tube/umekomi/edu.ejs', {videosrc, videoInfo, videoId});
  } catch (error) {
    res.status(500).render('tube/mattev', { 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

// 3. nocookie はそのまま
router.get('/nocookie/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const videosrc = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&amp;mute=0`;
    const Info = await serverYt.infoGet(videoId);
    const videoInfo = {
      title: Info.primary_info.title.text || "",
      channelId: Info.secondary_info.owner.author.id || "",
      channelIcon: Info.secondary_info.owner.author.thumbnails[0].url || '',
      channelName: Info.secondary_info.owner.author.name || "",
      channelSubsc: Info.secondary_info.owner.subscriber_count.text || "",
      published: Info.primary_info.published,
      viewCount: Info.primary_info.view_count.short_view_count?.text || Info.primary_info.view_count.view_count?.text || "",
      likeCount: Info.primary_info.menu.top_level_buttons.short_like_count || Info.primary_info.menu.top_level_buttons.like_count || Info.basic_info.like_count || "",
      description: Info.secondary_info.description.text || "",
      watch_next_feed: Info.watch_next_feed || "",
    };
          
    res.render('tube/umekomi/nocookie.ejs', {videosrc, videoInfo, videoId});
  } catch (error) {
    res.status(500).render('matte', { 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

module.exports = router;
