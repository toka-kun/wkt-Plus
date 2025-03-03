const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.render("tube/home");
});

router.use("/back", require("../controllers/tube/back"));

module.exports = router;