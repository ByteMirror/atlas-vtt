# Development and pull requests

Use a branch for each change and open a pull request against `main`.

## Local checks

```sh
npm ci
npx tsc --noEmit
npx vitest run
npm run build:ci
npm run preflight
npm run release:prepare
```

`build:ci` builds without copying files into a local vault. CI runs these checks
and publishes an advisory ESLint report. Lint is not yet a merge gate because
of the existing lint backlog.

## Test builds

Successful Plugin CI runs attach an `atlas-vtt-<commit>` artifact containing
`main.js`, `manifest.json` and `styles.css`, retained for 14 days. For pull
requests, `<commit>` is the PR head commit, but the build itself is that commit
merged into the current `main`, so it may include base changes that are not in
the branch. Install these
files in an isolated test vault's `.obsidian/plugins/atlas-vtt/` directory and
reload the plugin. Include practical Obsidian test steps for interaction changes.
These artifacts do not publish a release or bump the version.

## Review and merge

Pull requests require green `build-plugin` and `atlas/pr-review` checks and an
up-to-date branch. Automated review is provided by a private maintainer-managed
service. Drafts are not automatically reviewed; external contributions require
manual maintainer review. If the review status reports an error, contact the
maintainer rather than bypassing or weakening CI.

The maintainer decides which fixes to implement, when to merge, and when to
publish a release. Stable releases continue through the Plugin Release workflow.
