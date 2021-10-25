# WebRTC Broadcasting Sample

このプロジェクトは、WebRTC とブラウザを使って配信するサンプルプロジェクトです。

がねこまさし氏の連載記事[WebRTC でキャスしよう！片方向リアルタイム映像配信を作ろう]に記載のソースコードを 2021/10 現在の API 仕様で動くように改変しています。

引用元：https://html5experts.jp/mganeko/11444/

# Requirement

WebSocket サーバー/クライアント間は socket.io ライブラリを使用しています。
その他に、Web アプリケーション開発のフレームワークとして Express を使用しています。

- express 4.17.1
- socket.io 4.3.1
- socket.io-client 4.3.2

# Installation

上記ライブラリを npm で個別にインストールするか、
`npm install` で依存ライブラリを一括インストールします。

```bash
npm install express
npm install socket.io socket.io-client

or

npm install
```

# Usage

git でリポジトリのクローンを作成後、`node server.js` でサーバーを実行。

```bash
git clone hhttps://github.com/fora-soma/webrtc_broadcast_sample.git
cd webrtc_broadcast_sample
npm server.js
```

ブラウザで下記ページを開き、送信側ページ（tx.html）で Start Video ボタンをクリックすると受信側ページで Web カメラの映像が表示されます。

- http://localhost:9001/tx.html
- http://localhost:9001/rx.html

# Note

現在、動作が不安定で Start Video ボタンをクリックしても受信側で映像が表示されないことが多いです。

原因については現在調査中で、判明し次第修正いたします。

# License

"WebRTC Broadcasting Sample"は、社内での使用を目的としています。

"WebRTC Broadcasting Sample" is intended for internal use.
