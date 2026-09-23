import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { createLucideIconTexture } from '../utils/lucideIconTexture';
import { destroyTree } from '../utils/destroyTree';

const HIDDEN_ICON_LABEL = 'hiddenIcon';
/** Inner markup of Lucide's `eye-off` icon. */
const EYE_OFF_SVG = [
  '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>',
  '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>',
  '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>',
  '<path d="m2 2 20 20"/>',
].join('');
/** Rasterised large enough to stay sharp on big tokens and high-density screens. */
const ICON_TEXTURE_SIZE = 192;

/**
 * The "hidden from players" marker drawn on tokens the DM has hidden.
 * Every marker shares one eye-off texture, created on first use and destroyed with the renderer.
 */
export class HiddenTokenIcon {
  private texture: Promise<Texture> | null = null;

  /** Adds the marker to `tokenGroup` when `isHidden`, removes it otherwise. */
  public update(tokenGroup: Container, isHidden: boolean): void {
    const existing = tokenGroup.getChildByLabel(HIDDEN_ICON_LABEL);
    if (!isHidden) {
      if (existing) destroyTree(existing);
      return;
    }
    const sprite = tokenGroup.getChildByLabel('tokenSprite');
    if (existing || !sprite) return;

    const iconSize = Math.min(40, sprite.width * 0.5);
    const marker = new Container({ label: HIDDEN_ICON_LABEL, zIndex: 10, eventMode: 'none', interactiveChildren: false });
    const background = new Graphics()
      .circle(0, 0, iconSize / 2)
      .fill({ color: 0x000000, alpha: 0.8 })
      .stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    background.eventMode = 'none';
    marker.addChild(background);
    // Added before the texture resolves, so repeated updates never stack a second marker
    tokenGroup.addChild(marker);
    tokenGroup.sortChildren();

    this.getTexture().then(
      (texture) => {
        if (!marker.destroyed) marker.addChild(createEyeSprite(texture, iconSize));
      },
      (error: unknown) => {
        console.error('[HiddenTokenIcon] Failed to load eye-off icon:', error);
        if (!marker.destroyed) marker.addChild(createCrossFallback(iconSize));
      },
    );
  }

  public destroy(): void {
    this.texture?.then((texture) => texture.destroy(true), () => undefined);
    this.texture = null;
  }

  private getTexture(): Promise<Texture> {
    this.texture ??= createLucideIconTexture(EYE_OFF_SVG, 'white', ICON_TEXTURE_SIZE);
    return this.texture;
  }
}

function createEyeSprite(texture: Texture, iconSize: number): Sprite {
  const eye = new Sprite({ texture, anchor: 0.5, eventMode: 'none' });
  eye.scale.set((iconSize * 0.7) / ICON_TEXTURE_SIZE);
  return eye;
}

function createCrossFallback(iconSize: number): Graphics {
  const arm = iconSize * 0.3;
  const cross = new Graphics()
    .moveTo(-arm, -arm)
    .lineTo(arm, arm)
    .moveTo(-arm, arm)
    .lineTo(arm, -arm)
    .stroke({ width: 3, color: 0xffffff, alpha: 1 });
  cross.eventMode = 'none';
  return cross;
}
