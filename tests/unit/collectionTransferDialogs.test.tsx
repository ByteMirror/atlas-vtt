import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportCollectionDialog } from '../../src/app/packages/components/asset-manager/collection-transfer/ExportCollectionDialog';
import { ImportReviewDialog } from '../../src/app/packages/components/asset-manager/collection-transfer/ImportReviewDialog';
import type { ExportPreview } from '../../src/app/services/collectionBundle/collectionExport';
import type { ImportReview } from '../../src/app/services/collectionBundle/importReview';

afterEach(cleanup);

const counts = { added: 0, updated: 0, removed: 0, kept: 0, restored: 0, conflict: 0, unchanged: 0 };

function review(overrides: Partial<ImportReview> = {}): ImportReview {
  return {
    collectionName: 'Dragon Pack', localName: 'Dragon Pack', author: 'Dungeon Tube', version: 3, installedVersion: 2,
    relation: 'newer', kind: 'release', exportedAt: Date.now(), hasInstallRecord: true,
    counts: { ...counts, added: 2, updated: 1, kept: 1 }, conflicts: [], upToDate: false, canRestore: false,
    assetCount: 12, fileCount: 30, ...overrides,
  };
}

describe('import review', () => {
  it('summarises an update with its release notes and lets the user resolve conflicts one by one or all at once', () => {
    const onConfirm = vi.fn();
    render(
      <ImportReviewDialog
        review={review({
          releaseNotes: 'New lair map',
          counts: { ...counts, added: 2, updated: 1, kept: 1, conflict: 2 },
          conflicts: [
            { key: 'asset:cave', kind: 'Scene', name: 'Cave', reason: 'both-changed' },
            { key: 'asset:goblin', kind: 'Token', name: 'Goblin', reason: 'removed-by-update' },
          ],
        })}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Update “Dragon Pack”' })).toBeTruthy();
    expect(screen.getByText(/^v2 → v3 by Dungeon Tube · exported/)).toBeTruthy();
    expect(screen.getByText('New lair map')).toBeTruthy();
    expect(screen.getByText('2 new · 1 updated · 1 of your changes kept')).toBeTruthy();
    expect(screen.getByText('The update removes it, but you changed it.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use update for all' }));
    fireEvent.click(screen.getAllByRole('radio', { name: 'Keep mine' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(onConfirm).toHaveBeenCalledWith({
      name: undefined, restore: false,
      resolutions: new Map([['asset:cave', 'theirs'], ['asset:goblin', 'mine']]),
    });
  });

  it('asks for another name when the vault already has a different collection with this one', () => {
    const onConfirm = vi.fn();
    render(<ImportReviewDialog review={review({ relation: 'new', localName: undefined, installedVersion: undefined, suggestedName: 'Dragon Pack (2)' })} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const name = screen.getByDisplayValue('Dragon Pack (2)');
    fireEvent.change(name, { target: { value: 'Dragons of the East' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dragons of the East' }));
  });

  it('says a copy is up to date and offers restoring the original only when the user changed something', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ImportReviewDialog review={review({ relation: 'same', installedVersion: 3, upToDate: true, counts })} onConfirm={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole('heading', { name: '“Dragon Pack” is up to date' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(onCancel).toHaveBeenCalled();

    const onConfirm = vi.fn();
    rerender(<ImportReviewDialog review={review({ relation: 'same', installedVersion: 3, upToDate: true, canRestore: true, counts })} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore original' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ restore: true }));
  });

  it('warns before installing an older version, a shared copy, or a copy without an install record', () => {
    render(<ImportReviewDialog review={review({ relation: 'older', installedVersion: 4, kind: 'share', hasInstallRecord: false })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/You have v4\. This file holds the older v3/)).toBeTruthy();
    expect(screen.getByText(/copy someone shared/)).toBeTruthy();
    expect(screen.getByText(/cannot tell your changes from the author/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install older version' })).toBeTruthy();
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(<ImportReviewDialog review={review()} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('export options', () => {
  function preview(overrides: Partial<ExportPreview> = {}): ExportPreview {
    return {
      collection: { id: 'dragons', uid: 'uid-1', name: 'Dragon Pack', version: 2, releasedAt: 1, author: 'Dungeon Tube', tags: {}, settings: { conditions: [] }, createdAt: 0, modifiedAt: 0 },
      assets: [], files: [], missing: [], totalBytes: 2048, isPublisher: true, minimumVersion: 2, suggestedVersion: 3, ...overrides,
    };
  }

  it('releases the publisher\'s next version with author and notes, and refuses a lower version', async () => {
    const onExport = vi.fn(async () => null);
    render(<ExportCollectionDialog preview={preview({ missing: [{ path: 'atlas-vtt/assets/orc.webp', role: 'token-image', assetName: 'Orc' }] })} onExport={onExport} onCancel={vi.fn()} />);
    expect(screen.getByText('orc.webp (Orc)')).toBeTruthy();
    const version = screen.getByDisplayValue('3');
    fireEvent.change(version, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export v1' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onExport).not.toHaveBeenCalled();

    fireEvent.change(version, { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('What is new in this version'), { target: { value: 'Lair map' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export v3' }));
    await vi.waitFor(() => expect(onExport).toHaveBeenCalledWith({ kind: 'release', version: 3, author: 'Dungeon Tube', notes: 'Lair map' }));
  });

  it('lets someone who installed the collection share their copy or publish it as their own', async () => {
    const onExport = vi.fn(async () => null);
    render(<ExportCollectionDialog preview={preview({ isPublisher: false })} onExport={onExport} onCancel={vi.fn()} />);
    expect(screen.queryByDisplayValue('3')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Share copy' }));
    await vi.waitFor(() => expect(onExport).toHaveBeenCalledWith({ kind: 'share' }));

    fireEvent.click(screen.getByRole('radio', { name: 'Publish as my own' }));
    fireEvent.change(screen.getByDisplayValue('Dragon Pack (my edition)'), { target: { value: 'Fan Dragons' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await vi.waitFor(() => expect(onExport).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'fork', name: 'Fan Dragons' })));
  });
});
