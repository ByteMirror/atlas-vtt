import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';

function makeScene(): { viewport: Container; background: Graphics; tokens: Container; view: DragRulerView } {
  const viewport = new Container();
  viewport.sortableChildren = true;
  const background = new Graphics();
  const tokens = new Container();
  viewport.addChild(background, tokens);
  const view = new DragRulerView(viewport as unknown as Viewport, tokens);
  return { viewport, background, tokens, view };
}

describe('DragRulerView', () => {
  it('draws the path between the map and the tokens and the label above them', () => {
    const { viewport, background, tokens, view } = makeScene();
    const [path, label] = view.layers as Container[];
    viewport.sortChildren();

    expect(viewport.getChildIndex(path!)).toBeGreaterThan(viewport.getChildIndex(background));
    expect(viewport.getChildIndex(path!)).toBeLessThan(viewport.getChildIndex(tokens));
    expect(label!.zIndex).toBeGreaterThan(tokens.zIndex);
  });

  it('stays hidden until a drag draws it', () => {
    const { view } = makeScene();
    expect(view.layers.every(layer => !layer.visible)).toBe(true);
  });
});
