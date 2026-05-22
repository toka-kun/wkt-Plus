const express = require("express");
const router = express.Router();
const path = require("path");

// 対応させたいパスのリスト
const targets = ["sia", "xerox", "wista", "labo5", "player", "min", "yuto"];

router.get("/", (req, res) => {
  res.render("other/home");
});

// リスト内の各項目に対して自動的にルーティングを設定
targets.forEach((target) => {
  
  // 例: /sia にアクセスしたとき -> other/sia/home をレンダリング
  // (メインアプリ側で app.use('/other', router) としている場合、URLは /other/sia となります)
  router.get(`/${target}`, (req, res) => {
    res.render(`other/${target}/home`);
  });

  // 例: /sia/src にアクセスしたとき -> other/sia/src をレンダリング
  router.get(`/${target}/:id`, async (req, res) => {
    const id = req.params.id;
    res.render(`other/${target}/${id}`);
  });

});

module.exports = router;
