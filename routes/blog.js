const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.end(JSON.stringify(process.versions, null, 2));
});

// Stats用のルートを /b/:id より前に定義する
router.get("/b/stats", async (req, res) => {
  try {
    // サーバー側でUptimeRobotのAPIを叩く
    const response = await fetch("https://stats.uptimerobot.com/api/getMonitorList/h5He3VeuIe");
    const data = await response.json();

    // 取得したデータを 'monitorData' としてEJSに渡す
    res.render("blog/stats", { monitorData: data });
  } catch (error) {
    console.error("Failed to fetch UptimeRobot stats:", error);
    // エラー時は null などを渡してフロントでエラー表示させる
    res.render("blog/stats", { monitorData: null });
  }
});

// 汎用的なブログページのレンダリング
router.get("/b/:id", (req, res) => {
  res.render(`blog/${req.params.id}`);
});

router.use("/n", require("../controllers/blog/getblog"));

module.exports = router;
