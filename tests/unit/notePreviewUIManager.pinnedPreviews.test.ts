import { EventEmitter } from 'events';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownView, WorkspaceLeaf, type OpenViewState } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';
import type { PreviewWindowLayout } from '../../src/app/stores/pinnedNotePreviewSlice';

const VIEW_ID = 'pinned-previews-test';
const TAVERN = 'maps/tavern.atlasmap';
const CELLAR = 'maps/cellar.atlasmap';
const LAYOUT: PreviewWindowLayout = { left: 321, top: 54, width: 480, height: 300 };

interface Harness {
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  manager: NotePreviewUIManager;
  atlasLeafRoot: HTMLElement;
  /** Note views opened by previews, oldest first. */
  noteViews: MarkdownView[];
}

/** A detached leaf that opens the note in a markdown view, the way Obsidian's does. */
function createNoteLeaf(noteViews: MarkdownView[]): WorkspaceLeaf {
  const leaf = new WorkspaceLeaf();
  const view = new MarkdownView(leaf);
  leaf.view = view;
  noteViews.push(view);
  Object.assign(leaf, {
    detach: vi.fn(),
    openFile: vi.fn(async (_file: unknown, options: OpenViewState) => {
      view.containerEl.setText('Tavern notes');
      view.contentEl.setText('Tavern notes');
      const mode = options.state?.mode;
      if (mode === 'source' || mode === 'preview') view.setMode(mode);
      if (options.eState) view.setEphemeralState(options.eState);
    }),
  });
  return leaf;
}

/** Without `noteLeaves` the workspace has no leaf to spare and previews render plain markdown. */
function createHarness({ noteLeaves = false } = {}): Harness {
  const { app } = createInMemoryApp({ files: { 'notes/tavern.md': 'Tavern notes' } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;

  const atlasLeafRoot = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  const atlasLeaf = new WorkspaceLeaf();
  atlasLeaf.view = { viewId: VIEW_ID, containerEl: atlasLeafRoot.createDiv(), getViewType: () => 'atlas-vtt' };
  const noteViews: MarkdownView[] = [];
  Object.assign(app.workspace, {
    getLeavesOfType: vi.fn((type: string) => (type === 'atlas-vtt' ? [atlasLeaf] : [])),
    getActiveViewOfType: vi.fn(() => null),
    getLeaf: vi.fn(() => (noteLeaves ? createNoteLeaf(noteViews) : null)),
    setActiveLeaf: vi.fn(),
  });

  const store = createViewAtlasStore(app, VIEW_ID);
  const eventBus = new EventEmitter();
  const manager = new NotePreviewUIManager(app, eventBus, store, VIEW_ID);
  return { store, eventBus, manager, atlasLeafRoot, noteViews };
}

/** The store side of `MapService.loadMap`: save the old map, rehydrate the new one, announce it. */
async function loadMap({ store, eventBus }: Harness, path: string): Promise<void> {
  const state = store.getState();
  if (state.mapPath) eventBus.emit('map-unloading');
  state.setPersistenceEnabled(false);
  await store.flushStorage();
  state.setMapPath(path);
  state.clearMapState();
  await store.persist.rehydrate();
  state.setPersistenceEnabled(true);
  eventBus.emit('map-loaded');
}

async function openPreview({ eventBus }: Harness): Promise<HTMLElement> {
  eventBus.emit('pin-hover-preview', {
    pin: { id: 'pin-1', kind: 'pin', notePath: 'notes/tavern.md', x: 0, y: 0 },
    screenX: 100,
    screenY: 100,
    pixiEvent: { metaKey: true, ctrlKey: false },
  });
  return findPreview();
}

async function findPreview(): Promise<HTMLElement> {
  let previewEl: HTMLElement | null = null;
  await waitFor(() => {
    previewEl = document.querySelector<HTMLElement>('.atlas-note-preview-window');
    expect(previewEl?.textContent).toContain('Tavern notes');
  });
  return previewEl!;
}

function click(previewEl: HTMLElement, button: 'pin' | 'close'): void {
  previewEl.querySelector<HTMLButtonElement>(`.atlas-note-preview-${button}-btn`)!.click();
}

/** Moves and resizes the window the way a header drag ends (jsdom has no layout). */
function dragTo(previewEl: HTMLElement, layout: PreviewWindowLayout): void {
  const offsets = { offsetLeft: layout.left, offsetTop: layout.top, offsetWidth: layout.width, offsetHeight: layout.height };
  for (const [key, value] of Object.entries(offsets)) {
    Object.defineProperty(previewEl, key, { configurable: true, value });
  }
  previewEl.querySelector('.atlas-note-preview-header')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  document.dispatchEvent(new MouseEvent('mouseup'));
}

describe('NotePreviewUIManager pinned previews', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness();
    await loadMap(harness, TAVERN);
  });

  afterEach(() => {
    harness.manager.destroy();
    document.body.empty();
  });

  it('reopens a pinned preview where it was left after switching to another scene and back', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    dragTo(previewEl, LAYOUT);

    await loadMap(harness, CELLAR);
    expect(document.querySelector('.atlas-note-preview-window')).toBeNull();

    await loadMap(harness, TAVERN);
    const reopened = await findPreview();
    expect(harness.atlasLeafRoot.contains(reopened)).toBe(true);
    expect(reopened.querySelector('.atlas-note-preview-pin-btn')?.classList.contains('is-pinned')).toBe(true);
    expect([reopened.style.left, reopened.style.top, reopened.style.width, reopened.style.height])
      .toEqual(['321px', '54px', '480px', '300px']);
  });

  it('forgets a pinned preview the user closes', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    click(previewEl, 'close');

    expect(harness.store.getState().pinnedNotePreviews).toEqual({});
    await loadMap(harness, CELLAR);
    await loadMap(harness, TAVERN);
    expect(document.querySelector('.atlas-note-preview-window')).toBeNull();
  });

  it('forgets a preview once it is unpinned', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    expect(Object.keys(harness.store.getState().pinnedNotePreviews)).toEqual(['pin-1']);

    click(previewEl, 'pin');
    expect(harness.store.getState().pinnedNotePreviews).toEqual({});
  });
});

