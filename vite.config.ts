import { defineConfig } from "vite";

// dist/ mirrors the layout the manifest references: static files are copied
// verbatim from public/, and each entry builds to the exact path the manifest
// or popup HTML loads. The dynamically imported utils are also entries so the
// content script can keep loading them via chrome.runtime.getURL() until they
// are statically bundled.
export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    target: "es2020",
    rollupOptions: {
      // The utils are loaded via dynamic import(chrome.runtime.getURL(...)),
      // so their entry files must keep every export instead of being
      // tree-shaken down to side effects.
      preserveEntrySignatures: "strict",
      input: {
        "src/background": "src/background.ts",
        "src/content": "src/content.js",
        "popup/script": "src/popup.ts",
        "src/utils/follow/api": "src/utils/follow/api.ts",
        "src/utils/follow/client": "src/utils/follow/client.ts",
        "src/utils/follow/dom": "src/utils/follow/dom.ts",
        "src/utils/autocomplete/actions": "src/utils/autocomplete/actions.ts",
        "src/utils/autocomplete/dom": "src/utils/autocomplete/dom.ts",
        "src/utils/homefeed/feed": "src/utils/homefeed/feed.js",
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
  },
});
