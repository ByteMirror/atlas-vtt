import { describe, it, expect } from 'vitest';
import { decideImportOutcome } from '../../src/app/services/collectionBundle/collectionImport';

describe('decideImportOutcome', () => {
  it('creates when the vault has no copy', () => {
    expect(decideImportOutcome(1_000, null)).toBe('created');
  });

  it('updates when the bundle is a later export', () => {
    expect(decideImportOutcome(3_000, { exportedAt: 2_000 })).toBe('updated');
  });

  it('updates a copy from before exports were dated', () => {
    expect(decideImportOutcome(1_000, {})).toBe('updated');
  });

  it('reports already-current for the same export', () => {
    expect(decideImportOutcome(2_000, { exportedAt: 2_000 })).toBe('already-current');
  });

  it('reports newer-exists for an earlier export', () => {
    expect(decideImportOutcome(1_000, { exportedAt: 2_000 })).toBe('newer-exists');
  });
});
