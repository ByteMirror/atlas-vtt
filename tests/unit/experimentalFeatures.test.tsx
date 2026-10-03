import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dynamicLightingOn, EXPERIMENTAL_FEATURES } from '../../src/app/experimental/experimentalFeatures';
import { availableHotkeys } from '../../src/app/keyboard/mapHotkeys';
import { ExperimentalFeaturesPanel } from '../../src/app/react/components/command-palette/ExperimentalFeaturesPanel';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** A vault whose settings file holds `stored`, read. */
async function settingsFrom(stored: unknown): Promise<SettingsService> {
  const app = { vault: { adapter: { exists: async () => true, read: async () => JSON.stringify(stored) } } };
  const settings = new SettingsService(app as never);
  await settings.initialize();
  return settings;
}

// A switched feature schedules a save; the tests end before it runs.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('experimental features in the settings', () => {
  it('are all off until the GM switches them on', async () => {
    const settings = await settingsFrom({});
    for (const { id } of EXPERIMENTAL_FEATURES) expect(settings.isExperimentalOn(id)).toBe(false);
  });

  it('are off in a vault whose settings cannot be reached', () => {
    expect(dynamicLightingOn(undefined)).toBe(false);
    expect(dynamicLightingOn(createInMemoryApp({ files: {} }).app)).toBe(false);
  });

  it('are on where the file says so, and off for anything else it holds', async () => {
    expect((await settingsFrom({ experimental: { dynamicLighting: true } })).isExperimentalOn('dynamicLighting')).toBe(true);
    for (const experimental of [null, 'all', [], { dynamicLighting: 'yes' }, { dynamicLighting: 1 }]) {
      expect((await settingsFrom({ experimental })).isExperimentalOn('dynamicLighting')).toBe(false);
    }
  });

  it('tell their listeners when one is switched, and only then', async () => {
    const settings = await settingsFrom({});
    const heard = vi.fn();
    settings.onChange(heard);
    settings.setExperimental('dynamicLighting', false);
    expect(heard).not.toHaveBeenCalled();
    settings.setExperimental('dynamicLighting', true);
    expect(heard).toHaveBeenCalledOnce();
    expect(settings.isExperimentalOn('dynamicLighting')).toBe(true);
    expect(settings.getAllSettings().experimental).toEqual({ dynamicLighting: true });
  });
});

describe('the shortcuts of dynamic lighting', () => {
  const ids = (isOn?: () => boolean): string[] => availableHotkeys(false, isOn).map(({ id }) => id);

  it('are on offer only while the feature is on', () => {
    expect(ids(() => true)).toEqual(expect.arrayContaining(['wall', 'lightingPeek']));
    expect(ids(() => false)).not.toContain('wall');
    expect(ids(() => false)).not.toContain('lightingPeek');
    expect(ids(() => false)).toContain('pin');
  });

  it('keep their keys while it is off: another shortcut cannot take them', async () => {
    const settings = await settingsFrom({});
    expect(() => settings.setHotkey('pin', 'w')).toThrow(/Lighting/);
  });
});

describe('the command palette\'s Experimental features page', () => {
  it('switches dynamic lighting on and off', async () => {
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    await settings.initialize();
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <ExperimentalFeaturesPanel />
      </AtlasUIContext.Provider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Dynamic lighting' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(settings.isExperimentalOn('dynamicLighting')).toBe(true);
    expect(screen.getByRole('switch', { name: 'Dynamic lighting' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Dynamic lighting' }));
    expect(settings.isExperimentalOn('dynamicLighting')).toBe(false);
  });
});
