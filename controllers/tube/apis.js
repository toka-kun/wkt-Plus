const axios = require('axios');

// 取得先URLの構成リスト
const fetchConfigs = [
  { name: 'inv.json', url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/Invidious/yes.json' },
  { name: 'min.json', url: 'https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube-api.json' },
  { name: 'xerox.json', url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/XeroxYT-NT/yes.json' }
];

// データを取得する関数
async function getParamData(config) {
  try {
    const response = await axios.get(config.url, { timeout: 5000 });
    // 取得したJSONオブジェクトを文字列化して返す
    return JSON.stringify(response.data, null, 2);
  } catch (error) {
    console.error(`${config.name}の取得に失敗しました:`, error.message);
    return '[]'; // エラー時はとりあえず空の配列を返す
  }
}

// ルーティングをループで一括生成
fetchConfigs.forEach(config => {
  router.get(`/${config.name}`, async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); // JSONとしてブラウザに認識させる
    const data = await getParamData(config);
    res.send(`${data}`);
  });
});
