import { EventEmitter } from 'events';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, WorkspaceLeaf } from 'obsidian';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';

type LeafChangeHandler = (leaf: WorkspaceLeaf | null) => void;

interface ManagerHarness {
  manager: NotePreviewUIManager;
  atlasLeaf: WorkspaceLeaf;
  atlasLeafRoot: HTMLElement;
  changeActiveLeaf: LeafChangeHandler;
}

/** A plugin-wide manager whose workspace renders previews as plain markdown (no leaf). */
function createHarness(): ManagerHarness {
  const atlasLeafRoot = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  const atlasLeaf = new WorkspaceLeaf();
  atlasLeaf.view = { containerEl: atlasLeafRoot.createDiv({ cls: 'view-content' }), getViewType: () => 'atlas-vtt' };

  let leafChangeHandler: LeafChangeHandler = () => {};
  const app = {
    vault: {
      read: vi.fn(async () => 'Preview body'),
      getAbstractFileByPath: vi.fn((path: string) => new TFile(path)),
    },
    metadataCache: { getFileCache: vi.fn(() => null) },
    workspace: {
      getActiveViewOfType: vi.fn(() => null),
      getLeaf: vi.fn(() => null),
      setActiveLeaf: vi.fn(),
      on: vi.fn((_name: string, handler: LeafChangeHandler) => {
        leafChangeHandler = handler;
        return {};
      }),
      offref: vi.fn(),
    },
  };

  return {
    manager: new NotePreviewUIManager(app as never),
    atlasLeaf,
    atlasLeafRoot,
    changeActiveLeaf: (leaf) => leafChangeHandler(leaf),
  };
}

function markdownLeaf(): WorkspaceLeaf {
  const leaf = new WorkspaceLeaf();
  leaf.view = { getViewType: () => 'markdown' };
  return leaf;
}

/** CMD+hovers a pin on the map behind `eventBus` and waits for its preview window. */
async function hoverPin(harness: ManagerHarness, eventBus: EventEmitter, pinId: string): Promise<HTMLElement> {
  eventBus.emit('pin-hover-preview', {
    pin: { id: pinId, notePath: `notes/${pinId}.md`, x: 0, y: 0 },
    screenX: 100,
    screenY: 100,
    pixiEvent: { metaKey: true, ctrlKey: false },
    sourceLeaf: harness.atlasLeaf,
  });

  let previewEl: HTMLElement | null = null;
  await waitFor(() => {
    previewEl = findPreview(pinId);
    expect(previewEl).not.toBeNull();
  });
  return previewEl!;
}

function findPreview(pinId: string): HTMLElement | null {
  const windows = Array.from(document.querySelectorAll<HTMLElement>('.atlas-note-preview-window'));
  return windows.find((el) => el.querySelector('.atlas-note-preview-title')?.textContent === pinId) ?? null;
}

function pin(previewEl: HTMLElement): void {
  previewEl.querySelector<HTMLButtonElement>('.atlas-note-preview-pin-btn')!.click();
}

describe('NotePreviewUIManager lifecycle', () => {
  let harness: ManagerHarness;
  let eventBus: EventEmitter;
  let disconnect: () => void;

  beforeEach(() => {
    harness = createHarness();
    eventBus = new EventEmitter();
    disconnect = harness.manager.connect(eventBus);
  });

  afterEach(() => {
    harness.manager.destroy();
    document.body.empty();
  });

  it('mounts previews on the page body, outside the map leaf', async () => {
    const previewEl = await hoverPin(harness, eventBus, 'tavern');

    expect(harness.atlasLeafRoot.contains(previewEl)).toBe(false);
    expect(previewEl.parentElement?.parentElement).toBe(document.body);
  });

  it('keeps pinned previews open when another tab becomes active', async () => {
    const pinned = await hoverPin(harness, eventBus, 'tavern');
    pin(pinned);
    const hovered = await hoverPin(harness, eventBus, 'cellar');

    harness.changeActiveLeaf(markdownLeaf());

    expect(pinned.isConnected).toBe(true);
    expect(hovered.isConnected).toBe(false);
  });

  it('keeps pinned previews, with their size and position, after the map closes and reopens', async () => {
    const pinned = await hoverPin(harness, eventBus, 'tavern');
    pin(pinned);
    pinned.style.left = '321px';
    pinned.style.width = '480px';
    const hovered = await hoverPin(harness, eventBus, 'cellar');

    disconnect();

    expect(pinned.isConnected).toBe(true);
    expect(hovered.isConnected).toBe(false);

    const reopenedBus = new EventEmitter();
    harness.manager.connect(reopenedBus);
    const reopened = await hoverPin(harness, reopenedBus, 'tavern');

    expect(reopened).toBe(pinned);
    expect(reopened.style.left).toBe('321px');
    expect(reopened.style.width).toBe('480px');
    expect(document.querySelectorAll('.atlas-note-preview-window')).toHaveLength(1);
  });

  it('only hides pinned previews while the asset manager is open', async () => {
    const pinned = await hoverPin(harness, eventBus, 'tavern');
    pin(pinned);

    harness.manager.suspendPreviews();
    expect(pinned.style.display).toBe('none');

    harness.manager.resumePreviews();
    expect(pinned.isConnected).toBe(true);
    expect(pinned.style.display).toBe('');
  });
});
