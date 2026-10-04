# Better GitHub Utils

:::kiritan{locale=en}
Better GitHub Utils shows whether a GitHub user follows you, restores the activity feed on the home page, and provides an optional Personal Access Token (PAT) popup for authenticated API checks, rate-limit diagnostics, and repository automation helpers.

## Features

- Show follow status on profile and followers/following lists
- Restore the activity feed below the Pull requests / Issues lists on the GitHub home page
- Use the restored feed without an extension token
- Store an optional Personal Access Token for authenticated API checks
- Diagnose GitHub API rate limits
- Provide repository automation helpers for archive and delete tasks

## Installation from source

1. Clone the repository and install dependencies:
   ```sh
   npm ci
   ```
2. Build the extension:
   ```sh
   npm run build
   ```
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the generated `dist/` directory.

## Development

- `npm run dev` — rebuild on every change
- `npm run check` — run typecheck, lint, formatting, documentation checks, and tests
- `npm test` — run the Vitest test suite
- `npm run docs:build` — regenerate localized documentation
- `npm run docs:check` — verify generated documentation
- `npm run build` — build `dist/` and create the release ZIP

## Usage

- Open a GitHub profile or followers/following list to see follow status badges.
- The home page shows the activity feed below the Pull requests / Issues lists.
- Use the extension popup to set a Personal Access Token for authenticated API checks and higher rate limits.

## Release

The **Build and Release** workflow builds and publishes a ZIP file. Run it manually with an optional semver version. A release is created only when the version is newer than the latest tag, unless `force_release` is enabled.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development and release details.
:::

:::kiritan{locale=ja}
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
:::
