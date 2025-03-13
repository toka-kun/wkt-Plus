const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.end(JSON.stringify(process.versions, null, 2));
});

router.use("/n", require("../controllers/blog/getblog"));

module.exports = router;