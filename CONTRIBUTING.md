# Contributing

1. Create a branch from `main`.
2. Make your change. Coding conventions are described in [`CLAUDE.md`](CLAUDE.md); the short version: PIXI.js v8 (not the v7 Obsidian bundles), SCSS with Obsidian CSS variables, explicit return types, files under roughly 300 lines.
3. Run `npx tsc --noEmit`, `npm test` and `npm run build`.
4. Open a pull request that describes what changed and how you tested it.

Atlas VTT follows the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines). Changes that add network requests must be disclosed in `README.md` and `PRIVACY.md`.

Contributions are accepted under the repository’s [PolyForm Noncommercial License 1.0.0](LICENSE). Submit only work you have the right to contribute under these terms.
