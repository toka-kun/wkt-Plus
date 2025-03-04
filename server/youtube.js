const YouTubeJS = require("youtubei.js");

let client;

module.exports.setClient = (newClient) => (client = newClient);