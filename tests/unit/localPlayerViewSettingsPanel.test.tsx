import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LocalPlayerViewSettingsPanel } from '../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel';

const context = vi.hoisted(() => ({ settings: null as any }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ app: {}, view: { serviceManager: { getSettingsService: () => context.settings } } }) }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('updates every supported setting and follows settings changed elsewhere', () => {
  vi.useFakeTimers();
  context.settings = new SettingsService({} as any);
  render(<LocalPlayerViewSettingsPanel />);
  const settings = context.settings as SettingsService;
  for (const [label, key] of [
    ['Show initiative panel', 'showInitiative'], ['Show grid', 'showGrid'], ['Show widgets', 'showWidgets'], ['Show HP bars', 'showTokenHP'],
    ['Show secondary resource bars', 'showTokenStress'], ['Show nameplates', 'showTokenNameplates'],
  ] as const) {
    const toggle = screen.getByRole('switch', { name: label });
    const before = settings.getLocalPlayerViewSettings()[key];
    fireEvent.click(toggle);
    expect(settings.getLocalPlayerViewSettings()[key]).toBe(!before);
    act(() => settings.setLocalPlayerViewSettings({ [key]: before }));
    expect(toggle.getAttribute('aria-checked')).toBe(String(before));
  }
  expect(screen.queryByRole('switch', { name: 'Show note previews' })).toBeNull();
  expect(screen.getByText('Note previews are not shared with the player window.')).toBeTruthy();
});
