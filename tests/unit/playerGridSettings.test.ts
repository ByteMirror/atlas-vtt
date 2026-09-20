import { expect, it } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';

it('keeps a hidden map grid available for a player capture without enabling it for the DM', () => {
  const viewport = new Container();
  const background = new Sprite(Texture.WHITE); background.width = 500; background.height = 500;
  viewport.addChild(background);
  const grid = new GridSystem({} as any, viewport as any, background, { size: 70, enabled: false });
  try {
    const sprite = grid.getGridSprite();
    expect(sprite).not.toBeNull();
    expect(sprite!.visible).toBe(false);
    captureWithLayerVisibility([{ layer: sprite!, visible: true }], () => {}, () => {
      expect(sprite!.visible).toBe(true);
      expect(grid.getOptions().enabled).toBe(false);
    });
    expect(sprite!.visible).toBe(false);
  } finally { grid.destroy(); }
});
