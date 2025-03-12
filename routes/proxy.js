const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  const proxylist = await Getproxylist(part);
  if (proxylist) {
    res.send(proxylist);
  } else {
    res.status(500).send('ブログ記事の取得に失敗しました');
  }
});

async function Getproxy(blogId, part) {
  try {
    const response = await axios.get(`https://wakameblog.glitch.me/${part}/${blogId}.html`);
    return response.data;
  } catch (error) {
    return null;
  }
}

async function GetproxyList(part) {
  try {
    const response = await axios.get(`https://wakameblog.glitch.me/${part}.html`);
    return response.data;
  } catch (error) {
    return null;
  }
}

router.get('/:ff/:id', async (req, res) => {
  const id = req.params.id;
  const blogData = await Getproxy(id, "blog");
  if (blogData) {
    res.send(blogData);
  } else {
    res.status(500).send('Proxyが見つかりません。');
  }
});

module.exports = router;