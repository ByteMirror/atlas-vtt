# Releasing Atlas VTT

## Cut a release

1. `npm version patch` (or `minor` / `major`). This bumps `package.json`, `manifest.json` and `versions.json` together and creates a git tag. `.npmrc` sets an empty tag prefix, so the tag equals the manifest version exactly (`0.1.1`, not `v0.1.1`), which Obsidian requires.
2. `git push && git push --tags`
3. Publish a GitHub release for that tag. `plugin-release.yml` then builds the plugin, checks that the tag equals `manifest.json`'s version, attests build provenance and attaches `main.js`, `manifest.json` and `styles.css` as individual assets.

Obsidian installs exactly those three files. Anything the plugin needs at runtime (sounds, images) must be inlined into `main.js` or `styles.css`.

## BRAT beta distribution

Publish a GitHub release marked **Pre-release**, with the same version as its manifest and the three assets above. BRAT users add `ByteMirror/atlas-vtt` to install it; a community-directory listing is not required. Current BRAT reads the manifest from the release assets, so no `manifest-beta.json` is needed. See [BRAT's developer guide](https://tfthacker.com/brat-developers).

Use GitHub's prerelease flag for beta releases and a new version for each beta so BRAT detects the update. Once a stable version is listed in the community directory, keep later beta version bumps on a beta branch until they are ready for the stable channel.

## Community directory

Submission and updates go through <https://community.obsidian.md> (not a pull request to `obsidian-releases`).

- First submission: sign in, link GitHub, add the repository. An automated review of the manifest, release assets, source code and a build verification runs within minutes. Only errors block the listing; warnings are shown on the scorecard.
- Updates: publishing a new GitHub release is enough. Every release is scanned again.
- Use **Review branch** in the developer dashboard to scan a branch, tag or commit before releasing.
- The build verification runs `npm run build` in a clean container. `postbuild` only copies into vaults that already exist, so it is a no-op there.
- `npm run lint` runs `eslint-plugin-obsidianmd`, the same rule set the scanner uses.

Screenshots (1200×800), icon, descriptions and categories are edited in the dashboard under **Edit listing**, not in the repository.

## Validation and known review findings

CI gates changes on TypeScript, the test suite, the production build, local preflight checks and release asset validation. The release workflow repeats these checks before preparing assets. One WebGL integration test is intentionally skipped in the jsdom suite.

ESLint currently reports an existing typing backlog and a `Function` constructor used for Fantasy Statblocks layout callbacks (see [PRIVACY.md](../PRIVACY.md)). CI uploads the full ESLint JSON report as an advisory artifact; a green CI run does not mean lint is clean. Local preflight also reports bundle/CSS warnings for the Function constructor, HTML rendering, clipboard access, `!important` and `:has()`.

Local preflight is only an approximation. The authoritative result is the portal's **Review branch** scan, as described in [Obsidian's entry management documentation](https://docs.obsidian.md/community-directory/manage-entry). Resolve any portal errors before publishing the directory listing.
