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
      return response.data;
    } catch (error) {
      console.log(`ytinfo ${url}: ${error.message}`);
    }
  }
  throw new Error('必要なデータを取得できませんでした。');
}

router.get('/edu/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const videoInfo = await serverYt.infoGet(videoId);
    const ytinfo = await getYtInfo();
    const videosrc = `https://www.youtubeeducation.com/embed/${videoId}${ytinfo}`;
          
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
    const videoInfo = await serverYt.infoGet(videoId);
    const videosrc = `https://www.youtube-nocookie.com/embed/${videoId}`;
          
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
