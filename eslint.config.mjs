import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores(["atlas-website/", "token-ui-examples/", "party/", "logs/", "benchmarks/", "release/", "dist/", "node_modules/", "test-vault/", "networking-test-vault/", "tests/", "scripts/", "docs/", "**/*.test.*", "*.js", "*.mjs", "*.config.ts"]),
  ...obsidianmd.configs.recommended,
  {
    files: ["src/app/changelog/**/*.{ts,tsx}"],
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { ignoreWords: ["Atlas"] }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
]);
