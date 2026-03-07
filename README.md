---
title: wkt-Plus
emoji: 📺
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# わかめtube Plusへようこそ！

もう開発が終了したわかめtubeに [@toka-kun](https://github.com/toka-kun) が改良を加えているものです。大幅に強化しています。

## 特徴

- 動画再生の安定化
  - Education
  - ストリーミング再生
- トレンド情報をまた閲覧できるように改善
- その他エラー改善
- 詳しくは[更新ログ](#更新ログ)へ

# 🚀 クイックスタート

1. このリポジトリを GitHub で開く
2. 右上の **[Fork]** ボタンをクリック
3. 自分の GitHub アカウントに新しいリポジトリとして作成
4. 作成したプロジェクトをRenderなどにデプロイ！
5. 僕がこのレポジトリを編集してもRemixしたプロジェクトには自動では反映されないので、最新版にするには **[Sync fork]** → **[Update branch]** を押し手動で更新して下さい。

---

## 対応しているデプロイサービス

1. [Render](#-renderでのデプロイ手順)
2. [Vercel](https://vercel.com/) （エラーが出やすい） 
3. [Railway](https://railway.com/dashboard)
4. [Koyeb](#-koyebでのデプロイ手順)
5. [CodeSandbox](#-codesandboxでのデプロイ手順)
6. [Hugging Face Spaces](#-hugging-face-spacesでのデプロイ手順) （YouTubei.jsが使えないので中身のないただの箱になります。）

---

### 🛠 Renderでのデプロイ手順

1. [Render](https://dashboard.render.com/) にログインまたは新規登録
2. 「New」 → 「Web Service」 を選択
3. Remixしたわかめtubeのリポジトリを選択
4. Instance Typeを「Free」にして一番下の完了ボタン的なとこを押す
5. 数分待つと完了です☑️

---

### 🛠 Koyebでのデプロイ手順

1. [Koyeb](https://app.koyeb.com/) にログインまたは新規登録
2. 「Create Service」 → 「GitHub」 を選択
3. Remixしたわかめtubeのレポジトリを選択
4. 「Dockerfile」を選択
5. Instanceを「Free」にしてそのまま進み、一番下の完了ボタン的なとこを押す
6. 数分待つと完了です☑️

---

### 🛠 CodeSandboxでのデプロイ手順

1. [CodeSandbox](https://codesandbox.io/dashboard) にログインまたは新規登録
2. 「Import」を選択
3. Remixしたわかめtubeのレポジトリを選択
4. Runtimeを用途に合わせて選択（CodeSandboxの容量は多くないので僕は一番消費が少ないやつにしてます。）し、一番下の完了ボタン的なとこを押す
5. 右に出てきた画面から「Next」を押し続ける。途中「Protect main branch」ってのが出てくるけどそこは念の為オンにして下さい
6. そのまま「Apply」まで押す
7. 右下にOpen Previewって出てくると完了です。Open Previewを押すとリンクが分かります☑️

---

### 🛠 Hugging Face Spacesでのデプロイ手順

1. [Huggind Face](https://huggingface.co/) にログインまたは新規登録
2. 「New Space」を選択
3. Space SDKは「Docker」を選択
4. Docker Templateは「Blank」を選択
5. Space Hardwareは「Free（CPU basic · 2 vCPU · 16GB）」を選択
7. Visibilityは「Public（公開）」か「Private（自分だけ）」を選択
8. 一番下の 「Create Space」 ボタンを押す
9. このあとはファイルをアップロード。下の2つからお好みの方法を選んで下さい。

- ファイルを直接アップロード
  1. ブラウザから直接アップロードするのが一番手っ取り早いです。
  2. 画面上部にある **[Files]** タブをクリックします。
  3. 右上の 「+ Add file」 を押し、「Upload files」 を選択します。
  4. コード一式（Dockerfile, package.json, server.js, その他のフォルダ等） をまとめてドラッグ＆ドロップします。
  5. 画面下部にある 「Commit changes to main」 ボタンを押して保存
 
- GitHubと連携
  1. まずは、GitHubがHFSにコードを書き込めるようにするためのパスワード（トークン）を発行
      - Hugging Faceにログインし、右上のプロフィールアイコンから [Settings] を開く。
      - 左メニューの **[Access Tokens]** → **[Create new token]** を開く
      - 設定を以下のようにして下さい：
        - Token Type: Write
        - Name: GITHUB_SYNC など適当な名前
      - 作成されたトークン（hf_... で始まる長い文字列）をコピー。※この画面を閉じると二度と見られないので注意！
  2. GitHubに合鍵を登録する
      - コピーしたトークンをGitHub側に入力
        - レポジトリの上部タブの **[Settings]** を開く
        - 左メニューの **[Security]** の中にある **[Secrets and variables] → **[Actions]** をクリック
        - 緑色の **[New repository secret]** ボタンを押します。
        - 以下のように入力して **[Add secret]** を押します：
          - Name: HF_TOKEN
          - Secret: さっきコピーしたHugging Faceのトークンを貼り付け
      - すでに `.github/workflows/sync-hfs.yml.bak` というファイルがあるので、ファイル名を `.github/workflows/sync-hfs.yml` に変更し、コード内の YOUR_HF_USERNAME と YOUR_SPACE_NAME を自分のものに書き換えて下さい
      - ⚠️ 最後の行の書き換え必須ポイント ⚠️
        - YOUR_HF_USERNAME → あなたのHugging Faceのユーザー名（2箇所あります）
        - YOUR_SPACE_NAME → 先ほど作ったSpaceの名前（例: wkt-plus）
        - master:main → GitHub側が master ブランチで、HFS側が main ブランチの場合の書き方です。（両方 main なら main:main でOKです）
 
9. ファイルを保存すると、画面上部の表示が自動的に 「Building」 に変わるので、そのまま数分待ちます。
10. ステータスが緑色の 「Running」 に変われば完了です☑️

---

# 更新ログ

- 2025/10/24 - Education再生を復活 [@siawaseok3](https://github.com/siawaseok3)
- 2025/12/06 - トレンド機能を復活 [@siawaseok3](https://github.com/siawaseok3)
- 2025/12/09 - Education再生時のエラーを修正
- 2026/01/22 - トレンドページのUIを改善
- 2026/01/27 - Koyebでのデプロイに対応
- 2026/01/28 - [チョコのレポジトリ](https://github.com/cake-wakame/wkt) をパクってVercelとCodeSandboxでのデプロイに対応 [@banana-coco](https://github.com/banana-coco) 
- 2026/02/16 - Invidiousを既存のものにさらに追加、安定性が増したはずです。
- 2026/02/22 - Educationのパラメーターを一旦全7種のパラメーターを取得し、Toka_Kun_-1のみ使うように変更 [@toka-kun](https://github.com/toka-kun)
- 2026/02/23 - Educationのパラメーターをもう2種類取得するように変更、Nocookie再生時のパラメーターを微調整、Railwayでデプロイすると動画ページの関連動画から検索したときにエラーが出る問題を改善
- 2026/03/01 - 動画を投稿していないチャンネルのページを開けない問題を改善
- 2026/03/02 - InnerTubeのエラー関連（特にVercel）を改善
- 2026/03/06 - これまでは360pでしか視聴できなかった動画も高画質で視聴できるようにInvidiousからWebMだけではなくMP4も取得するように変更
- 2026/03/07 - Invidious APIに加え、SiaTube API、YuZuTube API、XeroxYT-NT API、MIN-Tube2 APIを追加

---

## ToDo

- プロキシを復活
- できたらもう一度HFSに挑戦
- 関連動画を表示
- UXを改善（特にヘルプページ）
- Educationのパラメーターを選択制に
- ゲームをさらに追加

---

# 👥 クレジット

このプロジェクトは、多くの方々のコードによって成り立っています。

- [@wakame02](https://github.com/wakame02)
  - わかめtube 開発
- [@toka-kun](https://github.com/toka-kun) 
  - わかめtube Plus 開発
  - Educationパラメーター
- [@siawaseok3](https://github.com/siawaseok3)
  - Educationパラメーター
  - トレンド情報
  - SiaTube API
- [@yuzubb](https://github.com/yuzubb)
  - YuZuTube API
- [@Xerox-Pro](https://github.com/Xerox-Pro)
  - XeroxYT-NT API 
- [@mino-hobby-pro](https://github.com/mino-hobby-pro)
  - MIN-Tube2 API
- [@banana-coco](https://github.com/banana-coco)
  - Vercel & CodeSandbox デプロイ対応
- [@woolisbest-4520](https://github.com/woolisbest-4520)
  - Educationパラメーター

---

# 📄 ライセンス

本プロジェクトは、元の作品のライセンスを尊重しつつ、独自の改善を加えた混在ライセンスとなっています。

- **元のプログラム部分（わかめtube）**
  - [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.ja)
  - Copyright (c) wakame02
- **追加・改変されたプログラム部分（わかめtube Plus）**
  - [MIT License](https://opensource.org/licenses/MIT)
  - Copyright (c) 2026 toka-kun

詳細はリポジトリ内の `LICENSE` ファイルをご確認ください。
