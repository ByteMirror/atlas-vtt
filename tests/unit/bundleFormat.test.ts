import { describe, expect, it } from 'vitest';
import { BUNDLE_FORMAT, isSafeBundlePath, manifestProblem } from '../../src/app/services/collectionBundle/bundleFormat';

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: BUNDLE_FORMAT,
    exportedAt: 1,
    collection: { id: 'source', uid: '726e53fb-59c3-49d4-9019-947bb901c037', name: 'Source', version: 2 },
    assets: [{ id: 'token-1', type: 'token' }],
    files: [{ vaultPath: 'atlas-vtt/assets/goblin.webp', role: 'token-image', sha256: 'a'.repeat(64), owners: ['token-1'] }],
    ...overrides,
  };
}

describe('bundle paths', () => {
  it.each([
    ['atlas-vtt/assets/goblin.webp', 'token-image', true],
    ['Bestiary/Goblin.md', 'statblock-note', true],
    ['Bestiary/Goblin.md', 'token-image', false],
    ['atlas-vtt/../.obsidian/plugins/x/main.js', 'asset-file', false],
    ['atlas-vtt/./assets/goblin.webp', 'asset-file', false],
    ['.obsidian/plugins/x/main.js', 'statblock-note', false],
    ['atlas-vtt/.atlas-data/installs/x.json', 'asset-file', false],
    ['/etc/passwd', 'statblock-note', false],
    ['atlas-vtt\\assets\\goblin.webp', 'token-image', false],
    ['atlas-vtt//assets/goblin.webp', 'token-image', false],
    ['atlas-vtt/assets/go\nblin.webp', 'token-image', false],
  ] as const)('%s as %s is safe: %s', (path, role, safe) => {
    expect(isSafeBundlePath(path, role)).toBe(safe);
  });
});

describe('manifest checks', () => {
  it('accepts sound format 3 and format 2 manifests', () => {
    expect(manifestProblem(manifest())).toBeNull();
    expect(manifestProblem(manifest({ format: 2, files: [{ vaultPath: 'atlas-vtt/a.json', role: 'asset-file' }] }))).toBeNull();
  });

  it('asks for an Atlas update for newer formats and rejects older ones', () => {
    expect(manifestProblem(manifest({ format: BUNDLE_FORMAT + 1 }))).toMatch(/newer version of Atlas/);
    expect(manifestProblem(manifest({ format: 1 }))).toMatch(/too old/);
    expect(manifestProblem({ hello: 'world' })).toMatch(/not an Atlas collection/);
  });

  it.each([
    ['a missing export date', { exportedAt: undefined }],
    ['a uid that could name another file', { collection: { id: 'source', uid: '../../x', name: 'Source', version: 1 } }],
    ['a fractional version', { collection: { id: 'source', uid: '726e53fb-59c3-49d4-9019-947bb901c037', name: 'Source', version: 1.5 } }],
    ['an empty name', { collection: { id: 'source', uid: '726e53fb-59c3-49d4-9019-947bb901c037', name: ' ', version: 1 } }],
    ['an asset id with a folder', { assets: [{ id: '../evil', type: 'map' }] }],
    ['an unknown file role', { files: [{ vaultPath: 'atlas-vtt/a', role: 'script' }] }],
    ['a malformed checksum', { files: [{ vaultPath: 'atlas-vtt/a', role: 'asset-file', sha256: 'abc' }] }],
    ['an unknown release kind', { release: { kind: 'patch' } }],
  ])('rejects %s', (_name, overrides) => {
    expect(manifestProblem(manifest(overrides))).toMatch(/damaged/);
  });

  it('names the file it refuses to write', () => {
    expect(manifestProblem(manifest({ files: [{ vaultPath: 'atlas-vtt/../.obsidian/app.json', role: 'asset-file' }] })))
      .toBe('This collection export contains a file Atlas will not write: atlas-vtt/../.obsidian/app.json');
  });
});
