import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerCameraState } from '../../src/app/local-player-view';
import { RenderScheduler, requestRender, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import { captureBeforeRender, captureWithLayerVisibility, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { PLAYER_MIRROR_FPS, PlayerFrameMirror, type PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import type { AtlasSettings } from '../../src/app/services/SettingsService';
import { fakeApp, fakeGroup } from '../mocks/schedulerApp';

const SETTINGS = { showGrid: true } as AtlasSettings['localPlayerView'];
const DM_CAMERA: PlayerCameraState = { centerX: 1, centerY: 2, scale: 1 };

interface Dm {
  source: PlayerFrameSource;
  /** A display frame of the DM window at `time`. */
  tick(time: number): void;
  /** Something on the DM's stage changed. */
  change(): void;
  scheduler: RenderScheduler;
}

interface Harness {
  mirror: PlayerFrameMirror;
  /** Renders and captures in order; a capture names the frame the canvas held. */
  events: string[];
  /** A display frame of the player window at `time`. */
  frame(time: number): void;
  dm: Dm;
  createDm(): Dm;
  state: { source: PlayerFrameSource | null; held: HTMLCanvasElement | null; frozen: PlayerCameraState | null };
  onFrame: ReturnType<typeof vi.fn>;
  captureFails: { value: boolean };
}

function setup(): Harness {
  const events: string[] = [];
  const captureFails = { value: false };
  let onCanvas = 'nothing';
  let now = 0;

  /** A DM canvas rendering on change, whose pins are hidden from players. */
  function createDm(): Dm {
    const group = fakeGroup();
    // PIXI queues a render-group update when a layer is shown or hidden
    const pins = {
      shown: true,
      get visible(): boolean { return this.shown; },
      set visible(value: boolean) { this.shown = value; group.structureDidChange = true; },
    };
    const render = (): void => {
      onCanvas = pins.visible ? 'dm' : 'player';
      events.push(`render:${onCanvas}`);
      group.structureDidChange = false;
    };
    const { app, ticker } = fakeApp(group, render);
    const scheduler = new RenderScheduler(app);
    const layers: LayerVisibility[] = [{ layer: pins, visible: false }];
    const canvas = document.createElement('canvas');
    const source: PlayerFrameSource = {
      canvas,
      getCamera: () => DM_CAMERA,
      withPlayerSafeFrame: (capture) => captureWithLayerVisibility(layers, render, capture),
      beforeRender: {
        listen: (listener) => setBeforeRender(app, listener),
        requestRender: () => requestRender(app),
        withPlayerSafeFrame: (capture) => captureBeforeRender(layers, render, capture),
      },
    };
    return { source, scheduler, tick: (time) => ticker.update(time), change: () => { group.structureDidChange = true; } };
  }

  const dm = createDm();
  const state: Harness['state'] = { source: dm.source, held: null, frozen: null };
  const target = document.createElement('canvas');
  const context = {
    clearRect: vi.fn(),
    drawImage: (image: HTMLCanvasElement): void => {
      if (captureFails.value) throw new Error('lost context');
      events.push(image === state.held ? 'draw:held' : `capture:${onCanvas}`);
    },
  } as unknown as CanvasRenderingContext2D;
  const onFrame = vi.fn();
  const mirror = new PlayerFrameMirror(target, context, {
    source: () => state.source,
    heldFrame: () => state.held,
    frozenCamera: () => state.frozen,
    settings: () => SETTINGS,
    onFrame,
  }, () => now);
  return { mirror, events, dm, createDm, state, onFrame, captureFails, frame: (time) => { now = time; mirror.frame(); } };
}

const MIRRORED = ['render:player', 'capture:player', 'render:dm'];

/** A harness whose first frame is already on the players' screen. */
function mirroring(): Harness {
  const harness = setup();
  harness.frame(0);
  harness.dm.tick(1);
  harness.events.length = 0;
  harness.onFrame.mockClear();
  return harness;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('PlayerFrameMirror on a canvas that renders on change', () => {
  it('shows the first frame at once by asking the DM canvas for a render', () => {
    const { events, frame, dm } = setup();

    frame(0);
    expect(events).toEqual([]);
    dm.tick(1);

    expect(events).toEqual(MIRRORED);
  });

  it('spends one player render and one DM render on a mirrored frame and ends on the DM frame', () => {
    const { events, dm } = mirroring();

    dm.change();
    dm.tick(100);

    expect(events).toEqual(MIRRORED);
  });

  it('does not render while nothing changes', () => {
    const { events, frame, dm } = mirroring();

    for (let time = 20; time < 2000; time += 8) {
      frame(time);
      dm.tick(time + 1);
    }

    expect(events).toEqual([]);
  });

  it(`mirrors at most ${PLAYER_MIRROR_FPS} frames per second of a canvas rendering 120`, () => {
    const { events, frame, dm } = mirroring();

    for (let i = 1; i <= 120; i++) {
      const time = 1000 + (i * 1000) / 120;
      dm.change();
      dm.tick(time);
      frame(time + 2);
    }

    expect(events.filter((event) => event === 'render:dm')).toHaveLength(120);
    expect(events.filter((event) => event === 'render:player')).toHaveLength(60);
    expect(events.at(-1)).toBe('render:dm');
  });

  it('delivers the last frame when the cap skipped it and the DM canvas went idle', () => {
    const { events, frame, dm } = mirroring();
    dm.change();
    dm.tick(100);
    events.length = 0;

    dm.change();
    dm.tick(108);
    expect(events).toEqual(['render:dm']);

    // Too early for another mirrored frame
    frame(110);
    dm.tick(116);
    expect(events).toEqual(['render:dm']);

    frame(118);
    dm.tick(124);
    expect(events).toEqual(['render:dm', ...MIRRORED]);

    frame(140);
    dm.tick(141);
    expect(events).toHaveLength(4);
  });

  it('mirrors again when told the frame is stale, though the DM canvas did not change', () => {
    const { mirror, events, frame, dm } = mirroring();

    mirror.markStale();
    frame(50);
    dm.tick(51);

    expect(events).toEqual(MIRRORED);
  });

  it('keeps the DM render going when a capture fails, and reports the failure once', () => {
    const { events, frame, dm, captureFails } = mirroring();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    captureFails.value = true;

    dm.change();
    dm.tick(100);
    dm.change();
    dm.tick(200);
    expect(events).toEqual(['render:player', 'render:dm', 'render:player', 'render:dm']);
    expect(error).toHaveBeenCalledTimes(1);

    captureFails.value = false;
    events.length = 0;
    frame(201);
    dm.change();
    dm.tick(300);
    expect(events).toEqual(MIRRORED);
  });

  it('renders through the frozen camera and reports the camera players saw', () => {
    const { frame, dm, state, onFrame, mirror } = mirroring();
    const capture = vi.spyOn(dm.source.beforeRender!, 'withPlayerSafeFrame');

    dm.change();
    dm.tick(100);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), SETTINGS, undefined);
    expect(onFrame).toHaveBeenLastCalledWith(DM_CAMERA);

    state.frozen = { centerX: 10, centerY: 20, scale: 2 };
    mirror.markStale();
    frame(200);
    dm.tick(201);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), SETTINGS, state.frozen);
    expect(onFrame).toHaveBeenLastCalledWith(state.frozen);
  });

  it('draws a held frame once and mirrors nothing until it is released', () => {
    const { events, frame, dm, state } = mirroring();
    state.held = document.createElement('canvas');

    frame(100);
    frame(108);
    dm.change();
    dm.tick(110);
    expect(events).toEqual(['draw:held', 'render:dm']);

    events.length = 0;
    state.held = null;
    frame(200);
    dm.tick(201);
    expect(events).toEqual(MIRRORED);
  });

  it('follows the presented canvas and lets go of the previous one', () => {
    const { events, frame, dm, createDm, state } = mirroring();
    const next = createDm();
    next.tick(1);
    events.length = 0;

    state.source = next.source;
    // The previous canvas renders before the player window's next frame: not what players are shown
    dm.change();
    dm.tick(100);
    expect(events).toEqual(['render:dm']);

    frame(101);
    next.tick(102);
    expect(events).toEqual(['render:dm', ...MIRRORED]);

    events.length = 0;
    dm.change();
    dm.tick(200);
    expect(events).toEqual(['render:dm']);
  });

  it('captures the frame itself when the requested render does not come', () => {
    const { mirror, events, frame } = mirroring();
    mirror.markStale();

    frame(100);
    frame(200);
    expect(events).toEqual([]);

    // The DM window is hidden and its ticker asleep
    frame(400);
    expect(events).toEqual(MIRRORED);

    frame(408);
    frame(1000);
    expect(events).toEqual(MIRRORED);
  });

  it('mirrors nothing into a hidden player window, and catches up when it shows again', () => {
    const { events, frame, dm } = mirroring();

    dm.change();
    dm.tick(1000);
    dm.change();
    dm.tick(2000);
    expect(events).toEqual(['render:dm', 'render:dm']);

    events.length = 0;
    frame(2010);
    dm.tick(2011);
    expect(events).toEqual(MIRRORED);
  });

  it('stops listening when stopped', () => {
    const { mirror, events, dm } = mirroring();

    mirror.stop();
    dm.change();
    dm.tick(100);

    expect(events).toEqual(['render:dm']);
  });
});

describe('PlayerFrameMirror on a canvas without a render schedule', () => {
  it('captures every display frame and restores the DM frame itself', () => {
    const { events, frame, dm, state, onFrame } = setup();
    state.source = { canvas: dm.source.canvas, withPlayerSafeFrame: dm.source.withPlayerSafeFrame };

    frame(0);
    frame(8);

    expect(events).toEqual([...MIRRORED, ...MIRRORED]);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });
});
