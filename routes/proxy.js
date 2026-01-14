const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", async (req, res) => {
  const proxylist = await GetproxyList();
  if (proxylist) {
    res.send(proxylist);
  } else {
    res.status(500).send('ブログ記事の取得に失敗しました');
  }
});

async function Getproxy(id, ff) {
  try {
    const response = await axios.get(`https://wakamepp.glitch.me/${ff}/${id}.html`);
    return response.data;
  } catch (error) {
    return null;
  }
}

async function GetproxyList() {
  try {
    const response = await axios.get(`https://wakamepp.glitch.me/list.html`);
    return response.data;
  } catch (error) {
    return null;
  }
}

router.get('/:ff/:id', async (req, res) => {
  const id = req.params.id;
  const ff = req.params.ff;
  const proxyHtml = await Getproxy(id, ff);
  if (proxyHtml) {
    res.send(proxyHtml);
  } else {
    res.status(500).send('Proxyが見つかりません。');
  }
});

module.exports = router;
