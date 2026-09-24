import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateCollectionModal } from '../../src/app/packages/components/asset-manager/CreateCollectionModal';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(existingNames: string[] = []) {
  const { app } = createInMemoryApp();
  app.workspace = { getLeavesOfType: () => [], trigger: vi.fn() } as any;
  const settings = new SettingsService(app);
  const stored: Record<string, Record<string, unknown>> = {};
  const assets = {
    createCollection: vi.fn(async (name: string) => {
      stored[name] = { conditions: [] };
      return { id: name, name };
    }),
    updateCollectionSettings: vi.fn(async (id: string, update: Record<string, unknown>) => {
      stored[id] = { ...stored[id], ...update };
    }),
    getCollectionSettings: (id: string) => stored[id] ?? { conditions: [] },
    getCollectionForMap: () => null,
  };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets as any);
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ app } as never}>
      <CreateCollectionModal existingNames={existingNames} onClose={onClose} onCreated={onCreated} />
    </AtlasUIContext.Provider>,
  );
  return { assets, stored, settings, onCreated, onClose };
}

const radio = (name: string): HTMLElement => screen.getByRole('radio', { name: new RegExp(`^${name}`) });

describe('CreateCollectionModal', () => {
  it('creates a collection with a built-in system, its widgets and its bars', async () => {
    const { stored, onCreated, onClose } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gloomhollow' } });
    fireEvent.click(radio('Shadowdark'));
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Gloomhollow'));
    expect(onClose).toHaveBeenCalled();
    expect(stored.Gloomhollow).toMatchObject({
      systemPresetId: 'builtin:shadowdark',
      defaultWidgets: { hpBar: true },
      widgets: { 'shadowdark-torch': { label: 'Torch' } },
    });
  });

  it('starts Daggerheart collections with HP and Stress bars', async () => {
    const { stored, onCreated } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Age of Umbra' } });
    fireEvent.click(radio('Daggerheart'));
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(stored['Age of Umbra']).toMatchObject({ defaultWidgets: { hpBar: true, stressBar: true } });
  });

  it('refuses a name another collection has', () => {
    const { assets } = setup(['Gloomhollow']);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'gloomhollow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    expect(screen.getByRole('alert').textContent).toBe('A collection named "gloomhollow" already exists');
    expect(assets.createCollection).not.toHaveBeenCalled();
  });

  it('sets up a new game system, saves it as a preset and starts the collection with it', async () => {
    const { stored, settings, onCreated } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Homebrew Hills' } });
    fireEvent.click(radio('Create your own'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('New game system')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a name');

    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Hills Rules' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Condition/ }));
    fireEvent.change(screen.getByPlaceholderText('Condition name'), { target: { value: 'Muddy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Homebrew Hills'));
    const saved = settings.getSetting('systemPresets') as Array<{ id: string; name: string; rules: { conditions: Array<{ name: string }> } }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Hills Rules', rules: { conditions: [{ name: 'Muddy' }] } });
    expect(stored['Homebrew Hills']).toMatchObject({ systemPresetId: saved[0]!.id, conditions: [{ name: 'Muddy' }] });
  });

  it('goes back from the setup to the name and system', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(radio('Create your own'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // The header arrow and the footer button both go back; use the footer one.
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' }).at(-1)!);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('X');
  });
});
