import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LocalPlayerView } from '../../src/app/local-player-view';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import { PlayerWindowService, type PlayerFrameSource } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); });

function scene(name = 'Hero', initiativeTrackerOpen = true): StoreApi<ViewAtlasState> {
  const token: TokenEntity = { id: 'hero', kind: 'token', x: 0, y: 0, imagePath: '' };
  const entry: InitiativeEntry = {
    id: 'entry', tokenId: token.id, name, initiative: 18, initiativeModifier: 2,
    hp: { current: 8, max: 10 }, imagePath: '', isActive: true,
    isDefeated: false, isNPC: false, order: 0,
  };
  return createStore(() => ({
    initiative: { ...createDefaultInitiativeState(), entries: [entry], isActive: true, round: 1 },
    objects: { tokens: { hero: token } }, initiativeTrackerOpen,
  })) as StoreApi<ViewAtlasState>;
}

function setup(initiativeTrackerOpen = true): { service: PlayerWindowService; settings: SettingsService; store: StoreApi<ViewAtlasState>; doc: Document; source: PlayerFrameSource } {
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp();
  const settings = new SettingsService(app);
  const store = scene('Hero', initiativeTrackerOpen);
  const service = new PlayerWindowService(app, store, settings);
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  Object.defineProperty(doc.body, 'win', { value: {
    document: doc, closed: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(),
    requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
  } });
  const source = { canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store };
  service.attachToView({ contentEl: doc.body, updateSession: vi.fn() } as LocalPlayerView, source, 'scene-a');
  return { service, settings, store, doc, source };
}

describe('player initiative panel', () => {
  it('gates player sharing independently of other widgets and follows combat changes', () => {
    const { settings, store, doc } = setup();
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(panel()).not.toBeNull();
    expect(panel()?.textContent).toContain('18');
    expect(panel()?.textContent).toContain('Round 1');
    expect(panel()?.querySelector('button, input, [draggable="true"]')).toBeNull();
    settings.setLocalPlayerViewSettings({ showWidgets: false });
    expect(panel()).not.toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    expect(panel()).toBeNull();
    store.setState({ initiative: { ...store.getState().initiative, round: 2 } });
    settings.setLocalPlayerViewSettings({ showInitiative: true });
    expect(panel()?.textContent).toContain('Round 2');
    expect(store.getState().initiativeTrackerOpen).toBe(true);
  });

  it('requires the DM tracker to be open and reacts immediately to visibility changes', () => {
    const { settings, store, doc } = setup(false);
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(settings.getLocalPlayerViewSettings().showInitiative).toBe(true);
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).not.toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    expect(panel()).toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    settings.setLocalPlayerViewSettings({ showInitiative: true });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).not.toBeNull();
  });

  it('excludes hidden and deleted tokens, and respects the player name and HP settings', () => {
    const { settings, store, doc } = setup();
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(panel()?.textContent).not.toContain('Hero');
    expect(panel()?.querySelector('progress')).toBeNull();
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true, showTokenHP: true });
    expect(panel()?.textContent).toContain('Hero');
    expect(panel()?.querySelector('progress')?.value).toBe(8);
    const objects = store.getState().objects;
    store.setState({ objects: { ...objects, tokens: { hero: { ...objects.tokens.hero!, isHidden: true } } } });
    expect(panel()).toBeNull();
    store.setState({ objects: { ...objects, tokens: {} } });
    expect(panel()).toBeNull();
  });

  it('holds the presented initiative while browsing and binds to a newly presented view', () => {
    const { service, settings, store, doc, source } = setup();
    service.holdCurrentFrame();
    store.setState({ initiative: { ...store.getState().initiative, round: 9 } });
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    expect(doc.body.textContent).toContain('Round 1');
    expect(doc.body.textContent).not.toContain('Round 9');
    store.setState({ initiativeTrackerOpen: false });
    expect(doc.querySelector('[aria-label="Initiative order"]')).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(doc.body.textContent).toContain('Round 1');
    expect(doc.body.textContent).not.toContain('Round 9');
    service.releaseHeldFrame(source);
    expect(doc.body.textContent).toContain('Round 9');
    const other = scene('Other hero');
    service.presentCanvas({ ...source, store: other }, 'scene-b');
    expect(doc.body.textContent).toContain('Other hero');
    other.setState({ initiative: { ...other.getState().initiative, round: 3 } });
    expect(doc.body.textContent).toContain('Round 3');
    service.destroy();
    const before = doc.body.textContent;
    other.setState({ initiative: { ...other.getState().initiative, round: 4 } });
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    expect(doc.body.textContent).toBe(before);
  });

  it('defaults on for old settings and persists the DM choice across reloads', async () => {
    const { app } = createInMemoryApp({ files: { 'atlas-vtt/settings.json': JSON.stringify({ localPlayerView: { showWidgets: false } }) } });
    const settings = new SettingsService(app);
    await settings.initialize();
    expect(settings.getLocalPlayerViewSettings().showInitiative).toBe(true);
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    await settings.saveSettingsNow();
    const reloaded = new SettingsService(app);
    await reloaded.initialize();
    expect(reloaded.getLocalPlayerViewSettings()).toMatchObject({ showInitiative: false, showWidgets: false });
  });
});
