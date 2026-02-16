## 🚀 まずはRemix

1. このリポジトリを GitHub で開く
2. 右上の **[Fork]** ボタンをクリック
3. 自分の GitHub アカウントに新しいリポジトリとして作成
4. 作成したプロジェクトをRenderなどにデプロイ！
5. 僕がこのレポジトリを編集してもRemixしたプロジェクトには自動では反映されないので、最新版にするには **[Sync fork]** → **[Update branch]** を押し手動で更新して下さい。

---

## 🛠 Render でのデプロイ手順

1. [Render](https://dashboard.render.com/) にログインまたは新規登録
2. 「New」 → 「Web Service」 を選択
3. Remixしたわかめtubeのリポジトリを選択
4. Instance Typeを「Free」にして一番下の完了ボタン的なとこを押す
5. 数分待つと完了です☑️

---

## 🛠 Koyeb でのデプロイ手順

1. [Koyeb](https://app.koyeb.com/) にログインまたは新規登録
2. 「Create Service」 → 「GitHub」 を選択
3. Remixしたわかめtubeのレポジトリを選択
4. 「Dockerfile」を選択
5. Instanceを「Free」にしてそのまま進み、一番下の完了ボタン的なとこを押す
6. 数分待つと完了です☑️

---

## 🛠 CodeSandbox でのデプロイ手順

1. [CodeSandbox](https://codesandbox.io/dashboard) にログインまたは新規登録
2. 「Import」を選択
3. Remixしたわかめtubeのレポジトリを選択
4. Runtimeを用途に合わせて選択（CodeSandboxの容量は多くないので僕は一番消費が少ないやつにしてます。）し、一番下の完了ボタン的なとこを押す
5. 右に出てきた画面から「Next」を押し続ける。途中「Protect main branch」ってのが出てくるけどそこはオンにするのがおすすめ
6. そのまま「Apply」まで押す
7. 右下にOpen Previewって出てくると完了です。Open Previewを押すとリンクが分かります☑️

---

## 対応しているデプロイサービス

1. [Render](https://dashboard.render.com/)
2. [Vercel](https://vercel.com/) （Internal Server Errorが出る時があるが、再読み込みでだいたい治る） 
3. [Railway](https://railway.com/dashboard)
4. [Koyeb](https://app.koyeb.com/)
5. [CodeSandbox](https://codesandbox.io/dashboard)


---

## 改善した箇所

- 2025/10/24 - Education再生を復活 [@siawaseok3](https://github.com/siawaseok3)
- 2025/12/06 - トレンド機能を復活 [@siawaseok3](https://github.com/siawaseok3)
- 2025/12/09 - Education再生時のエラーを修正
- 2026/01/22 - トレンドページのUIを改善
- 2026/01/27 - Koyebでのデプロイに対応
- 2026/01/28 - [チョコのレポジトリ](https://github.com/cake-wakame/wkt) をパクってCodeSandboxでのデプロイに対応 [@banana-coco](https://github.com/banana-coco) （どうやらこれのお陰でVercelにも対応できたっぽいです。）
- 2026/02/16 - Invidiousを既存のものにさらに追加、安定性が増したはずです。

---

## ToDo

2026年3月に一気にやります。それまでお待ち下さい。
- プロキシを復活
- Invidiousからの取得方法を改善
- UXを改善（特にヘルプページ）
- Educationのパラメーターを選択制に
- ゲームをさらに追加
- Koyebでのデプロイ方法を見直し

---

## 📄 ライセンス

このプロジェクトは **CC-BY-4.0** ライセンスのもとで公開されています。再配布・改変などなどOK！
