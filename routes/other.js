const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.render("other/home");
});

router.get(['/others/:id', '/urls/:id'], async (req, res) => {
  const id = req.params.id;
  
  // リクエストされたパス（/others/... か /urls/...）を取得してディレクトリを決定
  const category = req.path.split('/')[1]; 
  
  res.render(`other/${category}/${id}`);
});

module.exports = router;
