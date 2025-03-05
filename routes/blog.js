const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.render("tools/home");
});

router.use("/n", require("../controllers/blog/getblog"));

module.exports = router;