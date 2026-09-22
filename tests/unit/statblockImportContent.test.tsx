import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StatblockImportContent } from '../../src/app/packages/components/asset-manager/statblock-import/StatblockImportContent';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const fake = vi.hoisted(() => ({ scan: vi.fn(), import: vi.fn(), getCollections: vi.fn() }));
vi.mock('../../src/app/services/StatblockTokenImportService', () => ({
  StatblockTokenImportService: class { scan = fake.scan; import = fake.import; },
}));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({ getCollections: fake.getCollections }) } }));
afterEach(cleanup);

function setup() {
  fake.scan.mockResolvedValue([
    { name: 'Goblin', path: 'Bestiary/Goblin.md', imagePath: 'goblin.webp', status: 'ready', detail: 'Ready' },
    { name: 'Ogre', path: 'Bestiary/Ogre.md', imagePath: 'ogre.webp', status: 'ready', detail: 'Ready' },
    { name: 'Dragon', path: 'Bestiary/Dragon.md', status: 'missing-image', detail: 'Image missing' },
    { name: 'Rat', path: 'Bestiary/Rat.md', status: 'imported', detail: 'Already imported' },
  ]);
  fake.getCollections.mockResolvedValue([{ id: 'default', name: 'Default' }, { id: 'campaign', name: 'My campaign' }]);
  fake.import.mockResolvedValue({ items: [{ path: 'Bestiary/Goblin.md', name: 'Goblin', status: 'created', message: 'Token created' }], cancelled: false, uncertain: false });
  const { app } = createInMemoryApp();
  app.vault.getResourcePath = (p: { path: string }) => p.path;
  const controller = new AbortController();
  render(<StatblockImportContent app={app} initialCollection="default" onClose={vi.fn()} controller={controller} />);
  return controller;
}

it('selects only ready creatures, preserves selection during search and imports into the chosen collection', async () => {
  setup();
  const goblin = await screen.findByRole('checkbox', { name: 'Select Goblin' });
  expect((goblin as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Select Dragon' }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Select Rat' }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ogre' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Goblin' } });
  fireEvent.change(screen.getByLabelText('Collection'), { target: { value: 'campaign' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 token' }));
  await waitFor(() => expect(fake.import).toHaveBeenCalledWith(['Bestiary/Goblin.md'], 'campaign', expect.objectContaining({ signal: expect.any(AbortSignal) })));
  expect(await screen.findByText('1 created · 0 skipped · 0 failed')).toBeTruthy();
});

it('offers cancellation during a running import and blocks a second submission', async () => {
  const controller = setup();
  await screen.findByRole('button', { name: 'Import 2 tokens' });
  let finish!: (value: unknown) => void;
  fake.import.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Import 2 tokens' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop import' }));
  expect(controller.signal.aborted).toBe(true);
  finish({ items: [], cancelled: true, uncertain: false });
  expect(await screen.findByText(/Import stopped/)).toBeTruthy();
});
