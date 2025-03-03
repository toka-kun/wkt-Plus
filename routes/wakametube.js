const express = require("express");
const router = express.Router();
const path = require("path");
const ytsr = require("ytsr");

const limit = process.env.LIMIT || 50;

router.get("/", (req, res) => {
  res.render("tube/home");
});

router.get("/s", async (req, res) => {
	let query = req.query.q;
	let page = Number(req.query.p || 2);
    try {
		res.render("tube/search.ejs", {
			res: await ytsr(query, { limit, pages: page }),
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

router.get("/s", async (req, res) => {
	let query = req.query.q;
	let page = Number(req.query.p || 2);
    try {
		res.json();
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

module.exports = router;