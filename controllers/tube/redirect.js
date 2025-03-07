const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');

router.get("/mode", (req, res) => {
  const mode = req.query.mode;
  const videoId = req.params.id;
  if (mode === 'normal') {
    res.redirect(`/wkt/watch/${videoId}`);
  } else if (mode === 'edu') {
    res.redirect(`/wkt/watch/${videoId}`);
  } else if (mode === 'nocookie') {
    res.redirect(`/wkt/watch/${videoId}`);
  } else {
    res.redirect(`/wkt/watch/${videoId}`);
  }
});

module.exports = router;