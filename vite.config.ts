import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    target: "es2020",
    rollupOptions: {
      input: {
        "src/background": "src/background.ts",
        "src/content": "src/content.ts",
        "popup/script": "src/popup.ts",
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
  },
});
