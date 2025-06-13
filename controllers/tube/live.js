const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");
const http = require('http');
const miniget = require("miniget");
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");

const user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

const RETRY_DELAY_MS = 1000;
const MINIGET_RETRY_LIMIT = 3;

router.get("/s/:id", async (req, res) => {
    const videoId = req.params.id;
    if (!videoId) return res.redirect("/");
    try {
        const videoInfo = await wakamess.ggvideo(videoId);
        const hlsUrl = videoInfo.hlsUrl;
        if (!hlsUrl) {
            return res.status(500).send("No live stream URL available.");
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        const fetchStreamWithRetry = async (url, retryCount = 0) => {
            try {
                const stream = miniget(url);
                stream.pipe(res);

                stream.on('error', (err) => {
                    console.error("Error while streaming HLS:", err);
                    if (retryCount < MINIGET_RETRY_LIMIT) {
                        console.log(`Retrying... (${retryCount + 1}/${MINIGET_RETRY_LIMIT})`);
                        setTimeout(() => fetchStreamWithRetry(url, retryCount + 1), RETRY_DELAY_MS);
                    } else {
                        res.status(500).send("Failed to stream after multiple retries.");
                    }
                });
                stream.on('end', () => {
                    console.log('Stream ended.');
                });
            } catch (err) {
                if (retryCount < MINIGET_RETRY_LIMIT) {
                    console.log(`Error fetching stream. Retrying... (${retryCount + 1}/${MINIGET_RETRY_LIMIT})`);
                    setTimeout(() => fetchStreamWithRetry(url, retryCount + 1), RETRY_DELAY_MS);
                } else {
                    res.status(500).send("Failed to fetch stream after multiple retries.");
                }
            }
        };
        await fetchStreamWithRetry(hlsUrl);
    } catch (error) {
        console.error("Error fetching video info:", error);
        res.status(500).send(error.toString());
    }
});

module.exports = router;
