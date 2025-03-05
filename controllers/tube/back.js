const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');
const { fetch } = require("undici");
const bodyParser = require("body-parser");

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.get('/suggest', (req, res) => {
    const keyword = req.query.keyword;
    const options = {
        hostname: 'www.google.com',
        path: `/complete/search?client=youtube&hl=ja&ds=yt&q=${encodeURIComponent(keyword)}`,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    };
    const request = http.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            const jsonString = data.substring(data.indexOf('['), data.lastIndexOf(']') + 1);

            try {
                const suggestionsArray = JSON.parse(jsonString);
                const suggestions = suggestionsArray[1].map(i => i[0]);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.json(suggestions);
            } catch (error) {
                console.error('JSON parse error:', error);
                res.status(500).send({ error: 'えらー。あらら' });
            }
        });
    });
    request.on('error', (error) => {
        console.error('Request error:', error);
        res.status(500).send({ error: 'えらー。あらら' });
    });
    request.end();
});

router.get("/vi*", async (req, res) => {
  try {
    const url = `https://i.ytimg.com/${req.url.split("?")[0]}`;
    const response = await fetch(url, {
      headers: {
        "user-agent": user_agent
      }
    });
    if (!response.ok) {
      return res.status(response.status).send(`Error: ${response.statusText}`);
    }
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Cache-Control", response.headers.get("cache-control") || "public, max-age=3600");
    response.body.pipe(res);
  } catch (err) {
    console.log(err);
    res.status(500).send(err.toString());
  }
});

router.get('/comment/:id', async (req, res) => {
  const videoId = req.params.id;
    try {
        const response = await axios.get(`https://wakamecomment.glitch.me/api/wakame/${videoId}`);
        const cm = response.data;

        res.render('tube/back/comment', { cm });
   } catch (error) {
        res.status(500).render('error', { 
      videoId, 
      error: 'コメントを取得できません', 
      details: error.message 
    });
  }
});

module.exports = router;