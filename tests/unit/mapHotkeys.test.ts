import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { hotkeyFromEvent, formatHotkey, matchesHotkey, canRunMapHotkeys, MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';

function service() {
  const files = new Map<string, string>();
  const app = { vault: { adapter: {
    exists: async (path: string) => files.has(path), mkdir: async () => {},
    read: async (path: string) => files.get(path)!,
    write: async (path: string, data: string) => { files.set(path, data); },
  } } } as any;
  return { settings: new SettingsService(app), app, files };
}
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('map hotkeys', () => {
  it('formats letter bindings without changing named keys', () => {
    expect(formatHotkey('Enter')).toBe('Enter');
    expect(formatHotkey('Space')).toBe('Space');
    expect(formatHotkey('Mod+Shift+z')).toBe('Ctrl/Cmd + Shift + Z');
  });
  it('persists single-key bindings and tutorial progress across reloads', async () => {
    const { settings, app } = service();
    await settings.initialize();
    settings.setHotkey('assets', 'q');
    settings.completeTutorial('assets');
    settings.markTokenImported();
    await settings.saveSettingsNow();
    const reloaded = new SettingsService(app);
    await reloaded.initialize();
    expect(reloaded.getHotkeys().assets).toBe('q');
    expect(reloaded.shouldShowTutorial('assets')).toBe(false);
    expect(reloaded.shouldShowTutorial('tokenStatblocks')).toBe(true);
    expect(reloaded.getSetting('onboarding').tokenImported).toBe(true);
    expect(reloaded.getHotkeys().palette).toBe('Space');
  });
  it('allows bindings reserved only by disabled tools', () => {
    const { settings } = service();
    expect(() => settings.setHotkey('assets', 'w')).not.toThrow();
  });
  it('rejects collisions, allows clearing, and resets bindings', () => {
    const { settings } = service();
    expect(() => settings.setHotkey('assets', 'v')).toThrow(/Move/);
    expect(settings.getHotkeys().assets).toBe('a');
    settings.setHotkey('move', '');
    settings.setHotkey('assets', 'v');
    settings.resetHotkeys();
    expect(settings.getHotkeys().assets).toBe('a');
    expect(settings.getHotkeys().move).toBe('v');
  });
  it('normalizes punctuation, modifier chords and shifted digits', () => {
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true }))).toBe('?');
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true }))).toBe('Shift+1');
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+a');
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }), 'v')).toBe(false);
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: ' ' }), 'Space')).toBe(true);
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: 'v', repeat: true }), 'v')).toBe(false);
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: 'v', isComposing: true }), 'v')).toBe(false);
  });
  it('scopes shortcuts to the active map and blocks editable content and overlays', () => {
    document.body.innerHTML = '<div class="workspace-leaf mod-active"><div data-view-id="map-one"></div></div>';
    const event = new KeyboardEvent('keydown', { key: 'v' });
    expect(canRunMapHotkeys(event, 'map-one')).toBe(true);
    expect(canRunMapHotkeys(event, 'map-two')).toBe(false);
    const input = document.createElement('input'); document.body.append(input);
    input.dispatchEvent(event);
    expect(canRunMapHotkeys(event, 'map-one')).toBe(false);
    const modal = document.createElement('div'); modal.className = 'atlas-asset-manager-modal'; document.body.append(modal);
    expect(canRunMapHotkeys(new KeyboardEvent('keydown'), 'map-one')).toBe(false);
  });
  it('has no conflicting default bindings', () => {
    const bindings = MAP_HOTKEYS.map(action => action.defaultKey).filter(Boolean);
    expect(new Set(bindings).size).toBe(bindings.length);
  });
  it('replays tutorials without losing hotkeys and does not share progress across vaults', () => {
    const { settings } = service(); settings.completeTutorial('palette');
    expect(service().settings.shouldShowTutorial('palette')).toBe(true);
    settings.setHotkey('assets', 'q'); settings.resetTutorials();
    expect(settings.shouldShowTutorial('palette')).toBe(true);
    expect(settings.getHotkeys().assets).toBe('q');
  });
});
