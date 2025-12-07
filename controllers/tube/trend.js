const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');

router.get("/", async (req, res) => {
  try {
    const response = await axios.get("https://raw.githubusercontent.com/siawaseok3/wakame/refs/heads/master/trend.json");
    const topVideos = await response.data;
    res.render("tube/trend.ejs", { topVideos });
  } catch (error) {
    console.error('エラーが発生しました:', error);
    res.render("tube/trend", { topVideos: [] });
  }
});

module.exports = router;
