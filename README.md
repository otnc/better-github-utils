# Better GitHub Utils

**English** | [日本語](README.ja.md)

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
