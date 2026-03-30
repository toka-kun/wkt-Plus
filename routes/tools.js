const express = require("express");
const router = express.Router();
const path = require("path");

// --- ホーム画面 ---
router.get("/", (req, res) => {
  res.render("tools/home");
});

// tool
router.get("/tool/:id", (req, res) => {
  res.render(`tools/tool/${req.params.id}`);
});

// pro
router.get("/pro/:id", (req, res) => {
  res.render(`tools/pro/${req.params.id}`);
});

// --- コントローラー ---
router.use("/inv", require("../controllers/tool/src/inv"));
router.use("/html", require("../controllers/tool/src/get"));

module.exports = router;
