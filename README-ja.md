# Better GitHub Utils

[English](./README.md) | **日本語**

Better GitHub Utils は、プロフィールページや following リストで「そのユーザーがあなたをフォローしているか」を表示し、ホームページにアクティビティフィードを復元する拡張機能です。オプションで Personal Access Token（PAT）をポップアップから設定することで、認証済み API チェックやレート制限の診断、リポジトリ自動化（アーカイブ／削除支援）などの機能が利用できます。

## 機能

- プロフィール、followers/following リスト、ホバーカードでフォロー状況を表示
- GitHub のホームページにアクティビティフィードを復元（GitHub はフィードを `/feed` へ移動しましたが、ホームの Pull requests / Issues リストの下に表示し、「More」ボタンも動作します。トークン不要）
- ポップアップで PAT を設定して認証済み API を利用可能
- レート制限の診断（`X-RateLimit` ヘッダ）でトラブルシュートを支援
- リポジトリの自動化パネル（アーカイブ／削除の補助）を提供
- Chrome MV3 の service worker ライフサイクルに対応した、キャッシュとフォールバックによる頑健な実装

## インストール（ソースから）

1. リポジトリをクローンして依存関係をインストールします。
   ```sh
   npm ci
   ```
2. 拡張機能をビルドします。
   ```sh
   npm run build
   ```
3. Chrome を開き、`chrome://extensions` にアクセスします。
4. **デベロッパーモード** を有効にします。
5. **パッケージ化されていない拡張機能を読み込む** をクリックし、生成された `dist/` フォルダを選択します。

## 開発

- `npm run dev` — 変更のたびに再ビルド
- `npm run check` — 型チェック、lint、フォーマット、テストを実行
- `npm test` — Vitest のテストを実行
- `npm run build` — `dist/` とリリース用 ZIP を生成

## 使い方

- GitHub のプロフィールページや followers/following リスト、ホバーカードを開くとフォロー状況のバッジが表示されます。
- ホームページの Pull requests / Issues リストの下にアクティビティフィードが表示されます。
- 拡張機能のポップアップで PAT を設定すると、認証済み API によるチェックや高いレート制限が利用できます。

## リリース

**Build and Release** ワークフローを手動実行すると、ビルドした ZIP をGitHub Releaseとして公開します。semver形式のバージョンを指定でき、最新タグより新しい場合だけリリースされます。`force_release` を有効にするとこの比較を無視できます。
