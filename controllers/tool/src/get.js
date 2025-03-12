const axios = require('axios');
const express = require("express");
const router = express.Router();

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.get('/gethtml/:Url', async (req, res) => {
  const { Url } = req.params;
  const replacedUrl = decodeURIComponent(Url);
  const url = replacedUrl.replace(/\.wakame02\./g, '.');
  if (!url) {
    return res.status(400).send('URLが入力されていません');
  }
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': user_agent,
        'Accept-Language': 'ja;q=1.0,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      }
    });
    const html = response.data;
    const escapedHtml = response.data
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const outputHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>ViewSource:${url}</title>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/google/code-prettify@master/loader/skins/sons-of-obsidian.css">
          <script src="https://cdn.jsdelivr.net/gh/google/code-prettify@master/loader/loader.js"></script>
        </head>
        <body>
          <pre class="prettyprint lang-html linenums" style="overflow: auto; white-space: pre-wrap; word-break: break-all; font-size: 11px;">
            ${escapedHtml}
          </pre>
        </body>
      </html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(outputHtml);
  } catch (error) {
    res.status(500).send(`エラーです。${error.message}`);
  }
});

module.exports = router;