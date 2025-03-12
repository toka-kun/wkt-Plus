const axios = require('axios');
const express = require("express");
const router = express.Router();

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.get('/gethtml/:Url', async (req, res) => {
  const { Url } = req.params;
  const replacedUrl = decodeURIComponent(Url);
  const url = replacedUrl.replace(/\.wakame02\./g, '.');
  if (!url) {
    return res.status(400).send('URLが入力されていません');
  }
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': user_agent,
        'Accept-Language': 'ja;q=1.0,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      }
    });
    const html = response.data;
    res.setHeader('Content-Type', 'text/plain');
    res.send(html);
  } catch (error) {
    res.status(500).send('URLの取得に失敗しました');
  }
});

module.exports = router;