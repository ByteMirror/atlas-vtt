# Development and pull requests

Atlas has two long-lived branches:

| Branch | Channel | Version format | Who gets it |
| --- | --- | --- | --- |
| `beta` | Beta builds for QA | `x.y.z-beta.N` | Maintainer and contributors through [BRAT](beta-testing.md) |
| `main` | Stable releases | `x.y.z` | Everyone through the Obsidian community directory |

Work lands on `beta` first. Create a branch from `beta`, make your change and
open a pull request against `beta`. Only promotion pull requests target `main`.

CI enforces the channel: a pull request or push to `main` fails if the manifest
version has a beta suffix, and one to `beta` fails if it does not. Obsidian's
community directory reads `manifest.json` from `main` and installs the release
tagged with that version, and GitHub never marks a pre-release as *latest*, so
beta builds are unreachable from production installs.

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
merged into the current base branch, so it may include base changes that are not
in the branch. Install these files in an isolated test vault's
`.obsidian/plugins/atlas-vtt/` directory and reload the plugin. Include practical
Obsidian test steps for interaction changes. These artifacts do not publish a
release or bump the version.

## Beta builds

Every push to `beta` runs **Publish Beta Build**. When the manifest carries a
beta version that has not been published yet, the workflow runs the full check
suite, attests build provenance and publishes a GitHub **pre-release** tagged
with that version, with `changelog/Unreleased.md` as its notes. Pushes that do
not bump the version are verified but publish nothing, and a version that was
already published from another commit fails the run.

To cut a new beta after merging into `beta`:

```sh
git checkout beta && git pull
npm version prerelease --preid beta   # 0.2.0-beta.1 -> 0.2.0-beta.2
git push --follow-tags
```

To start the beta cycle for a new target version use
`npm version preminor --preid beta` (or `prepatch` / `premajor`). Testers
install and update through BRAT as described in [beta-testing.md](beta-testing.md).

## Promoting a beta to a stable release

1. Branch from `beta`: `git checkout -b release/0.2.0 beta`.
2. Move the pending notes from `changelog/Unreleased.md` into
   `changelog/0.2.0.md`, run `npm run changelog:generate` and commit.
3. `npm version 0.2.0` (this also updates `versions.json`) and push the branch.
4. Open a pull request against `main`. CI verifies the stable version.
5. After merging, run **Prepare Plugin Release** on `main`, review the draft and
   publish it. See [releasing-obsidian-plugin.md](releasing-obsidian-plugin.md).
6. Merge `main` back into `beta` and start the next beta cycle with
   `npm version preminor --preid beta`.

## Review and merge

Pull requests require a green `build-plugin` check and an up-to-date branch;
`main` additionally requires the `atlas/pr-review` check. Automated review is
provided by a private maintainer-managed service. Drafts are not automatically
reviewed; external contributions require manual maintainer review. If the review
status reports an error, contact the maintainer rather than bypassing or
weakening CI.

The maintainer decides which fixes to implement, when to merge, and when to
publish a release. Stable releases continue through the Prepare Plugin Release
workflow, which refuses beta versions and commits that are not on `main`.
