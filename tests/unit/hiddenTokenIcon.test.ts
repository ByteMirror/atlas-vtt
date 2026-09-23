import { describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { HiddenTokenIcon } from '../../src/app/pixi/token-renderer/HiddenTokenIcon';
import { createLucideIconTexture } from '../../src/app/pixi/utils/lucideIconTexture';

// jsdom has no 2D canvas, so the SVG rasteriser cannot run here.
vi.mock('../../src/app/pixi/utils/lucideIconTexture', () => ({
  createLucideIconTexture: vi.fn(async () => new Texture()),
}));

function tokenGroup(): Container {
  const group = new Container();
  const sprite = new Sprite({ texture: Texture.WHITE, label: 'tokenSprite' });
  sprite.setSize(70, 70);
  group.addChild(sprite);
  return group;
}

const marker = (group: Container): Container | null => group.getChildByLabel('hiddenIcon');

describe('HiddenTokenIcon', () => {
  it('shares one eye-off texture across all hidden tokens', async () => {
    const icon = new HiddenTokenIcon();
    const first = tokenGroup();
    const second = tokenGroup();

    icon.update(first, true);
    icon.update(second, true);
    await vi.waitFor(() => expect(marker(second)?.children).toHaveLength(2));

    const eye = (group: Container): Sprite => marker(group)!.children[1] as Sprite;
    expect(eye(first).texture).toBe(eye(second).texture);
    expect(createLucideIconTexture).toHaveBeenCalledTimes(1);
  });

  it('never stacks a second marker when updates repeat before the texture loads', () => {
    const icon = new HiddenTokenIcon();
    const group = tokenGroup();

    icon.update(group, true);
    icon.update(group, true);

    expect(group.children.filter((child) => child.label === 'hiddenIcon')).toHaveLength(1);
  });

  it('destroys the marker when the token is revealed', () => {
    const icon = new HiddenTokenIcon();
    const group = tokenGroup();
    icon.update(group, true);
    const shown = marker(group)!;

    icon.update(group, false);

    expect(marker(group)).toBeNull();
    expect(shown.destroyed).toBe(true);
  });
});
