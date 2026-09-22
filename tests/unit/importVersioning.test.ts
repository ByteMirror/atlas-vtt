import { describe, it, expect } from 'vitest';
import { decideImportOutcome } from '../../src/app/services/collectionBundle/collectionImport';

describe('decideImportOutcome', () => {
  it('creates when the vault has no copy', () => {
    expect(decideImportOutcome(1, null)).toBe('created');
  });

  it('updates when the bundle is newer', () => {
    expect(decideImportOutcome(3, { version: 2 })).toBe('updated');
  });

  it('reports already-current for the same version', () => {
    expect(decideImportOutcome(2, { version: 2 })).toBe('already-current');
  });

  it('reports newer-exists for an older bundle', () => {
    expect(decideImportOutcome(1, { version: 2 })).toBe('newer-exists');
  });
});
