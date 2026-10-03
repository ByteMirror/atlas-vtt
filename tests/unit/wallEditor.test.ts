import { EventEmitter } from 'events';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import { WallEditor } from '../../src/app/pixi/lighting/WallEditor';
import type { LightPresetDefinition } from '../../src/app/types/lightPresetTypes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

// The lights as a map on a 5-foot grid offers them.
const onMap = (presets: readonly LightPresetDefinition[]): LightPresetDefinition[] => lightPresetsOnMap(presets, { unitType: 'feet', unitDistance: 5 }, Infinity);
const lights = { current: onMap(GENERIC_LIGHT_PRESETS) as readonly LightPresetDefinition[] };

function setup(): { editor: WallEditor; store: ViewAtlasStore; wall: string; bus: EventEmitter } {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `wall-editor-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setActiveTool('wall');
  const wall = store.getState().addWall({ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 }, closed: true });
  const bus = new EventEmitter();
  const editor = new WallEditor(viewport, store, bus, () => undefined, () => lights.current);
  editor.layer.visible = true;
  cleanup = () => {
    editor.destroy();
    viewport.destroy();
    restoreGraphics();
    lights.current = onMap(GENERIC_LIGHT_PRESETS);
  };
  return { editor, store, wall, bus };
}

describe('WallEditor', () => {
  it('drags a wall handle while its layer shows', () => {
    const { editor, store, wall } = setup();
    expect(editor.pointerDown({ x: 100, y: 100 }, false, false)).toBe(true);
    editor.pointerMove({ x: 140, y: 160 });
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 140, y: 160 });
  });

  // Whoever hides the layer ends what was under way (`afterVisibilityChange`); the editor itself
  // also takes no pointer while hidden, so a drag cannot go on unseen even before that call.
  it('moves nothing from the moment its layer is hidden', () => {
    const { editor, store, wall } = setup();
    editor.pointerDown({ x: 100, y: 100 }, false, false);
    editor.layer.visible = false;
    editor.pointerMove({ x: 140, y: 160 });
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
    expect(editor.pointerDown({ x: 300, y: 100 }, false, false)).toBe(false);
    expect(editor.cursorAt({ x: 100, y: 100 })).toBe('default');
  });

  it('places the light the lighting menu chose, as the map\'s collection defines it', () => {
    const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
    const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!.rules.lightPresets!;
    const { editor, store, bus } = setup();
    const placed = (): unknown[] => Object.values(store.getState().objects.lights).map((light) => light.emission);
    lights.current = onMap(dnd5e);
    bus.emit('wall-submode-changed', 'place-light');
    editor.pointerDown({ x: 500, y: 400 }, false, false);
    expect(placed()).toMatchObject([{ bright: 20, dim: 40, kind: 'torch', preset: 'dnd5e-torch' }]);
    bus.emit('lighting-preset-changed', 'dnd5e-daylight');
    editor.pointerDown({ x: 600, y: 400 }, false, false);
    expect(placed()[1]).toMatchObject({ bright: 60, dim: 120, kind: 'magical', preset: 'dnd5e-daylight' });
    // The collection's game system changed: the light chosen before is no longer one of its lights.
    lights.current = onMap(cairn);
    editor.pointerDown({ x: 700, y: 400 }, false, false);
    expect(placed()[2]).toMatchObject({ bright: 40, dim: 40, preset: 'cairn-torch' });
  });
});
