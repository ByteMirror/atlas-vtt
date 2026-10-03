import { describe, expect, it, vi } from 'vitest';
import type { GmOverlays } from '../../src/app/pixi/lighting/playerLightingLayers';
import type { SceneFrame } from '../../src/app/pixi/lighting/engine/types';
import { gmTokenLayers } from '../../src/app/pixi/playerSafeFrame';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';

const FRAME: SceneFrame = { x: 300, y: 200, resolution: 0.5 };

function setup(wallEditorShown = true) {
  const pins = { visible: true };
  const hexLinks = { visible: true };
  const gmOverlays: GmOverlays = { wallEditor: { visible: wallEditorShown }, doorBadges: { visible: true }, lightMarkers: { visible: true }, rangeRings: { visible: true }, sightAids: { visible: true } };
  const layers = [pins, hexLinks, gmOverlays.wallEditor, gmOverlays.doorBadges, gmOverlays.lightMarkers, gmOverlays.rangeRings, gmOverlays.sightAids];
  const shown = (): boolean[] => layers.map((layer) => layer.visible);
  const markerLayers = [{ layer: pins, visible: false }, { layer: hexLinks, visible: false }];
  const renderForFrame = vi.fn(<T,>(_frame: SceneFrame, render: () => T): T => render());
  const lighting = { gmOverlays: () => gmOverlays, renderer: { renderForFrame } };
  return { markerLayers, lighting, renderForFrame, shown };
}

describe('captureSceneFrame', () => {
  it('renders without the GM markers and overlays (range rings included), lit for the frame, and has them back afterwards', () => {
    const { markerLayers, lighting, renderForFrame, shown } = setup();
    const picture = captureSceneFrame({ gmViewLayers: [], markerLayers, lighting }, FRAME, () => shown());
    expect(picture).toEqual([false, false, false, false, false, false, false]);
    expect(renderForFrame).toHaveBeenCalledWith(FRAME, expect.any(Function));
    expect(shown()).toEqual([true, true, true, true, true, true, true]);
  });

  it('leaves a layer hidden that was hidden before, such as the wall editor without its tool', () => {
    const { markerLayers, lighting, shown } = setup(false);
    captureSceneFrame({ gmViewLayers: [], markerLayers, lighting }, FRAME, () => undefined);
    expect(shown()).toEqual([true, true, false, true, true, true, true]);
  });

  it('has the layers back when the render throws', () => {
    const { markerLayers, lighting, shown } = setup();
    expect(() => captureSceneFrame({ gmViewLayers: [], markerLayers, lighting }, FRAME, () => { throw new Error('Render failed'); })).toThrow('Render failed');
    expect(shown()).toEqual([true, true, true, true, true, true, true]);
  });

  it('renders a view without lighting as it is, without its markers', () => {
    const { markerLayers, shown } = setup();
    const picture = captureSceneFrame({ gmViewLayers: [], markerLayers, lighting: undefined }, FRAME, () => shown().slice(0, 2));
    expect(picture).toEqual([false, false]);
    expect(shown().slice(0, 2)).toEqual([true, true]);
  });

  it('leaves out the door badges only the players\' view shows, which session view has on the canvas, and puts them back', () => {
    const { markerLayers, lighting } = setup();
    const playerDoorBadges = { visible: true };
    const picture = captureSceneFrame({ gmViewLayers: [], markerLayers, lighting: { ...lighting, playerOnlyLayers: () => [playerDoorBadges] } }, FRAME, () => playerDoorBadges.visible);
    expect(picture).toBe(false);
    expect(playerDoorBadges.visible).toBe(true);
  });

  it('returns the result of a render with nothing to hide', () => {
    expect(captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: undefined }, FRAME, () => 'picture')).toBe('picture');
  });

  it('shows tokens as the GM view does while the canvas is in session view, and puts the canvas back', () => {
    // Session view: the hidden ghost and the orc out of the players' sight are off the canvas
    const sprites = { hero: { visible: true, alpha: 1 }, ghost: { visible: false, alpha: 1 }, orc: { visible: false, alpha: 1 }, gone: null };
    const tokens = { hero: {}, ghost: { isHidden: true }, orc: {} };
    const look = (): unknown => ({ hero: { ...sprites.hero }, ghost: { ...sprites.ghost }, orc: { ...sprites.orc } });
    const onCanvas = look();

    const picture = captureSceneFrame({ gmViewLayers: gmTokenLayers(tokens, sprites), markerLayers: [], lighting: undefined }, FRAME, look);
    expect(picture).toEqual({ hero: { visible: true, alpha: 1 }, ghost: { visible: true, alpha: 0.5 }, orc: { visible: true, alpha: 1 } });
    expect(look()).toEqual(onCanvas);
  });

  it('changes nothing for tokens while the canvas is in GM view', () => {
    const sprites = { hero: { visible: true, alpha: 1 }, ghost: { visible: true, alpha: 0.5 } };
    const writes: string[] = [];
    const watched = Object.fromEntries(Object.entries(sprites).map(([id, sprite]) => [id, new Proxy(sprite, {
      set: (target, key, value) => (writes.push(`${id}.${String(key)}`), Reflect.set(target, key, value)),
    })]));
    captureSceneFrame({ gmViewLayers: gmTokenLayers({ hero: {}, ghost: { isHidden: true } }, watched), markerLayers: [], lighting: undefined }, FRAME, () => undefined);
    expect(writes).toEqual([]);
  });
});
