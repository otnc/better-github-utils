import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "public/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Best-effort chrome API calls are wrapped in intentionally empty catches (a failed call just skips that step).
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { caughtErrors: "none", argsIgnorePattern: "^_" },
      ],
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  prettier,
);
