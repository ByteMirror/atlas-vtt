import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  parseWorktreeListPorcelain,
  getMainWorktreeRoot,
  getPluginTargetDirs,
} = require('../../scripts/worktree-targets.js');

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

    const fakeExists = (candidate: string) => candidate === path.join('/repo/main', 'test-vault/.obsidian');

    const targets = getPluginTargetDirs(root, fakeExec, fakeExists);
    expect(targets).toEqual([
      {
        label: 'test-vault',
        dirPath: path.join('/repo/main', 'test-vault/.obsidian/plugins/atlas-vtt'),
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
    const fakeExists = (candidate: string) =>
      candidate === '/Users/tester/Github/.obsidian' ||
      candidate === '/Users/tester/Github/atlas-vtt/test-vault/.obsidian';

    const targets = getPluginTargetDirs(root, fakeExec, fakeExists);
    expect(targets).toEqual([
      {
        label: 'workspace-vault',
        dirPath: path.join('/Users/tester/Github', '.obsidian/plugins/atlas-vtt'),
      },
      {
        label: 'test-vault',
        dirPath: path.join('/Users/tester/Github/atlas-vtt', 'test-vault/.obsidian/plugins/atlas-vtt'),
      },
    ]);
  });
});
