import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { TFile } from 'obsidian';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const ui = vi.hoisted(() => ({ current: { app: {}, view: {} } as { app: unknown; view: unknown } }));
const dialogs = vi.hoisted(() => ({ confirmAction: vi.fn() }));
const menu = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ui.current,
}));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: menu.open }));
vi.mock('../../src/app/ui/confirmDialog', () => ({ confirmAction: dialogs.confirmAction }));

import { SceneSnapshotsPanel } from '../../src/app/react/components/command-palette/SceneSnapshotsPanel';

interface FakeView {
  viewId: string;
  file: TFile;
  saveMap: ReturnType<typeof vi.fn>;
  reloadActiveScene: ReturnType<typeof vi.fn>;
  serviceManager: { renderMapThumbnail: () => ArrayBuffer };
}

function mapWithGoblinAt(x: number): string {
  return JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: MAP_PATH, objects: { tokens: { g: { id: 'g', x, y: 0, imagePath: 'goblin.webp' } } } } });
}

function renderPanel(): { vault: InMemoryApp; view: FakeView; onClose: ReturnType<typeof vi.fn> } {
  const vault = createInMemoryApp({ files: { [MAP_PATH]: mapWithGoblinAt(10) } });
  const view: FakeView = {
    viewId: 'view-1',
    file: new TFile(MAP_PATH),
    saveMap: vi.fn(async () => {}),
    reloadActiveScene: vi.fn(async (rewrite: (file: TFile) => Promise<void>) => rewrite(new TFile(MAP_PATH))),
    serviceManager: { renderMapThumbnail: () => new TextEncoder().encode('JPG').buffer },
  };
  ui.current = { app: vault.app, view };
  const store = create(() => ({ mapPath: MAP_PATH }));
  const onClose = vi.fn();
  render(<ViewStoreProvider store={store}><SceneSnapshotsPanel onRestore={onClose} /></ViewStoreProvider>);
  return { vault, view, onClose };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

interface MenuItem { type: string; label?: string; onClick?: () => unknown }

/** Right-clicks the card and runs the context menu item labelled `label`. */
function chooseFromMenu(cardName: string, label: string): void {
  fireEvent.contextMenu(screen.getByRole('group', { name: cardName }));
  const entries = menu.open.mock.calls.at(-1)?.[0] as MenuItem[];
  act(() => { void entries.find((entry) => entry.label === label)?.onClick?.(); });
}

/** The goblin's x position stored in the only snapshot of the map. */
function savedGoblinX(vault: InMemoryApp): number | undefined {
  const path = [...vault.files.keys()].find((file) => file.endsWith('.json') && file.includes('.snapshots/'));
  const snapshot = path ? JSON.parse(vault.files.get(path)!) as { state: { objects: { tokens: { g: { x: number } } } } } : null;
  return snapshot?.state.objects.tokens.g.x;
}

async function saveSnapshot(): Promise<void> {
  const count = screen.queryAllByRole('group').length;
  fireEvent.click(screen.getByRole('button', { name: /New snapshot/ }));
  await waitFor(() => expect(screen.queryAllByRole('group')).toHaveLength(count + 1));
}

describe('scene snapshots page', () => {
  it('saves the current map under the next default name without asking', async () => {
    const { view } = renderPanel();
    expect(await screen.findByText(/No snapshots yet/)).toBeTruthy();

    await saveSnapshot();
    await saveSnapshot();

    expect(screen.getAllByRole('group').map((card) => card.getAttribute('aria-label')).sort()).toEqual(['Snapshot 1', 'Snapshot 2']);
    expect(view.saveMap).toHaveBeenCalledTimes(2);
    const thumbnail = screen.getByRole('button', { name: 'Restore Snapshot 1' }).querySelector('img');
    expect(thumbnail?.getAttribute('src')).toMatch(/^app:\/\/local\/.*\/\.snapshots\/Cave\/.*\.jpg\?v=\d+$/);
  });

  it('renames in place: Enter keeps the new name, Escape cancels', async () => {
    renderPanel();
    await saveSnapshot();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Snapshot 1' }));
    const input = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(input, { target: { value: 'Boss fight' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('group', { name: 'Boss fight' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Boss fight' }));
    const again = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(again, { target: { value: 'Discarded' } });
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('group', { name: 'Boss fight' })).toBeTruthy();
  });

  it('keeps the name when the rename loses focus, and never allows an empty name', async () => {
    renderPanel();
    await saveSnapshot();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Snapshot 1' }));
    const input = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(input, { target: { value: 'Ambush' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('group', { name: 'Ambush' })).toBeTruthy();

    chooseFromMenu('Ambush', 'Rename');
    const cleared = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(cleared, { target: { value: '  ' } });
    fireEvent.blur(cleared);
    expect(screen.getByRole('group', { name: 'Ambush' })).toBeTruthy();
  });

  it('restores a snapshot into the map after confirmation and closes the palette', async () => {
    const { vault, view, onClose } = renderPanel();
    await saveSnapshot();

    vault.files.set(MAP_PATH, mapWithGoblinAt(99));
    dialogs.confirmAction.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Snapshot 1' }));

    await waitFor(() => expect(view.reloadActiveScene).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const map = JSON.parse(vault.files.get(MAP_PATH)!) as { state: { objects: { tokens: { g: { x: number } } } } };
    expect(map.state.objects.tokens.g.x).toBe(10);
  });

  it('leaves the map alone when the restore is not confirmed', async () => {
    const { view, onClose } = renderPanel();
    await saveSnapshot();

    dialogs.confirmAction.mockResolvedValueOnce(false);
    chooseFromMenu('Snapshot 1', 'Restore');

    await waitFor(() => expect(dialogs.confirmAction).toHaveBeenCalled());
    expect(view.reloadActiveScene).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('overwrites a snapshot with the current map after confirmation', async () => {
    const { vault } = renderPanel();
    await saveSnapshot();

    vault.files.set(MAP_PATH, mapWithGoblinAt(42));
    dialogs.confirmAction.mockResolvedValueOnce(false);
    chooseFromMenu('Snapshot 1', 'Overwrite with current map');
    await waitFor(() => expect(dialogs.confirmAction).toHaveBeenCalledTimes(1));
    expect(savedGoblinX(vault)).toBe(10);

    dialogs.confirmAction.mockResolvedValueOnce(true);
    chooseFromMenu('Snapshot 1', 'Overwrite with current map');
    await waitFor(() => expect(savedGoblinX(vault)).toBe(42));
    expect(screen.getByRole('group', { name: 'Snapshot 1' })).toBeTruthy();
  });

  it('deletes a snapshot from the context menu after confirmation', async () => {
    renderPanel();
    await saveSnapshot();

    dialogs.confirmAction.mockResolvedValueOnce(true);
    chooseFromMenu('Snapshot 1', 'Delete');
    expect(await screen.findByText(/No snapshots yet/)).toBeTruthy();
  });
});
