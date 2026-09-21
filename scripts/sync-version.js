#!/usr/bin/env node

/**
 * Runs from the npm `version` lifecycle. Mirrors package.json's new version
 * into manifest.json and, for stable releases only, records the minimum app
 * version in versions.json. Beta builds never enter versions.json because
 * Obsidian reads it for community installs. The bundled changelog embeds the
 * version, so it is regenerated as well.
 */
const fs = require('fs');
const path = require('path');
const { parseVersion } = require('./release-channel');
const { generateChangelog } = require('./changelog');

const root = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, data) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`);

const { version, channel } = parseVersion(process.env.npm_package_version);

const manifest = read('manifest.json');
manifest.version = version;
write('manifest.json', manifest);

if (channel === 'stable') {
  const versions = read('versions.json');
  versions[version] = manifest.minAppVersion;
  write('versions.json', versions);
}

generateChangelog(root);

console.log(`✅ manifest.json set to ${version}${channel === 'stable' ? ' and versions.json updated' : ' (beta, versions.json untouched)'}; changelog regenerated`);
