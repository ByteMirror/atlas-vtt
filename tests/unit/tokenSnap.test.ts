import { describe, expect, it } from 'vitest';
import { resizeTokenCentre, snapTokenToGrid } from '../../src/app/grid/tokenSnap';
import { cellToWorld, worldToCell } from '../../src/app/encounters/encounterFormation';
import { createHexLayout, axialToPixel } from '../../src/app/grid/hexGeometry';
import { computeTokenPixelSize, tokenDiameterInCells } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { GridState } from '../../src/app/services/MapPersistence';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const CELL = 70;
const SQUARE = { type: 'square', size: CELL, offsetX: 0, offsetY: 0 };

/** Distance from the token's centre to the nearest grid line, along one axis. */
function offGrid(centre: number, sizeInCells: number): number {
  const half = (tokenDiameterInCells(sizeInCells) * CELL) / 2;
  const edge = centre - half;
  return Math.abs(edge / CELL - Math.round(edge / CELL));
}

describe('snapTokenToGrid', () => {
  it('keeps an odd footprint on a cell centre', () => {
    expect(snapTokenToGrid(SQUARE, { x: 123, y: 99 }, 1)).toEqual({ x: 105, y: 105 });
    expect(snapTokenToGrid(SQUARE, { x: 123, y: 99 }, 2)).toEqual({ x: 105, y: 105 });
  });

  it('rests an even footprint on the lines between cells', () => {
    expect(snapTokenToGrid(SQUARE, { x: 123, y: 99 }, 1.5)).toEqual({ x: 140, y: 70 });
    expect(snapTokenToGrid(SQUARE, { x: 123, y: 99 }, 2.5)).toEqual({ x: 140, y: 70 });
  });

  it.each([1, 1.5, 2, 2.5, 3])('covers whole cells at size %s', (size) => {
    const snapped = snapTokenToGrid(SQUARE, { x: 517.3, y: -84.2 }, size);
    expect(offGrid(snapped.x, size)).toBeCloseTo(0, 9);
    expect(offGrid(snapped.y, size)).toBeCloseTo(0, 9);
  });

  it('follows the grid offset', () => {
    const grid = { ...SQUARE, offsetX: 12, offsetY: -5 };
    expect(snapTokenToGrid(grid, { x: 12 + 123, y: -5 + 99 }, 1.5)).toEqual({ x: 12 + 140, y: -5 + 70 });
  });

  it('defaults to a size-1 footprint and leaves unusable grids alone', () => {
    expect(snapTokenToGrid(SQUARE, { x: 123, y: 99 })).toEqual({ x: 105, y: 105 });
    expect(snapTokenToGrid({ ...SQUARE, size: 0 }, { x: 123, y: 99 }, 1.5)).toEqual({ x: 123, y: 99 });
  });

  it('keeps a 1×1 token in the cell it is in, including on a grid line', () => {
    expect(snapTokenToGrid(SQUARE, { x: 2 * CELL, y: 2 * CELL })).toEqual({ x: 2.5 * CELL, y: 2.5 * CELL });
  });

  it.each([1, 1.5, 2, 2.5])('survives the round trip through a formation cell at size %s', (size) => {
    const grid = { type: 'square' as const, size: CELL, offsetX: 0, offsetY: 0 };
    const placed = snapTokenToGrid(grid, { x: 517.3, y: -84.2 }, size);
    // An encounter records the cell a token stands in and replays it as that cell's centre.
    const replayed = cellToWorld(grid, worldToCell(grid, placed));
    expect(snapTokenToGrid(grid, replayed, size)).toEqual(placed);
  });

  it.each(['hex-vertical', 'hex-horizontal'])('keeps every footprint on a hex centre (%s)', (type) => {
    const grid = { type, size: CELL, offsetX: 10, offsetY: 20 };
    const target = axialToPixel(createHexLayout(type as 'hex-vertical', CELL, 10, 20), { q: 2, r: -1 });
    const snapped = snapTokenToGrid(grid, { x: target.x + 8, y: target.y - 6 }, 1.5);
    expect(snapped.x).toBeCloseTo(target.x, 9);
    expect(snapped.y).toBeCloseTo(target.y, 9);
  });
});

describe('resizeTokenCentre', () => {
  it('keeps the cell the footprint starts in, growing and shrinking towards the lower right', () => {
    expect(resizeTokenCentre(SQUARE, { x: 105, y: 105 }, 1, 1.5)).toEqual({ x: 140, y: 140 });
    expect(resizeTokenCentre(SQUARE, { x: 105, y: 105 }, 1, 2)).toEqual({ x: 175, y: 175 });
    expect(resizeTokenCentre(SQUARE, { x: 140, y: 140 }, 1.5, 1)).toEqual({ x: 105, y: 105 });
    expect(resizeTokenCentre(SQUARE, { x: 175, y: 175 }, 2, 2.5)).toEqual({ x: 210, y: 210 });
  });

  it('undoes itself, so a token resized back and forth returns to where it was', () => {
    const start = { x: 105, y: 35 };
    const grown = resizeTokenCentre(SQUARE, start, 1, 2.5);
    expect(resizeTokenCentre(SQUARE, grown, 2.5, 1)).toEqual(start);
  });
});

describe('a resized token', () => {
  const grid: GridState = { enabled: true, snapToGrid: true, type: 'square', size: CELL, offsetX: 0, offsetY: 0, opacity: 1 };

  function createStore(token: Partial<Character> = {}) {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `snap-${Math.random()}`);
    const t1: Character = { id: 't1', kind: 'character', name: 't1', imagePath: 't1.png', x: 105, y: 105, ...token };
    store.setState({
      persistenceEnabled: false,
      grid,
      objects: { ...store.getState().objects, tokens: { t1 } },
    });
    return store;
  }

  it('moves onto the lines between cells when it grows to 2×2', () => {
    const store = createStore();
    store.getState().updateToken('t1', { size: 1.5 });
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 140, y: 140, size: 1.5 });
  });

  it('returns to the cell it grew out of when it shrinks back to 1×1', () => {
    const store = createStore({ x: 140, y: 140, size: 1.5 });
    store.getState().updateTokens([{ id: 't1', changes: { size: 1 } }]);
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 105, y: 105 });
  });

  it('stays put when snapping is off, when only other fields change, and when the update moves it', () => {
    const unsnapped = createStore();
    unsnapped.setState({ grid: { ...grid, snapToGrid: false } });
    unsnapped.getState().updateToken('t1', { size: 1.5 });
    expect(unsnapped.getState().objects.tokens.t1).toMatchObject({ x: 105, y: 105 });

    const renamed = createStore();
    renamed.getState().updateToken('t1', { name: 'Ogre' });
    expect(renamed.getState().objects.tokens.t1).toMatchObject({ x: 105, y: 105 });

    const moved = createStore();
    moved.getState().updateToken('t1', { size: 1.5, x: 7, y: 9 });
    expect(moved.getState().objects.tokens.t1).toMatchObject({ x: 7, y: 9 });
  });
});

describe('token footprints', () => {
  it('names the even footprints that need to rest between cells', () => {
    expect(tokenDiameterInCells(1)).toBe(1);
    expect(tokenDiameterInCells(1.5)).toBe(2);
    expect(tokenDiameterInCells(2)).toBe(3);
    expect(tokenDiameterInCells(2.5)).toBe(4);
  });

  it('draws a 2×2 token two cells wide', () => {
    expect(computeTokenPixelSize(CELL, 1.5)).toBe(computeTokenPixelSize(CELL, 1) * 2);
  });
});
