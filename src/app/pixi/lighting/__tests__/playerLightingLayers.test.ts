import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { playerLightingLayers, tokenSeenPredicate } from '../playerLightingLayers';
import { hiddenTokenLayers } from '../../playerSafeFrame';
import { computeSight } from '../../../vision/sight';
import type { TokenEntity } from '../../../types';

describe('playerLightingLayers', () => {
  it('switches the lighting to the player view and hides every GM overlay', () => {
    const modeLayer = { visible: false };
    const walls = new Container();
    const doors = new Container();
    expect(playerLightingLayers({ enabled: true, modeLayer, gmOverlays: [walls, doors] })).toEqual([
      { layer: modeLayer, visible: true },
      { layer: walls, visible: false },
      { layer: doors, visible: false },
    ]);
  });

  it('changes nothing while the scene has no lighting', () => {
    expect(playerLightingLayers({ enabled: false, modeLayer: { visible: false }, gmOverlays: [new Container()] })).toEqual([]);
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
    const isSeen = tokenSeenPredicate(sight, 1, [], tokens);
    expect(isSeen('hero')).toBe(true);
    expect(isSeen('lurker')).toBe(false);
  });

  it('treats unknown tokens as unseen', () => {
    expect(tokenSeenPredicate(sight, 1, [], tokens)('missing')).toBe(false);
  });
});

describe('hiddenTokenLayers with a seen predicate', () => {
  it('hides unseen tokens as well as hidden ones', () => {
    const [a, b, c] = [new Container(), new Container(), new Container()];
    const layers = hiddenTokenLayers({ a: { isHidden: true }, b: {}, c: {} }, { a, b, c }, (id) => id !== 'b');
    expect(layers).toEqual([{ layer: a, visible: false }, { layer: b, visible: false }]);
  });
});
