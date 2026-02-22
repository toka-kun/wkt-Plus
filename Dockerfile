# Node.js 20系の軽量版を使用
FROM node:20-slim

WORKDIR /app

# package.json をコピー
COPY package*.json ./

# KoyebのBuildpackエラーを回避するため、ここで強制インストール
RUN npm install --legacy-peer-deps

# ソースコードをコピー
COPY . .

# 【重要】Hugging Face Spacesは特殊なユーザー権限で動くため、ファイルへのアクセス権限を付与
RUN chmod -R 777 /app

# 【重要】Hugging Face Spaces必須のポート番号「7860」に統一
# Koyebもこの設定を読み取って7860ポートで動いてくれます
ENV PORT=7860
EXPOSE 7860

# サーバー起動コマンド
CMD ["node", "--dns-result-order=ipv4first", "server.js"]
