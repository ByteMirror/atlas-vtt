import { describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../src/app/types';
import { playerTokenSight } from '../../src/app/pixi/lighting/playerLightingLayers';
import { SAVE_DELAY, until } from '../../src/app/pixi/lighting/__tests__/rendererHarness';
import { RIGHT_ROOM, forget, memoryScenes, reveal } from './exploredMemoryScene';

describe('editing the explored memory', () => {
  const { scene } = memoryScenes();

  it('reveals and forgets with each shape on the texture sight records into', async () => {
    const { lighting, redAt } = await scene();
    expect(redAt(200, 128)).toBe(0);
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(true);
    expect(redAt(200, 128)).toBe(255);
    expect(redAt(130, 5)).toBe(255);
    expect(redAt(120, 128)).toBe(0);

    expect(lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 180, y: 60 }, { x: 220, y: 60 }] }))).toBe(true);
    expect(redAt(200, 60)).toBe(0);
    expect(redAt(200, 76)).toBe(0);
    expect(redAt(200, 84)).toBe(255);

    expect(lighting.editExplored(reveal({ type: 'lasso', points: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 60, y: 90 }] }))).toBe(true);
    expect(redAt(60, 40)).toBe(255);
    expect(redAt(20, 90)).toBe(0);

    expect(lighting.editExplored(reveal('everything'))).toBe(true);
    for (const [x, y] of [[0, 0], [255, 255], [200, 60], [20, 90]] as const) expect(redAt(x, y)).toBe(255);
    lighting.resetExplored();
    for (const [x, y] of [[0, 0], [255, 255], [200, 60], [60, 40]] as const) expect(redAt(x, y)).toBe(0);
  });

  it('makes each edit one undo step, and none of an edit that changes nothing', async () => {
    const { lighting, store, history } = await scene();
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(true);
    expect(history().pastStates).toHaveLength(1);
    expect(store.getState().exploredEdits).toBe(1);
    // Revealed already, forgotten already, or outside the map: nothing to take back.
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
    expect(lighting.editExplored(forget({ type: 'rectangle', x: 0, y: 0, width: 100, height: 100 }))).toBe(false);
    expect(lighting.editExplored(reveal({ type: 'rectangle', x: 900, y: 900, width: 50, height: 50 }))).toBe(false);
    lighting.resetExplored();
    lighting.resetExplored();
    expect(history().pastStates).toHaveLength(2);
    expect(store.getState().exploredEdits).toBe(2);
  });

  it('shows the players the explored look where the GM revealed, and nothing that is there now', async () => {
    const lit = await scene();
    const tokens = (): Record<string, TokenEntity> => lit.store.getState().objects.tokens;
    const sight = lit.lighting.currentSight();
    const reaches = lit.lighting.lightReaches();
    expect(playerTokenSight(lit.lighting, tokens())?.('goblin')).toBe('unseen');
    // Out of sight and unexplored: black, lamp or not.
    expect(lit.players()(200, 128)).toEqual([0, 0, 0]);

    lit.lighting.editExplored(reveal(RIGHT_ROOM));
    const after = lit.players();
    const [r, g, b] = after(200, 128);
    // The remembered map: dim and grey, far from the lamp's bright light.
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(110);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
    // What the tokens see and what light reaches them is what it was: the same objects.
    expect(lit.lighting.currentSight()).toBe(sight);
    expect(lit.lighting.lightReaches()).toBe(reaches);
    expect(playerTokenSight(lit.lighting, tokens())?.('goblin')).toBe('unseen');

    // The same room revealed in a scene without the lamp looks the same: the picture holds none of its light.
    const unlit = await scene({ lamp: false });
    unlit.lighting.editExplored(reveal(RIGHT_ROOM));
    const dark = unlit.players();
    for (const [x, y] of [[200, 128], [200, 100], [140, 20], [250, 250], [180, 128], [215, 140]] as const) expect(after(x, y)).toEqual(dark(x, y));
    // The GM's own picture still shows the lamp: the edit changed the memory alone.
    lit.lighting.modeLayer.visible = false;
  });

  it('shows the players the unexplored colour again where the GM made the scene forget', async () => {
    const { lighting, players } = await scene({ lighting: { unexploredColor: '#336699' } });
    lighting.editExplored(reveal(RIGHT_ROOM));
    lighting.editExplored(forget({ type: 'brush', brushRadius: 30, points: [{ x: 200, y: 128 }] }));
    const at = players();
    const [r, g, b] = at(200, 128);
    expect(Math.abs(r - 0x33)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 0x66)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 0x99)).toBeLessThanOrEqual(1);
    // Around the brush the room is still remembered.
    expect(at(200, 30)[0]).toBeGreaterThan(40);
    expect(at(200, 30)[0]).toBe(at(200, 30)[2]);
  });

  it('saves an edit with the scene after the usual delay, and an undo of it too', async () => {
    const { lighting, store, history, redAt } = await scene();
    // Whatever sight had to save is saved: from here on the edit is the only reason to.
    vi.advanceTimersByTime(SAVE_DELAY);
    const blank = store.getState().exploredMask;
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(store.getState().exploredMask).toBe(blank);

    lighting.editExplored(reveal(RIGHT_ROOM));
    expect(store.getState().exploredMask).toBe(blank);
    vi.advanceTimersByTime(SAVE_DELAY);
    const saved = store.getState().exploredMask;
    expect(saved).not.toBe(blank);
    expect(saved).toMatch(/^data:image\/png;base64,/);
    // The save itself is no undo step and does not disturb the memory.
    expect(history().pastStates).toHaveLength(1);
    expect(redAt(200, 128)).toBe(255);

    // Through a save and a reload the memory is what it was, texel for texel.
    const reloaded = await scene({ exploredMask: saved });
    await until(() => reloaded.redAt(200, 128) === 255);
    expect(reloaded.redAt(60, 128)).toBe(0);
    expect(reloaded.redAt(127, 128)).toBe(0);
    expect(reloaded.redAt(128, 128)).toBe(255);
    expect(reloaded.history().pastStates).toHaveLength(0);
    expect(reloaded.store.getState().exploredEdits).toBe(0);

    history().undo();
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(store.getState().exploredMask).not.toBe(saved);
    const undone = await scene({ exploredMask: store.getState().exploredMask });
    await undone.settle();
    expect(undone.redAt(200, 128)).toBe(0);
  });

  it('forgets everything as an undo step, with explored memory on or off', async () => {
    for (const exploredMemory of [true, false]) {
      const { lighting, history, redAt } = await scene({ lighting: { exploredMemory } });
      lighting.editExplored(reveal(RIGHT_ROOM));
      lighting.resetExplored();
      expect(redAt(200, 128)).toBe(0);
      expect(history().pastStates).toHaveLength(2);
      history().undo();
      expect(redAt(200, 128)).toBe(255);
    }
  });
});
