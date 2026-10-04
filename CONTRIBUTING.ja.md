# Contributing to Better GitHub Utils

[English](CONTRIBUTING.md) | **日本語**

Better GitHub Utilsの改善にご協力いただきありがとうございます。

## 開発環境のセットアップ

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm run format
npm run check
npm run docs:check
```

動作確認時は、`chrome://extensions`から`dist/`をパッケージ化されていない拡張機能として読み込みます。

## ドキュメント

`README.md`、`README.ja.md`、`CONTRIBUTING.md`、`CONTRIBUTING.ja.md`は、`*.base.md`からKiritanで生成されます。生成元を編集してから、次のコマンドを実行してください。

```sh
npm run docs:build
npm run docs:check
```

生成済みドキュメントを直接編集しないでください。

## プルリクエスト

`main`から目的を絞ったブランチを作成し、`main`へのプルリクエストを開きます。レビューを依頼する前に`npm run check`と`npm run docs:check`を実行してください。

## リリース

Actionsタブから**Build and Release**ワークフローを手動実行します。拡張機能をビルドし、パッケージのバージョンが最新タグより新しい場合にタグを作成して、Chrome用ZIPをGitHub Releaseに添付します。
