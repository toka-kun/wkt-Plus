const axios = require("axios");
const { get } = require('undici');
const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');
const serverYt = require("/app/server/youtube.js");

router.get('/edu/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const videoInfo = await serverYt.infoGet(videoId);
    const { statusCode, ytinfo3 } = await get("https://wktedutube.glitch.me");
    
    if (statusCode !== 200) {
      throw new Error(`Request failed with status ${statusCode}`);
    }
    const ytinfo = await ytinfo3.body.text(); 
    const videosrc = `https://www.youtubeeducation.com/embed/${videoId}${ytinfo}`;
          
    res.render('tube/umekomi/edu.ejs', {videosrc, videoInfo, videoId});
  } catch (error) {
     res.status(500).render('matte', { 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

router.get('/edurl', async (req, res) => {
  try {
    const ytinfo = await axios.get("https://wktedutube.glitch.me");  
    res.send(`${ytinfo.data}`);
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