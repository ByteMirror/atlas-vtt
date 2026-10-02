import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  parseWorktreeListPorcelain,
  getMainWorktreeRoot,
  getPluginTargetDirs,
  findInstalledVaultRoots,
  obsidianConfigPath,
  markForHotReload,
} = require('../../scripts/worktree-targets.js');

/**
 * The script resolves every path it hands out, so a POSIX-looking fixture path
 * gains the current drive on Windows. Comparing resolved paths keeps these
 * tests meaningful on both platforms.
 */
const at = (...segments: string[]): string => path.resolve(path.join(...segments));
const matches = (...candidates: string[]) => (candidate: string) =>
  candidates.some((expected) => path.resolve(candidate) === path.resolve(expected));

describe('worktree target resolution', () => {
  it('parses git worktree porcelain output', () => {
    const output = [
      'worktree /repo/main',
      'HEAD abcdef',
      'branch refs/heads/main',
      '',
      'worktree /repo/feature',
      'HEAD 123456',
      'branch refs/heads/feature/atlas-015',
      '',
    ].join('\n');

    const entries = parseWorktreeListPorcelain(output);
    expect(entries).toEqual([
      { path: '/repo/main', branch: 'refs/heads/main' },
      { path: '/repo/feature', branch: 'refs/heads/feature/atlas-015' },
    ]);
  });

  it('uses the main worktree when available', () => {
    const root = '/repo/feature';
    const fakeExec = () =>
      [
        'worktree /repo/main',
        'HEAD abcdef',
        'branch refs/heads/main',
        '',
        'worktree /repo/feature',
        'HEAD 123456',
        'branch refs/heads/feature/atlas-015',
        '',
      ].join('\n');

    expect(getMainWorktreeRoot(root, fakeExec)).toBe('/repo/main');
  });

  it('falls back to current root when main worktree is unavailable', () => {
    const root = '/repo/feature';
    const fakeExec = () =>
      [
        'worktree /repo/feature',
        'HEAD 123456',
        'branch refs/heads/feature/atlas-015',
        '',
      ].join('\n');

    expect(getMainWorktreeRoot(root, fakeExec)).toBe(root);
  });

  it('builds plugin targets under the main worktree root', () => {
    const root = '/repo/feature';
    const fakeExec = () =>
      [
        'worktree /repo/main',
        'HEAD abcdef',
        'branch refs/heads/main',
        '',
      ].join('\n');

    const fakeExists = matches(path.join('/repo/main', 'test-vault/.obsidian'));

    const targets = getPluginTargetDirs(root, fakeExec, fakeExists, []);
    expect(targets).toEqual([
      {
        label: 'test-vault',
        dirPath: at('/repo/main', 'test-vault/.obsidian/plugins/atlas-vtt'),
      },
    ]);
  });

  it('includes the nearest ancestor vault before repo-local test vaults', () => {
    const root = '/Users/tester/Github/atlas-vtt';
    const fakeExec = () =>
      [
        'worktree /Users/tester/Github/atlas-vtt',
        'HEAD abcdef',
        'branch refs/heads/main',
        '',
      ].join('\n');
    const fakeExists = matches(
      '/Users/tester/Github/.obsidian',
      '/Users/tester/Github/atlas-vtt/test-vault/.obsidian',
    );

    const targets = getPluginTargetDirs(root, fakeExec, fakeExists, []);
    expect(targets).toEqual([
      {
        label: 'workspace-vault',
        dirPath: at('/Users/tester/Github', '.obsidian/plugins/atlas-vtt'),
      },
      {
        label: 'test-vault',
        dirPath: at('/Users/tester/Github/atlas-vtt', 'test-vault/.obsidian/plugins/atlas-vtt'),
      },
    ]);
  });

  it('includes vaults that already run Atlas, for a repo checked out beside them', () => {
    const root = '/Users/tester/code/atlas-vtt';
    const fakeExec = () => ['worktree /Users/tester/code/atlas-vtt', 'branch refs/heads/main', ''].join('\n');
    const fakeExists = matches('/Users/tester/vaults/Campaign/.obsidian');

    const targets = getPluginTargetDirs(root, fakeExec, fakeExists, ['/Users/tester/vaults/Campaign']);
    expect(targets).toEqual([
      {
        label: 'Campaign',
        dirPath: at('/Users/tester/vaults/Campaign', '.obsidian/plugins/atlas-vtt'),
      },
    ]);
  });
});

describe('vaults that already run Atlas', () => {
  const config = '/home/tester/.config/obsidian/obsidian.json';
  const vaults = JSON.stringify({
    vaults: {
      a: { path: '/vaults/WithAtlas' },
      b: { path: '/vaults/WithoutAtlas' },
    },
  });

  it('lists only the vaults holding an Atlas install', () => {
    const exists = matches(config, '/vaults/WithAtlas/.obsidian/plugins/atlas-vtt');
    expect(findInstalledVaultRoots(config, exists, () => vaults)).toEqual(['/vaults/WithAtlas']);
  });

  it('is empty when Obsidian has never run on this machine', () => {
    expect(findInstalledVaultRoots(config, () => false, () => vaults)).toEqual([]);
  });

  it('survives a config file it cannot parse', () => {
    expect(findInstalledVaultRoots(config, () => true, () => '{ not json')).toEqual([]);
  });

  it('points at the config file Obsidian writes on each platform', () => {
    expect(obsidianConfigPath('win32', { APPDATA: 'C:\\Users\\t\\AppData\\Roaming' }, 'C:\\Users\\t')).toBe(
      path.join('C:\\Users\\t\\AppData\\Roaming', 'obsidian', 'obsidian.json'),
    );
    expect(obsidianConfigPath('darwin', {}, '/Users/t')).toBe(
      path.join('/Users/t', 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
    );
    expect(obsidianConfigPath('linux', {}, '/home/t')).toBe(
      path.join('/home/t', '.config', 'obsidian', 'obsidian.json'),
    );
  });
});

describe('hot reload marker', () => {
  it('marks a plugin folder for Hot Reload once and keeps an existing marker', () => {
    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-hot-reload-'));
    try {
      const marker = path.join(pluginDir, '.hotreload');
      markForHotReload(pluginDir);
      expect(fs.readFileSync(marker, 'utf8')).toBe('');

      fs.writeFileSync(marker, 'kept');
      markForHotReload(pluginDir);
      expect(fs.readFileSync(marker, 'utf8')).toBe('kept');
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });
});
