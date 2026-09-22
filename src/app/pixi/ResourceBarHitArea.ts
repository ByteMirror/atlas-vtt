import { Graphics } from 'pixi.js';
import { barDimensions } from '../styles/designTokens';

/** Clickable overlay on a token resource bar that lights up on hover and while its editor is open. */
export class ResourceBarHitArea extends Graphics {
  private barTop = 0;
  private hovered = false;
  private active = false;

  constructor(private readonly accent: number) {
    super();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.visible = false;
    this.on('pointerover', () => this.setHovered(true));
    this.on('pointerout', () => this.setHovered(false));
  }

  /** Places the overlay on a bar whose top edge sits at `barTop` in bar-local units. */
  layout(barTop: number): void {
    this.barTop = barTop;
    this.visible = true;
    this.redraw();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.redraw();
  }

  hide(): void {
    this.visible = false;
    this.hovered = false;
    this.active = false;
  }

  private setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.redraw();
  }

  private redraw(): void {
    if (this.destroyed) return;
    const { width, height } = barDimensions.token;
    const radius = height / 2;
    this.clear();
    this.roundRect(-width / 2, this.barTop, width, height, radius)
      .fill({ color: 0xffffff, alpha: this.hovered && !this.active ? 0.14 : 0 });
    if (!this.hovered && !this.active) return;
    const inset = 1;
    this.roundRect(-width / 2 - inset, this.barTop - inset, width + inset * 2, height + inset * 2, radius + inset)
      .stroke({ width: 1, color: this.active ? this.accent : 0xffffff, alpha: this.active ? 1 : 0.7 });
  }
}
