# Better GitHub Utils

**English** | [日本語](./README-ja.md)

Better GitHub Utils shows whether a GitHub user follows you (profile pages / following lists), restores the activity feed on the home page, and provides an optional Personal Access Token (PAT) popup for authenticated API checks, rate-limit diagnostics, and repository automation helpers (archive/delete assistance).

## Features

- Show follow status on profile and followers/following lists
- Restore the activity feed on the GitHub home page (GitHub moved it to `/feed`; it is rendered below the Pull requests / Issues lists, with a working "More" button — no token required)
- Optionally store a Personal Access Token in the popup for authenticated API checks
- Rate-limit diagnostics (X-RateLimit headers) for troubleshooting
- Inline repository automation panel (Auto complete) for Archive/Delete tasks
- Resilient handling for MV3 service worker lifecycle with retries and content-side fallbacks

## Installation from source

1. Clone the repository and install dependencies:
   ```sh
   npm ci
   ```
2. Build the extension:
   ```sh
   npm run build
   ```
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the generated `dist/` directory.

## Development

- `npm run dev` — rebuild on every change
- `npm run check` — run typecheck, lint, formatting, and tests
- `npm test` — run the Vitest test suite
- `npm run build` — build `dist/` and create the release ZIP

## Usage

- Open a GitHub profile or followers/following list to see follow status badges.
- The home page shows the activity feed below the Pull requests / Issues lists.
- Use the extension popup to set a Personal Access Token for better rate limits and to enable automation features.

## Release

The **Build and Release** workflow builds and publishes a ZIP file. Run it manually with an optional semver version. A release is created only when the version is newer than the latest tag, unless `force_release` is enabled.
