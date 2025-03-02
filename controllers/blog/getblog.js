const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

async function Getblog(blogId) {
  const cachedData = cache.get(blogId);
  if (cachedData) {
    console.log('キャッシュからデータを取得');
    return cachedData;
  }

  try {
    const response = await axios.get(`https://wakameblog.glitch.me/blogs/latest`);

    cache.set(blogId, response.data);
    
    console.log('APIからデータを取得');
    return response.data;
  } catch (error) {
    console.error('APIの取得に失敗しました:', error);
    return null;
  }
}


module.exports = router;