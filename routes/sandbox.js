const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.render("tools/home");
});

router.get("/page/:id", (req, res) => {
  res.render(`sandbox/page/${req.params.id}`);
});

module.exports = router;