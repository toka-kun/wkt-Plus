const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');
const serverYt = require("../../server/youtube.js");

async function getYtInfo() {
  const urls = [
    "https://wktedutube.glitch.me",
    "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLg3df0uJm54ZJvlS9Pl8HyxJuvvZ3_zwc5cK8xZ-AyLNSHI79AQ_yqQWf4OFMEiUnQ21eeUC8tkTeW9h0l5065qOGt1DOfbVEYgPh2Mjkp4IJPzIJEPH-esCzd_40jdSG0rPPPkHgfyusNwOhtb5txF___c4a8eZLxd2zV2IGtYvQEcoJDV7R1vslzoGsJ45YxPAiLlSdDhVTzLJz-W7MUlll0kO5dY7l2KsxQrjpIPV5wIXmLz0lUrYPAy1F5BLV2C-y4SdtahNE6dwPwpvj7ElLq6K1RQgquUGaxF&lib=M91KG9TratNYR8mY3BgsDxXLpiZUpG_6w",
    "https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/edu.text"
  ];
  for (const url of urls) {
    try {
      const response = await axios.get(url);
      if (response.data) {
         return response.data;
      }
    } catch (error) {
      console.log(`ytinfo ${url}: ${error.message}`);
    }
  }
  throw new Error('必要なデータを取得できませんでした。');
}

router.get('/edu/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const ytinfo = await getYtInfo();
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

router.get('/edurl', async (req, res) => {
  try {
    const ytinfo = await getYtInfo();
    res.send(`${ytinfo}`);
  } catch (error) {
     res.status(500).send(error);
  }
});

router.get('/nocookie/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const videosrc = `https://www.youtube-nocookie.com/embed/${videoId}`;
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
