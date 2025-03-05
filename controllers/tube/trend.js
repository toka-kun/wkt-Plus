import axios from 'axios';
import express from 'express';
import path from 'path';
import http from 'http';

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const response = await axios.get(`https://wataamee.glitch.me/topvideos/apiv2`, { timeout: 5000 });
    const topVideos = response.data;
    res.render("tube/trend.ejs", { topVideos });
  } catch (error) {
    console.error('エラーが発生しました:', error);
    res.render("tube/trend", { topVideos: [] });
  }
});

export default router;