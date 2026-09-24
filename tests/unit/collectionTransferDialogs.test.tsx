import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExportCollectionDialog } from '../../src/app/packages/components/asset-manager/collection-transfer/ExportCollectionDialog';
import { ImportReviewDialog } from '../../src/app/packages/components/asset-manager/collection-transfer/ImportReviewDialog';
import type { App } from 'obsidian';
import type { ContentMedia } from '../../src/app/packages/components/asset-manager/collection-transfer/contentMedia';
import type { Asset } from '../../src/app/services/AssetService';
import type { ExportPreview } from '../../src/app/services/collectionBundle/collectionExport';
import type { ImportReview } from '../../src/app/services/collectionBundle/importReview';

afterEach(cleanup);

const VIEWPORT = { width: 800, height: 600 };
const rect = (): DOMRect => ({
  ...VIEWPORT, top: 0, left: 0, right: VIEWPORT.width, bottom: VIEWPORT.height, x: 0, y: 0, toJSON: () => ({}),
}) as DOMRect;

// jsdom has no layout: give every element the viewport's box, so the virtual
// lists inside the dialog's scrolling pane have room to show their first rows.
const layoutStubs: Array<[object, string, PropertyDescriptor]> = [
  [Element.prototype, 'getBoundingClientRect', { configurable: true, value: rect }],
  [Element.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT.width }],
  [HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => VIEWPORT.width }],
  [HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => VIEWPORT.height }],
];
const originals = layoutStubs.map(([target, name]) => [target, name, Object.getOwnPropertyDescriptor(target, name)] as const);
beforeAll(() => {
  for (const [target, name, descriptor] of layoutStubs) Object.defineProperty(target, name, descriptor);
});
afterAll(() => {
  for (const [target, name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else Reflect.deleteProperty(target, name);
  }
});

const media: ContentMedia = {
  // Just what the statblock preview reaches for; without Fantasy Statblocks it shows its install hint.
  app: { vault: { getAbstractFileByPath: () => null }, workspace: { on: () => ({}), offref: () => undefined } } as unknown as App,
  imageUrl: (path) => `app://${path}`,
  noteText: vi.fn(async () => undefined),
  dispose: vi.fn(),
};

const counts = { added: 0, updated: 0, removed: 0, kept: 0, restored: 0, conflict: 0, unchanged: 0 };

function review(overrides: Partial<ImportReview> = {}): ImportReview {
  return {
    collectionName: 'Dragon Pack', localName: 'Dragon Pack', author: 'Dungeon Tube', version: 3, installedVersion: 2,
    relation: 'newer', kind: 'release', exportedAt: Date.now(), hasInstallRecord: true, skippedAssets: [],
    counts: { ...counts, added: 2, updated: 1, kept: 1 }, conflicts: [], upToDate: false, canRestore: false,
    contents: [], fileCount: 30, ...overrides,
  };
}

describe('import review', () => {
  it('summarises an update with its release notes and lets the user resolve conflicts one by one or all at once', () => {
    const onConfirm = vi.fn();
    render(
      <ImportReviewDialog media={media}
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
    expect(screen.getByRole('dialog', { name: 'Update “Dragon Pack”' })).toBeTruthy();
    expect(screen.getByText('Update', { selector: '.atlas-transfer-eyebrow' })).toBeTruthy();
    expect(screen.getByText('v2 → v3')).toBeTruthy();
    expect(screen.getByText('by Dungeon Tube')).toBeTruthy();
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
    render(<ImportReviewDialog media={media} review={review({ relation: 'new', localName: undefined, installedVersion: undefined, suggestedName: 'Dragon Pack (2)' })} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const name = screen.getByDisplayValue('Dragon Pack (2)');
    fireEvent.change(name, { target: { value: 'Dragons of the East' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dragons of the East' }));
  });

  it('says a copy is up to date and offers restoring the original only when the user changed something', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ImportReviewDialog media={media} review={review({ relation: 'same', installedVersion: 3, upToDate: true, counts })} onConfirm={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole('dialog', { name: '“Dragon Pack” is up to date' })).toBeTruthy();
    expect(screen.getByText('Up to date')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(onCancel).toHaveBeenCalled();

    const onConfirm = vi.fn();
    rerender(<ImportReviewDialog media={media} review={review({ relation: 'same', installedVersion: 3, upToDate: true, canRestore: true, counts })} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore original' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ restore: true }));
  });

  it('warns before installing an older version, a shared copy, or a copy without an install record', () => {
    render(<ImportReviewDialog media={media} review={review({ relation: 'older', installedVersion: 4, kind: 'share', hasInstallRecord: false })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/You have v4\. This file holds the older v3/)).toBeTruthy();
    expect(screen.getByText(/copy someone shared/)).toBeTruthy();
    expect(screen.getByText(/cannot tell your changes from the author/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install older version' })).toBeTruthy();
  });

  it('shows a new collection with its cover, notes and contents before importing it', () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:cover'), revokeObjectURL: vi.fn() }));
    const onConfirm = vi.fn();
    const { container } = render(
      <ImportReviewDialog media={media}
        review={review({
          relation: 'new', localName: undefined, installedVersion: undefined, releaseNotes: 'First release', cover: new Blob(['COVER']),
          contents: [
            { category: 'scenes', label: 'Scenes', items: [{ key: 'asset:cave', name: 'Cave' }] },
            { category: 'notes', label: 'Notes', items: [] },
          ],
        })}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Import “Dragon Pack”' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dragon Pack' })).toBeTruthy();
    expect(screen.getByText('Import collection')).toBeTruthy();
    expect(container.querySelector('.atlas-transfer-hero__art img')?.getAttribute('src')).toBe('blob:cover');
    expect(screen.getByRole('heading', { name: 'Release notes' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    const scenes = screen.getByRole('button', { name: /Scenes/ });
    expect(scenes.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(scenes);
    expect(scenes.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Cave')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Notes/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('names nothing through aria-label or title, which would show Obsidian\'s or the browser\'s tooltip', () => {
    const { container } = render(<ImportReviewDialog media={media} review={review({ canRestore: true, conflicts: [{ key: 'asset:cave', kind: 'Scene', name: 'Cave', reason: 'both-changed' }] })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(container.querySelectorAll('[aria-label], [title]')).toHaveLength(0);
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(<ImportReviewDialog media={media} review={review()} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('export options', () => {
  const scene = { id: 'cave', type: 'scene', name: 'Cave', tags: [], collection: 'dragons', createdAt: 0, modifiedAt: 0 } as Asset;
  const token = { id: 'goblin', type: 'token', name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.webp', tags: [], collection: 'dragons', createdAt: 0, modifiedAt: 0 } as Asset;

  function preview(overrides: Partial<ExportPreview> = {}): ExportPreview {
    return {
      collection: { id: 'dragons', uid: 'uid-1', name: 'Dragon Pack', version: 2, releasedAt: 1, author: 'Dungeon Tube', tags: {}, settings: { conditions: [] }, createdAt: 0, modifiedAt: 0 },
      assets: [scene, token],
      files: [
        { vaultPath: 'atlas-vtt/assets/goblin.webp', role: 'token-image', owners: ['goblin'] },
        { vaultPath: 'Bestiary/Goblin.md', role: 'statblock-note', owners: ['goblin'] },
        { vaultPath: 'Lore/Cave.md', role: 'linked-note', owners: ['cave'] },
      ],
      missing: [], fileSizes: new Map([['atlas-vtt/assets/goblin.webp', 2048]]), coverCandidates: [],
      publisher: 'self', minimumVersion: 2, suggestedVersion: 3, ...overrides,
    };
  }

  it('releases the publisher\'s next version with author and notes, and refuses a lower version', async () => {
    const onExport = vi.fn(async () => null);
    render(<ExportCollectionDialog media={media} preview={preview({ missing: [{ path: 'atlas-vtt/assets/orc.webp', role: 'token-image', assetName: 'Orc' }] })} onExport={onExport} onCancel={vi.fn()} />);
    expect(screen.getByText('orc.webp (Orc)')).toBeTruthy();
    expect(screen.getByText('4 items · 3 files · 2 KB')).toBeTruthy();
    const version = screen.getByDisplayValue('3');
    fireEvent.change(version, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export v1' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onExport).not.toHaveBeenCalled();

    fireEvent.change(version, { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('What is new in this version'), { target: { value: 'Lair map' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export v3' }));
    await vi.waitFor(() => expect(onExport).toHaveBeenCalledWith({
      kind: 'release', version: 3, author: 'Dungeon Tube', notes: 'Lair map', excluded: new Set(), cover: { kind: 'none' },
    }));
  });

  it('publishes a collection installed from someone else as the user\'s own, without offering to share it', async () => {
    const onExport = vi.fn(async () => null);
    render(<ExportCollectionDialog media={media} preview={preview({ publisher: 'other' })} onExport={onExport} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Publish Dragon Pack as your own' })).toBeTruthy();
    expect(screen.getByText('Publish as your own')).toBeTruthy();
    expect(screen.queryByText(/share/i)).toBeNull();
    expect(screen.queryByDisplayValue('3')).toBeNull();
    expect(screen.getByText(/You installed this collection from Dungeon Tube/)).toBeTruthy();
    expect((screen.getByPlaceholderText('Shown to people who install it') as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByDisplayValue('Dragon Pack (my edition)'), { target: { value: 'Fan Dragons' } });
    fireEvent.change(screen.getByPlaceholderText('Shown to people who install it'), { target: { value: 'Fan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await vi.waitFor(() => expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fork', name: 'Fan Dragons', author: 'Fan' })));
  });

  it('leaves out what the user unticks, along with the notes only that content uses', async () => {
    const onExport = vi.fn(async () => null);
    render(<ExportCollectionDialog media={media} preview={preview()} onExport={onExport} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Scenes/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cave' }));
    expect(screen.getByRole('button', { name: /Notes/ }).textContent).toContain('0 of 1');
    fireEvent.click(screen.getByRole('button', { name: /Notes/ }));
    expect(screen.getByText('Only used by content you left out')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /^Cave.*left out/ }) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include all statblocks' }));
    expect(screen.getByText('1 item · 1 file · 2 KB')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export v3' }));
    await vi.waitFor(() => expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ excluded: new Set(['asset:cave', 'file:Bestiary/Goblin.md']) })));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include all tokens' }));
    expect((screen.getByRole('button', { name: 'Export v3' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('names nothing through aria-label or title, and shows no banner without a cover', () => {
    const { container } = render(<ExportCollectionDialog media={media} preview={preview({ publisher: 'other' })} onExport={vi.fn(async () => null)} onCancel={vi.fn()} />);
    expect(container.querySelectorAll('[aria-label], [title]')).toHaveLength(0);
    expect(container.querySelector('.atlas-transfer-hero__art')).toBeNull();
  });

  it('starts from the first map as cover and exports the one the user picks', async () => {
    const onExport = vi.fn(async () => null);
    const { container } = render(
      <ExportCollectionDialog media={media}
        preview={preview({ coverCandidates: [
          { key: 'lair', name: 'Lair', sourcePath: 'maps/lair.webp', imageUrl: 'app://lair', previewUrl: 'app://lair-small' },
          { key: 'cave', name: 'Cave', sourcePath: 'maps/cave.webp', imageUrl: 'app://cave', previewUrl: 'app://cave-small' },
        ] })}
        onExport={onExport}
        onCancel={vi.fn()}
      />,
    );
    const hero = (): string | null | undefined => container.querySelector('.atlas-transfer-hero__art img')?.getAttribute('src');
    expect(hero()).toBe('app://lair');
    expect(screen.getByRole('radio', { name: 'Lair' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Cave' }));
    expect(hero()).toBe('app://cave');
    fireEvent.click(screen.getByRole('button', { name: 'Export v3' }));
    await vi.waitFor(() => expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ cover: { kind: 'artwork', path: 'maps/cave.webp' } })));

    fireEvent.click(screen.getByRole('radio', { name: 'No cover' }));
    expect(hero()).toBeUndefined();
  });

  it('shows tokens as cards the way they spawn, and opens a token\'s statblock after resting on it', async () => {
    vi.useFakeTimers();
    const goblin = { ...token, thumbnailPath: 'atlas-vtt/assets/thumbnails/goblin.webp', showRing: false, statblockPath: 'Bestiary/Goblin.md' } as Asset;
    const orc = { ...token, id: 'orc', name: 'Orc', imagePath: 'atlas-vtt/assets/orc.webp' } as Asset;
    const noteText = vi.fn(async () => '---\nstatblock: true\nname: Goblin\n---');
    const { container } = render(<ExportCollectionDialog media={{ ...media, noteText }} preview={preview({ assets: [scene, goblin, orc] })} onExport={vi.fn(async () => null)} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tokens/ }));

    const cards = [...container.querySelectorAll('.atlas-transfer-token')];
    expect(cards.map((card) => card.textContent)).toEqual(['Goblin', 'Orc']);
    expect(cards[0]!.querySelector('img')?.getAttribute('src')).toBe('app://atlas-vtt/assets/thumbnails/goblin.webp');
    expect(cards[0]!.querySelector('.atlas-token-portrait--unframed')).toBeTruthy();
    expect(cards[1]!.querySelector('.atlas-token-ring')).toBeTruthy();
    expect(cards[0]!.querySelector('.atlas-transfer-token__statblock')).toBeTruthy();
    expect(cards[1]!.querySelector('.atlas-transfer-token__statblock')).toBeNull();

    fireEvent.pointerEnter(cards[0]!);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(document.querySelector('.statblock-hover-preview--over-modal')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(noteText).toHaveBeenCalledWith('Bestiary/Goblin.md');
    expect(document.querySelector('.statblock-hover-preview--over-modal')).toBeTruthy();

    fireEvent.click(within(cards[1] as HTMLElement).getByRole('checkbox'));
    expect(cards[1]!.getAttribute('data-state')).toBe('excluded');
    vi.useRealTimers();
  });

  it('mounts only the token cards the pane shows, however many the collection holds', () => {
    const many = Array.from({ length: 1000 }, (_, index) => ({ ...token, id: `t${index}`, name: `Token ${index}` }) as Asset);
    const { container } = render(<ExportCollectionDialog media={media} preview={preview({ assets: many, files: [] })} onExport={vi.fn(async () => null)} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tokens/ }));
    const mounted = container.querySelectorAll('.atlas-transfer-token').length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(100);
  });
});
