import { waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MarkdownRenderer, TFile, WorkspaceLeaf } from 'obsidian';
import { NotePreviewWindow } from '../../src/app/services/NotePreviewWindow';

function installDomHelpers(): void {
  (HTMLElement.prototype as any).empty = function empty(): void {
    this.innerHTML = '';
  };
  (HTMLElement.prototype as any).setText = function setText(value: string): void {
    this.textContent = value;
  };
  (HTMLElement.prototype as any).createDiv = function createDiv(options?: { cls?: string; text?: string }): HTMLDivElement {
    const el = document.createElement('div');
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement.prototype as any).createSpan = function createSpan(options?: { cls?: string; text?: string }): HTMLSpanElement {
    const el = document.createElement('span');
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement.prototype as any).createEl = function createEl(
    tag: string,
    options?: { cls?: string; text?: string },
  ): HTMLElement {
    const el = document.createElement(tag);
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
}

interface PreviewHarness {
  app: {
    vault: { read: Mock; getAbstractFileByPath: Mock };
    metadataCache: { getFileCache: Mock };
    workspace: { getActiveViewOfType: Mock; getLeaf: Mock; setActiveLeaf: Mock };
  };
  /** Kept separately: the window swaps `workspace.setActiveLeaf` for a bound copy while it opens the note. */
  setActiveLeaf: Mock;
  atlasLeaf: WorkspaceLeaf;
  atlasLeafRoot: HTMLElement;
}

/** An Atlas map leaf mounted in the DOM plus a workspace that hands out `previewLeaf`. */
function createHarness(previewLeaf: WorkspaceLeaf | null): PreviewHarness {
  const atlasLeafRoot = document.createElement('div');
  atlasLeafRoot.className = 'workspace-leaf mod-active';
  const atlasLeafContainer = atlasLeafRoot.createDiv({ cls: 'view-content' });
  document.body.appendChild(atlasLeafRoot);

  const atlasLeaf = new WorkspaceLeaf();
  atlasLeaf.view = { containerEl: atlasLeafContainer };

  const setActiveLeaf = vi.fn();
  const app = {
    vault: {
      read: vi.fn(async () => 'Preview body'),
      getAbstractFileByPath: vi.fn((path: string) => new TFile(path)),
    },
    metadataCache: { getFileCache: vi.fn(() => null) },
    workspace: {
      getActiveViewOfType: vi.fn(() => null),
      getLeaf: vi.fn(() => previewLeaf),
      setActiveLeaf,
    },
  };

  return { app, setActiveLeaf, atlasLeaf, atlasLeafRoot };
}

function openPreview(harness: PreviewHarness, notePath: string): NotePreviewWindow {
  return new NotePreviewWindow(
    harness.app as never,
    notePath,
    { id: 'pin-1', notePath } as never,
    { handlePreviewClosed: vi.fn() } as never,
    { x: 120, y: 80 },
    harness.atlasLeaf,
  );
}

describe('NotePreviewWindow markdown previews', () => {
  let renderSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installDomHelpers();
    renderSpy = vi.spyOn(MarkdownRenderer, 'render');
  });

  afterEach(() => {
    NotePreviewWindow.closeAllPreviews();
    renderSpy.mockRestore();
    document.body.innerHTML = '';
  });

  it('opens markdown notes in a detached leaf so the preview stays editable and the map stays active', async () => {
    const noteViewEl = document.createElement('div');
    const previewLeaf = new WorkspaceLeaf();
    previewLeaf.view = { containerEl: noteViewEl };
    const openFile = vi.fn(async () => undefined);
    const detach = vi.fn();
    Object.assign(previewLeaf, { openFile, detach });

    const harness = createHarness(previewLeaf);
    const preview = openPreview(harness, 'atlas-vtt/notes/Preview Note.md');

    await waitFor(() => {
      expect(preview.element?.contains(noteViewEl)).toBe(true);
    });

    expect(harness.app.workspace.getLeaf).toHaveBeenCalledWith(true);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'atlas-vtt/notes/Preview Note.md' }),
      { active: false },
    );
    expect(harness.setActiveLeaf).toHaveBeenLastCalledWith(harness.atlasLeaf, { focus: false });
    expect(renderSpy).not.toHaveBeenCalled();
    expect(harness.atlasLeafRoot.contains(preview.element!)).toBe(false);
  });

  it('falls back to rendering the markdown when the workspace cannot provide a leaf', async () => {
    const harness = createHarness(null);
    const preview = openPreview(harness, 'atlas-vtt/notes/Preview Note.md#Overview');

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    expect(renderSpy).toHaveBeenCalledWith(
      harness.app,
      'Preview body',
      expect.any(HTMLElement),
      'atlas-vtt/notes/Preview Note.md',
      expect.anything(),
    );
    expect(harness.setActiveLeaf).toHaveBeenLastCalledWith(harness.atlasLeaf, { focus: false });
    expect(preview.element?.textContent).toContain('Preview body');
    expect(harness.atlasLeafRoot.contains(preview.element!)).toBe(false);
  });
});
