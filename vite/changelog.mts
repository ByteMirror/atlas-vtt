import type { Plugin } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const { generateChangelog, stampBuild } = createRequire(import.meta.url)('../scripts/changelog.js') as {
  generateChangelog: (root: string) => unknown;
  stampBuild: (root: string) => void;
};

/** Keep notes current for every build, including watch-mode edits. */
export function changelog(): Plugin {
  let root: string;
  return {
    name: 'atlas-changelog',
    configResolved(config) { root = config.root; },
    buildStart() {
      const directory = path.join(root, 'changelog');
      this.addWatchFile(directory);
      this.addWatchFile(path.join(root, 'manifest.json'));
      this.addWatchFile(path.join(root, 'package.json'));
      for (const file of fs.readdirSync(directory)) this.addWatchFile(path.join(directory, file));
      generateChangelog(root);
    },
    writeBundle() { stampBuild(root); },
  };
}
