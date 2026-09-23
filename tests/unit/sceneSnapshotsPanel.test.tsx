import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { TFile } from 'obsidian';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const ui = vi.hoisted(() => ({ current: { app: {}, view: {} } as { app: unknown; view: unknown } }));
const dialogs = vi.hoisted(() => ({ promptForText: vi.fn(), confirmAction: vi.fn() }));

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ui.current,
}));
vi.mock('../../src/app/ui/textInputDialog', () => ({ promptForText: dialogs.promptForText }));
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
  vault.app.vault.getResourcePath = vi.fn((file: TFile) => `app://${file.path}`);
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

describe('scene snapshots page', () => {
  it('saves the current map under the name the user gives it', async () => {
    const { view } = renderPanel();
    expect(await screen.findByText(/No snapshots yet/)).toBeTruthy();

    dialogs.promptForText.mockResolvedValueOnce('Before the ambush');
    fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));

    expect(await screen.findByText('Before the ambush')).toBeTruthy();
    expect(dialogs.promptForText).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'Snapshot 1' }));
    expect(view.saveMap).toHaveBeenCalled();
    const thumbnail = screen.getByRole('button', { name: 'Restore Before the ambush' }).querySelector('img');
    expect(thumbnail?.getAttribute('src')).toMatch(/^app:\/\/.*Cave\.snapshots\/.*\.jpg$/);
  });

  it('saves nothing when the name dialog is cancelled', async () => {
    const { vault } = renderPanel();
    dialogs.promptForText.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));

    await waitFor(() => expect(dialogs.promptForText).toHaveBeenCalled());
    expect([...vault.files.keys()].some((path) => path.includes('.snapshots/'))).toBe(false);
  });

  it('restores a snapshot into the map after confirmation and closes the palette', async () => {
    const { vault, view, onClose } = renderPanel();
    dialogs.promptForText.mockResolvedValueOnce('Start');
    fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));
    const card = await screen.findByRole('button', { name: 'Restore Start' });

    vault.files.set(MAP_PATH, mapWithGoblinAt(99));
    dialogs.confirmAction.mockResolvedValueOnce(true);
    fireEvent.click(card);

    await waitFor(() => expect(view.reloadActiveScene).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const map = JSON.parse(vault.files.get(MAP_PATH)!) as { state: { objects: { tokens: { g: { x: number } } } } };
    expect(map.state.objects.tokens.g.x).toBe(10);
  });

  it('leaves the map alone when the restore is not confirmed', async () => {
    const { view, onClose } = renderPanel();
    dialogs.promptForText.mockResolvedValueOnce('Start');
    fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));
    const card = await screen.findByRole('button', { name: 'Restore Start' });

    dialogs.confirmAction.mockResolvedValueOnce(false);
    fireEvent.click(card);

    await waitFor(() => expect(dialogs.confirmAction).toHaveBeenCalled());
    expect(view.reloadActiveScene).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renames and deletes snapshots', async () => {
    renderPanel();
    dialogs.promptForText.mockResolvedValueOnce('Start');
    fireEvent.click(screen.getByRole('button', { name: /Save snapshot/ }));
    await screen.findByText('Start');

    dialogs.promptForText.mockResolvedValueOnce('Boss fight');
    fireEvent.click(within(screen.getByRole('group', { name: 'Start' })).getByRole('button', { name: 'Rename' }));
    expect(await screen.findByText('Boss fight')).toBeTruthy();

    dialogs.confirmAction.mockResolvedValueOnce(true);
    fireEvent.click(within(screen.getByRole('group', { name: 'Boss fight' })).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/No snapshots yet/)).toBeTruthy();
  });
});
