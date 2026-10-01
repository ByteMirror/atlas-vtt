import { afterEach, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

it('builds a cell-numbers container with one label per cell on a square grid', () => {
  restoreGraphics = stubJsdomGraphics();
  const viewport = new Container();
  const background = new Sprite(Texture.WHITE); background.width = 200; background.height = 200;
  viewport.addChild(background);
  const app = { renderer: { resolution: 1 } } as any;
  const grid = new GridSystem(app, viewport as any, background, {
    type: 'square',
    size: 100,
    cellNumbers: { format: 'column-row', opacity: 0.8 },
  });
  try {
    const sprite = grid.getGridSprite();
    const numbers = sprite!.children.find((child) => child.label === 'cell-numbers');
    expect(numbers).toBeDefined();
    expect(numbers!.children).toHaveLength(4);
  } finally { grid.destroy(); }
});
