import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { playerLightingLayers, tokenSeenPredicate, type GmOverlays } from '../playerLightingLayers';
import { hiddenTokenLayers } from '../../playerSafeFrame';
import { computeSight } from '../../../vision/sight';
import type { TokenEntity } from '../../../types';

describe('playerLightingLayers', () => {
  function overlays(): GmOverlays {
    return { wallEditor: new Container(), doorBadges: new Container(), lightMarkers: new Container() };
  }

  it('switches the lighting to the player view and hides every GM overlay, light markers included', () => {
    const modeLayer = { visible: false };
    const gm = overlays();
    expect(playerLightingLayers({ enabled: true, modeLayer, gmOverlays: gm })).toEqual([
      { layer: modeLayer, visible: true },
      { layer: gm.wallEditor, visible: false },
      { layer: gm.doorBadges, visible: false },
      { layer: gm.lightMarkers, visible: false },
    ]);
  });

  it('still hides the GM overlays while the scene has no lighting', () => {
    const gm = overlays();
    expect(playerLightingLayers({ enabled: false, modeLayer: { visible: false }, gmOverlays: gm })).toEqual([
      { layer: gm.wallEditor, visible: false },
      { layer: gm.doorBadges, visible: false },
      { layer: gm.lightMarkers, visible: false },
    ]);
  });
});

describe('tokenSeenPredicate', () => {
  const tokens: Record<string, TokenEntity> = {
    hero: { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true } },
    lurker: { id: 'lurker', kind: 'token', imagePath: 'l.png', x: 400, y: 100 },
  };
  const wall = { id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };
  const sight = computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, darkvision: 0 }], [wall]);

  it('hides tokens out of sight, even in daylight', () => {
    const isSeen = tokenSeenPredicate(sight, { ambient: 1 }, [], tokens);
    expect(isSeen('hero')).toBe(true);
    expect(isSeen('lurker')).toBe(false);
  });

  it('always shows the tokens that see, even in the dark', () => {
    expect(tokenSeenPredicate(sight, { ambient: 0 }, [], tokens)('hero')).toBe(true);
  });

  it('hides tokens in sight while the ambient light is below the scene\'s threshold', () => {
    const inSight = { ...tokens, guard: { id: 'guard', kind: 'token' as const, imagePath: 'g.png', x: 150, y: 150 } };
    expect(tokenSeenPredicate(sight, { ambient: 0.5 }, [], inSight)('guard')).toBe(true);
    expect(tokenSeenPredicate(sight, { ambient: 0.5, litThreshold: 0.75 }, [], inSight)('guard')).toBe(false);
  });

  it('treats unknown tokens as unseen', () => {
    expect(tokenSeenPredicate(sight, { ambient: 1 }, [], tokens)('missing')).toBe(false);
  });
});

describe('tokenSeenPredicate with tremorsense', () => {
  const wall = { id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };
  const tokens: Record<string, TokenEntity> = {
    hero: { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, tremorsense: 30 } },
    near: { id: 'near', kind: 'token', imagePath: 'n.png', x: 300, y: 100 },
    far: { id: 'far', kind: 'token', imagePath: 'f.png', x: 600, y: 100 },
  };
  const hero = { tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, darkvision: 0 };
  const sight = computeSight([{ ...hero, tremorsense: 300 }], [wall]);

  it('senses tokens within range through walls, even in the dark', () => {
    expect(tokenSeenPredicate(sight, { ambient: 1 }, [], tokens)('near')).toBe(true);
    expect(tokenSeenPredicate(sight, { ambient: 0 }, [], tokens)('near')).toBe(true);
  });

  it('does not sense tokens out of range', () => {
    expect(tokenSeenPredicate(sight, { ambient: 1 }, [], tokens)('far')).toBe(false);
  });

  it('leaves the sight polygon as it is', () => {
    expect(sight.polygons).toEqual(computeSight([hero], [wall]).polygons);
  });
});

describe('hiddenTokenLayers with a seen predicate', () => {
  it('hides unseen tokens as well as hidden ones', () => {
    const [a, b, c] = [new Container(), new Container(), new Container()];
    const layers = hiddenTokenLayers({ a: { isHidden: true }, b: {}, c: {} }, { a, b, c }, (id) => id !== 'b');
    expect(layers).toEqual([{ layer: a, visible: false }, { layer: b, visible: false }]);
  });
});
