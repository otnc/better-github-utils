# Better GitHub Utils

[English](README.md) | **日本語**

Better GitHub Utilsは、GitHubユーザーのフォロー状況を表示し、ホームページにアクティビティフィードを復元するChrome拡張機能です。オプションでPersonal Access Token（PAT）を設定すると、認証済みAPIチェック、レート制限の診断、リポジトリ操作の補助を利用できます。

## 主な機能

- プロフィール、followers/followingリストでフォロー状況を表示
- ホームのPull requests / Issuesリストの下にアクティビティフィードを復元
- 拡張機能のトークンなしでフィードを表示
- PATを使った認証済みAPIチェック
- GitHub APIのレート制限を診断
- リポジトリのアーカイブ・削除を補助

## インストール（ソースから）

1. リポジトリをクローンして依存パッケージをインストールします。
   ```sh
   npm ci
   ```
2. 拡張機能をビルドします。
   ```sh
   npm run build
   ```
3. Chromeで`chrome://extensions`を開きます。
4. **デベロッパーモード**を有効にします。
5. **パッケージ化されていない拡張機能を読み込む**をクリックし、生成された`dist/`を選択します。

## 開発

- `npm run dev` — 変更のたびに再ビルド
- `npm run check` — 型チェック、lint、フォーマット、ドキュメント、テストを実行
- `npm test` — Vitestのテストを実行
- `npm run docs:build` — 多言語ドキュメントを再生成
- `npm run docs:check` — 生成済みドキュメントを検証
- `npm run build` — `dist/`とリリース用ZIPを生成

## 使い方

- GitHubのプロフィールやfollowers/followingリストを開くとフォロー状況バッジが表示されます。
- ホームのPull requests / Issuesリストの下にアクティビティフィードが表示されます。
- 拡張機能のポップアップでPATを設定すると、認証済みAPIチェックと高いレート制限を利用できます。

## リリース

**Build and Release**ワークフローを手動実行すると、拡張機能をビルドしてZIPを公開します。semver形式のバージョンを指定でき、最新タグより新しい場合だけリリースされます。`force_release`を有効にすると比較を無視できます。

開発とリリースの詳細は[CONTRIBUTING.ja.md](./CONTRIBUTING.ja.md)を参照してください。
