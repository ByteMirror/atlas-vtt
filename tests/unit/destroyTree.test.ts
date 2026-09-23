import { describe, expect, it } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { destroyTree } from '../../src/app/pixi/utils/destroyTree';

function groupWithGraphics(): { group: Container; graphics: Graphics } {
  const group = new Container();
  const graphics = new Graphics().circle(0, 0, 10).fill(0xffffff);
  group.addChild(new Container()).addChild(graphics);
  return { group, graphics };
}

describe('destroyTree', () => {
  it('frees the geometry of nested Graphics, which destroy({ children: true }) keeps', () => {
    const leaky = groupWithGraphics();
    const leakyContext = leaky.graphics.context;
    leaky.group.destroy({ children: true });
    expect(leakyContext.instructions).not.toBeNull();

    const { group, graphics } = groupWithGraphics();
    const context = graphics.context;
    destroyTree(group);

    expect(graphics.destroyed).toBe(true);
    expect(context.instructions).toBeNull();
  });

  it('removes the node from its parent', () => {
    const parent = new Container();
    const { group } = groupWithGraphics();
    parent.addChild(group);

    destroyTree(group);

    expect(parent.children).toHaveLength(0);
  });

  it('keeps shared textures unless asked to destroy them', () => {
    const shared = new Texture();
    destroyTree(new Container().addChild(new Sprite(shared)).parent!);
    expect(shared.destroyed).toBe(false);

    const owned = new Texture();
    const group = new Container();
    group.addChild(new Sprite(owned));
    destroyTree(group, { textures: true });
    expect(owned.destroyed).toBe(true);
  });
});
