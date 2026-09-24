import { afterEach, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';

afterEach(() => vi.restoreAllMocks());

it('applies player bar and nameplate preferences independently of DM and per-token preferences', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as any);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as any);
  const store = createStore(() => ({ tokenSettings: { showNameplates: false, showHPBars: false, showStressBars: true }, grid: { size: 70 } }));
  const ui = new TokenUIRenderer(store as any);
  const token = { id: 'hero', kind: 'character', name: 'Hero', showNameplate: true, statblockPath: 'hero.md', hp: { current: 8, max: 10 }, stress: { current: 2, max: 6 } } as any;
  const original = store.getState();
  try {
    ui.update(token, 70, { showTokenHP: true, showTokenStress: false, showTokenNameplates: true });
    expect((ui as any).hpBar.visible).toBe(true);
    expect((ui as any).stressBar.visible).toBe(false);
    expect((ui as any).nameText.visible).toBe(true);
    ui.update(token, 70, { showTokenHP: false, showTokenStress: true, showTokenNameplates: false });
    expect((ui as any).hpBar.visible).toBe(false);
    expect((ui as any).stressBar.visible).toBe(true);
    expect((ui as any).nameText.visible).toBe(false);
    expect(store.getState()).toBe(original);
  } finally { ui.destroy(); }
});
