FROM node:20-slim

WORKDIR /app

# package.json (とあればlockファイル) をコピー
COPY package*.json ./

# ロックファイルがなくても、バージョンの競合があっても無理やりインストールするコマンド
RUN npm install --legacy-peer-deps

COPY . .

ENV PORT=8000
CMD ["node", "server.js"]
