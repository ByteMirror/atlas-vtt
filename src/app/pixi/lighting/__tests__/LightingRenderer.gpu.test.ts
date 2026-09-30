import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_DELAY, createHarness, resetContext, tokens, until, visionToken, type Harness } from './rendererHarness';

describe('LightingRenderer explored memory across a GPU reset', () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
  });

  afterEach(() => {
    harness?.dispose();
    harness = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function setup(patch: Record<string, unknown> = {}): Promise<Harness> {
    harness = await createHarness({ patch });
    await until(() => harness!.redAt(100, 100) > 250);
    return harness;
  }

  it('reloads the saved mask after a context change while lighting is off', async () => {
    const { renderer, state, change, redAt, settle } = await setup();
    change({ lighting: { ...state.lighting, enabled: false } });

    renderer.runners.contextChange.emit(renderer.gl);
    expect(redAt(100, 100)).toBe(0);
    await settle();
    expect(redAt(100, 100)).toBe(255);
  });

  it('does not let a save scheduled before the context change write the blank memory', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { renderer, state, change, setExploredMask, redAt, settle } = await setup();
    change({ objects: { ...state.objects, tokens: { t: visionToken(100) } } });
    change({ lighting: { ...state.lighting, enabled: false } });

    renderer.runners.contextChange.emit(renderer.gl);
    expect(redAt(100, 100)).toBe(0);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    await settle();
    expect(redAt(100, 100)).toBe(255);
  });

  it('holds back saves made while the reload is still under way', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { renderer, state, change, setExploredMask, redAt, settle } = await setup(tokens(visionToken(100)));

    renderer.runners.contextChange.emit(renderer.gl);
    expect(redAt(100, 100)).toBe(0);
    change({ objects: { ...state.objects, tokens: { t: visionToken(120) } } });
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    await settle();
    expect(redAt(100, 100)).toBe(255);
  });

  it('starts blank and saves normally after a context reset when the scene has no saved mask', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    harness = await createHarness({ patch: { exploredMask: null } });
    const { renderer, state, change, setExploredMask, redAt, settle } = harness;
    change({ lighting: { ...state.lighting, enabled: false } });

    await resetContext(renderer);
    await settle();
    expect(redAt(100, 100)).toBe(0);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();

    change({ lighting: { ...state.lighting, enabled: true }, ...tokens(visionToken(100)) });
    expect(redAt(100, 100)).toBe(255);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).toHaveBeenCalledTimes(1);
  });
});