describe('NotePreviewUIManager pinned note state', () => {
  const cursor = { from: { line: 120, ch: 4 }, to: { line: 120, ch: 9 } };
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness({ noteLeaves: true });
    await loadMap(harness, TAVERN);
  });

  afterEach(() => {
    harness.manager.destroy();
    document.body.empty();
  });

  async function openPinnedNote(): Promise<{ previewEl: HTMLElement; view: MarkdownView }> {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    return { previewEl, view: harness.noteViews.at(-1)! };
  }

  it('reopens a pinned note in the mode, at the scroll and cursor it was left at', async () => {
    const { view } = await openPinnedNote();
    view.setMode('preview');
    view.setEphemeralState({ cursor });
    view.currentMode.applyScroll(42.5);

    await loadMap(harness, CELLAR);
    await loadMap(harness, TAVERN);

    await waitFor(() => expect(harness.noteViews).toHaveLength(2));
    const reopened = harness.noteViews[1]!;
    await waitFor(() => expect(reopened.currentMode.getScroll()).toBe(42.5));
    expect(reopened.getEphemeralState()).toEqual({ cursor });
    expect(reopened.getMode()).toBe('preview');
  });

  it('saves the scroll with the map once scrolling pauses', async () => {
    const { previewEl, view } = await openPinnedNote();
    view.currentMode.applyScroll(17);
    previewEl.querySelector('.atlas-note-preview-content')!.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(harness.store.getState().pinnedNotePreviews['pin-1']?.view?.eState.scroll).toBe(17);
    });
  });
});
