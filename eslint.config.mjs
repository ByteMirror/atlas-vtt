import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Obsidian's community directory scores the plugin with `recommended`, so every
// finding of those rules is a public scorecard row. Additions below only make
// the local gate stricter, never looser.
//
// The overrides are limited to script files. `recommended` also lints
// `package.json` (without the TypeScript plugin), and an unscoped
// `@typescript-eslint/*` rule there is a fatal ESLint error, which is what
// Obsidian's whole-repository scan runs into.
const SCRIPT_FILES = ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"];

export default defineConfig([
  globalIgnores(["atlas-website/", "token-ui-examples/", "party/", "logs/", "benchmarks/", "release/", "dist/", "node_modules/", "test-vault/", "networking-test-vault/", "tests/", "scripts/", "docs/", "vite/", "**/*.test.*", "*.js", "*.cjs", "*.mjs", "*.mts", "*.config.ts"]),
  ...obsidianmd.configs.recommended,
  {
    files: SCRIPT_FILES,
    rules: {
      // "Atlas" is the product name. `ignoreWords` rather than `brands`,
      // because `brands` replaces the rule's built-in list (Obsidian, GitHub, …).
      "obsidianmd/ui/sentence-case": ["warn", { ignoreWords: ["Atlas", "Fantasy", "Statblocks"] }],
      // Stricter than the scorecard: type errors are fixed, not silenced.
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-expect-error": true,
      }],
      // A `title` attribute shows the browser's tooltip. Atlas shows its own
      // (`LabelTooltip`) where one is wanted and names controls with `aria-label`.
      "no-restricted-syntax": ["error",
        {
          selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
          message: "`title` shows the browser tooltip. Use `aria-label`, or `LabelTooltip` for a visible tooltip.",
        },
        {
          selector: "CallExpression[callee.property.name=/^(setAttribute|setAttr)$/][arguments.0.value='title']",
          message: "`title` shows the browser tooltip. Use `aria-label`, or `LabelTooltip` for a visible tooltip.",
        },
        {
          selector: "Property[key.name='attr'] > ObjectExpression > Property[key.name='title']",
          message: "`title` shows the browser tooltip. Use `aria-label`, or `LabelTooltip` for a visible tooltip.",
        },
        {
          selector: "AssignmentExpression > MemberExpression.left[property.name='title'][object.type!='ThisExpression']:not([object.name=/^(doc|document)$/])",
          message: "`title` shows the browser tooltip. Use `aria-label`, or `LabelTooltip` for a visible tooltip.",
        },
      ],
    },
  },
  {
    files: SCRIPT_FILES,
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    linterOptions: {
      // Findings are fixed at their root. An accepted exception is recorded in
      // eslint.suppressions.json, where a review sees it, never in a comment.
      // The file is not at ESLint's default location on purpose: Obsidian's
      // directory review runs ESLint with its own rule set, and a suppression
      // that set does not use makes ESLint exit 2, which the review reports
      // as a fatal error. Only npm run lint passes --suppressions-location.
      noInlineConfig: true,
    },
  },
]);
