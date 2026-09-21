import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Obsidian's community directory scores the plugin with `recommended`, so every
// finding of those rules is a public scorecard row. Additions below only make
// the local gate stricter, never looser.
export default defineConfig([
  globalIgnores(["atlas-website/", "token-ui-examples/", "party/", "logs/", "benchmarks/", "release/", "dist/", "node_modules/", "test-vault/", "networking-test-vault/", "tests/", "scripts/", "docs/", "**/*.test.*", "*.js", "*.mjs", "*.config.ts"]),
  ...obsidianmd.configs.recommended,
  {
    rules: {
      // "Atlas" is the product name. `ignoreWords` rather than `brands`,
      // because `brands` replaces the rule's built-in list (Obsidian, GitHub, …).
      "obsidianmd/ui/sentence-case": ["warn", { ignoreWords: ["Atlas"] }],
      // Stricter than the scorecard: type errors are fixed, not silenced.
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-expect-error": true,
      }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    linterOptions: {
      // Findings are fixed at their root. An accepted exception is recorded in
      // eslint-suppressions.json, where a review sees it, never in a comment.
      noInlineConfig: true,
    },
  },
]);
