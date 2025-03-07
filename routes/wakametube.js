const express = require("express");
const router = express.Router();
const path = require("path");
const ytsr = require("ytsr");
const serverYt = require("../server/youtube.js");

const limit = process.env.LIMIT || 50;

router.use("/watch", require("../controllers/tube/getvideo"));
router.use("/w", require("../controllers/tube/getvideo"));
router.use("/yt", require("../controllers/tube/youtube"));

router.get("/", (req, res) => {
  res.render("tube/home");
});

router.get("/s", async (req, res) => {
	let query = req.query.q;
	let page = Number(req.query.p || 1);
    try {
		res.render("tube/search.ejs", {
			res: await serverYt.search(query, limit, page),
			query: query,
			page
		});
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "ytsr Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.get("/ss", async (req, res) => {
	let query = req.query.q;
	let page = Number(req.query.p || 2);
    try {
		res.render("tube/opu/search.ejs", {
			res: await ytsr(query, {limit, pages: page}),
			query: query,
			page
		});
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "ytsr Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.use("/back", require("../controllers/tube/back"));
router.use("/redirect", require("../controllers/tube/redirect"));
router.use("/trend", require("../controllers/tube/trend"));
router.use("/cl", require("../controllers/tube/cl"));

module.exports = router;