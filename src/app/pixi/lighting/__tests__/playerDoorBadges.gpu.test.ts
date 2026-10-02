import { Sprite, Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WallSegment } from '../../../types/wallTypes';
import { copiedPixel } from '../engine/__tests__/gpuTestUtils';
import { captureWithLayerVisibility } from '../../playerSafeFrame';
import { DoorIcons } from '../DoorIcons';
import { playerDoorSight, playerLightingLayers } from '../playerLightingLayers';
import { SIZE, visionToken } from './rendererHarness';
import { createScene, type SavedScene, type Scene } from './sceneLightingHarness';

vi.mock('obsidian', () => ({ Notice: class {} }));

const door = (id: string, type: WallSegment['type'], x1: number, y1: number, x2: number, y2: number): WallSegment =>
  ({ id, kind: 'wall', type, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, closed: true });

/**
 * Daylight; the token at (60, 128) sees 70 px around it. `seen` and `secret` are within that,
 * `unseen` is beyond it. Each constant is the middle of its door, where its badge is.
 */
type Point = readonly [number, number];
const SEEN: Point = [100, 128];
const UNSEEN: Point = [220, 128];
const SECRET: Point = [60, 176];
const HALL = {
  lighting: { enabled: true, ambient: 1 },
  objects: {
    walls: { seen: door('seen', 'door', 100, 108, 100, 148), unseen: door('unseen', 'door', 220, 108, 220, 148), secret: door('secret', 'secret-door', 40, 176, 80, 176) },
    lights: {},
    tokens: { t: visionToken(60, 128, 5) },
  },
  exploredMask: null,
} as unknown as SavedScene;

/** A badge is read on the left leaf of its glyph, which is solid in a closed door's: this far from its middle, on the token's side of every door. */
const LEAF: Point = [-4, -3];
/** The leaf in a closed door's badge, and in a secret door's as the GM sees it. */
const DOOR_BLUE = [68, 170, 255];
const SECRET_ORANGE = [255, 136, 68];
const BLACK = [0, 0, 0];

describe('door badges in the players\' frame', () => {
  let scene: Scene;
  let doors: DoorIcons;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    scene = await createScene({ enabled: true, onSightChange: () => doors?.refreshPlayers() });
    const { renderer, viewport, host, store } = scene;
    const map = new Sprite(Texture.WHITE);
    map.setSize(SIZE, SIZE);
    viewport.addChildAt(map, 0);
    doors = new DoorIcons(store, renderer.canvas as HTMLCanvasElement, () => playerDoorSight(host, store.getState().objects.walls));
    viewport.addChild(doors.view, doors.playerView);
    scene.loadMap('maps/hall.atlasmap', HALL, { width: SIZE, height: SIZE });
    scene.tick();
  });

  afterEach(() => {
    doors.destroy();
    scene.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  type Frame = (point: Point) => number[];

  /** What the canvas shows in the badges of the three doors, read in the task that rendered it. */
  function atDoors(): Frame {
    const canvas = scene.renderer.canvas as HTMLCanvasElement;
    const pixels = new Map([SEEN, UNSEEN, SECRET].map((point) => [point, copiedPixel(canvas, point[0] + LEAF[0], point[1] + LEAF[1])]));
    return (point) => pixels.get(point) ?? [];
  }

  function gmFrame(): Frame {
    scene.renderer.render({ container: scene.viewport });
    return atDoors();
  }

  /** A frame as the map view captures it for the player window: the players' lighting layers for one render. */
  function playerFrame(): Frame {
    const { renderer, viewport, host } = scene;
    const gmOverlay = { visible: true };
    let frame: Frame = () => [];
    captureWithLayerVisibility(
      playerLightingLayers({
        enabled: host.isEnabled(),
        modeLayer: host.modeLayer,
        gmOverlays: { wallEditor: gmOverlay, lightZones: gmOverlay, exploredMemory: gmOverlay, doorBadges: doors.view, lightMarkers: gmOverlay, rangeRings: gmOverlay, sightAids: gmOverlay },
        playerDoorBadges: doors.playerView,
      }),
      () => renderer.render({ container: viewport }),
      () => { frame = atDoors(); },
    );
    return frame;
  }

  it('shows a badge on the door the party sees and none on a door out of sight or a secret door', () => {
    const players = playerFrame();
    expect(players(SEEN)).toEqual(DOOR_BLUE);
    expect(players(UNSEEN)).toEqual(BLACK);
    // The secret door is in sight: the players see the floor there, and no badge.
    expect(Math.min(...players(SECRET))).toBeGreaterThan(200);
  });

  it('gives the GM every badge back after the capture, the secret door\'s in its own colour', () => {
    playerFrame();
    expect([doors.view.visible, doors.playerView.visible]).toEqual([true, false]);
    const gm = gmFrame();
    expect(gm(SEEN)).toEqual(DOOR_BLUE);
    expect(gm(UNSEEN)).toEqual(DOOR_BLUE);
    expect(gm(SECRET)).toEqual(SECRET_ORANGE);
  });

  it('shows the door a token comes to see while it is dragged, and drops the one it leaves behind', () => {
    scene.moveToken(180, 128);
    scene.tick();
    const players = playerFrame();
    expect(players(UNSEEN)).toEqual(DOOR_BLUE);
    expect(players(SEEN)).not.toEqual(DOOR_BLUE);
  });
});
