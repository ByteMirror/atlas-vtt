import { describe, it, expect } from 'vitest';

type ImportDecision = 'create-new' | 'update' | 'already-current' | 'newer-exists';

/** Pure-function equivalent of the UID-based import decision in AssetService.importCollection() */
function decideImportAction(
  importUid: string,
  importVersion: number,
  existingCollections: Array<{ uid: string; version: number }>
): ImportDecision {
  const existing = existingCollections.find(c => c.uid === importUid);
  if (!existing) return 'create-new';
  if (importVersion > existing.version) return 'update';
  if (importVersion === existing.version) return 'already-current';
  return 'newer-exists';
}

describe('decideImportAction', () => {
  const existing = [
    { uid: 'abc-123', version: 2 },
    { uid: 'def-456', version: 5 },
  ];

  it('creates new when UID not found', () => {
    expect(decideImportAction('xyz-789', 1, existing)).toBe('create-new');
  });

  it('creates new with empty existing collections', () => {
    expect(decideImportAction('abc-123', 1, [])).toBe('create-new');
  });

  it('updates when import version is newer', () => {
    expect(decideImportAction('abc-123', 3, existing)).toBe('update');
  });

  it('reports already-current for same version', () => {
    expect(decideImportAction('abc-123', 2, existing)).toBe('already-current');
  });

  it('reports newer-exists for older import', () => {
    expect(decideImportAction('abc-123', 1, existing)).toBe('newer-exists');
  });

  it('handles version 1 against version 1', () => {
    const single = [{ uid: 'test', version: 1 }];
    expect(decideImportAction('test', 1, single)).toBe('already-current');
  });
});
