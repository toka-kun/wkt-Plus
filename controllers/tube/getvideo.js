const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");
const http = require('http');
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");

router.get('/:id', async (req, res) => {
    const videoId = req.params.id;
    const cookies = parseCookies(req);
    const wakames = cookies.playbackMode;
    if (wakames == "edu") {
        return res.redirect(`/wkt/yt/edu/${videoId}`);
    }
    if (wakames == "nocookie") {
        return res.redirect(`/wkt/yt/nocookie/${videoId}`);
    }
    let server = req.query.server || '0';
    const serverUrls = [
	      'https://watawata8.glitch.me',
	      'https://watawata37.glitch.me',
        'https://watawatawata.glitch.me',
        'https://manawa.glitch.me',
        'https://wakeupe.glitch.me',
        'https://hortensia.glitch.me',
        'https://wata27.glitch.me',
        'https://wakameme.glitch.me'
        ];
    if (wakames == "direct") {
        server = "direct";
    }
    let baseUrl;
    if (server == "0") {
        const randomIndex = Math.floor(Math.random() * serverUrls.length);
        baseUrl = serverUrls[randomIndex];
    } else {
        baseUrl = `https://${server}.glitch.me`;
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }
    try {
      let videoData;
      if(server == "direct"){
        videoData = await wakamess.getYouTube(videoId);
      }else{
        const response = await axios.get(`${baseUrl}/api/${videoId}`);
        videoData = await response.data;
      }
      const videoInfo = await serverYt.infoGet(videoId);
      res.render('tube/watch.ejs', { videoData, videoInfo, videoId, baseUrl });
  } catch (error) {
      const shufServerUrls = shuffleArray([...serverUrls]);
      res.status(500).render('tube/mattev.ejs', { 
      videoId, baseUrl, 
      serverUrls: shufServerUrls,
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

function parseCookies(request) {
    const list = {};
    const cookieHeader = request.headers.cookie;

    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            let parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }

    return list;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}


module.exports = router;
