#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { generateChangelog, readPendingNotes, formatRelease, formatPrerelease, validateBuild } = require('./changelog');
const { parseVersion } = require('./release-channel');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');
const validateOnly = process.argv.includes('--validate-only');

const requiredAssets = [
  { src: path.join(distDir, 'main.js'), dest: path.join(releaseDir, 'main.js') },
  { src: path.join(rootDir, 'manifest.json'), dest: path.join(releaseDir, 'manifest.json') },
  { src: path.join(distDir, 'styles.css'), dest: path.join(releaseDir, 'styles.css') },
];

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required asset missing: ${filePath}`);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function releaseNotes({ version, releases }) {
  return parseVersion(version).channel === 'beta'
    ? formatPrerelease(version, readPendingNotes(rootDir))
    : formatRelease(releases[0]);
}

try {
  validateBuild(rootDir);
  requiredAssets.forEach((asset) => assertExists(asset.src));

  if (validateOnly) {
    console.log('✅ Release assets validated');
    process.exit(0);
  }

  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  requiredAssets.forEach((asset) => copyFile(asset.src, asset.dest));
  fs.writeFileSync(path.join(releaseDir, 'release-notes.md'), releaseNotes(generateChangelog(rootDir, { check: true })));

  console.log('✅ Release assets prepared in ./release');
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
