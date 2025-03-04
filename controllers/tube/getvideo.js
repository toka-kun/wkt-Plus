const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');

router.get('/:id', async (req, res) => {
    const videoId = req.params.id;
    const server = req.query.server || '0';
    const serverUrls = {
        '0': [
        'https://natural-voltaic-titanium.glitch.me',
        'https://wtserver3.glitch.me',
        'https://wtserver1.glitch.me',
        'https://wtserver2.glitch.me',
	      'https://watawata8.glitch.me',
	      'https://watawata7.glitch.me',
	      'https://watawata37.glitch.me'
        ],
        '1': 'https://wataamee.glitch.me',
        '2': 'https://watawatawata.glitch.me',
        '3': 'https://amenable-charm-lute.glitch.me',
        '4': 'https://watawata37.glitch.me',
        '5': 'https://wtserver1.glitch.me',
        "6": "https://battle-deciduous-bear.glitch.me",
        "7": 'https://productive-noon-van.glitch.me',
	      "8": 'https://balsam-secret-fine.glitch.me',
    };

    let baseUrl;
    if (server === '0') {
        const randomIndex = Math.floor(Math.random() * serverUrls['0'].length);
        baseUrl = serverUrls['0'][randomIndex];
    } else {
        baseUrl = serverUrls[server] || 'https://wtserver1.glitch.me';
    }
  
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }

    const cookies = parseCookies(req);
    const wakames = cookies.wakametubeumekomi === 'true';
    if (wakames) {
        return res.redirect(`/wkt/umekomi/${videoId}`);
    }
    try {
        console.log(baseUrl);
        const response = await axios.get(`${baseUrl}/api/${videoId}`);
        const videoData = response.data;
        console.log(videoData);

        res.render('tube/watch', { videoData, videoId, baseUrl });
  } catch (error) {
        res.status(500).render('mattev', { 
      videoId, baseUrl,
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

module.exports = router;