"use strict";
const express = require("express");
let app = express();
const cluster = require("cluster");
const os = require("os");
const compression = require("compression");
const numClusters = os.cpus().length;
if (cluster.isMaster) {
  for (let i = 0; i < numClusters; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    cluster.fork();
  });
} else {
  app.use(compression());
  app.use(express.static(__dirname + "/public"));
  app.set("view engine", "ejs");
  app.listen(3000, () => {
    console.log(`Worker ${process.pid} started`);
  });
}

const path = require("path");
const bodyParser = require("body-parser");

app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.render("home/index");
});

app.use("/tools", require("./routes/tools"));