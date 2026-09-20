import { Container, Graphics } from 'pixi.js';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';

/**
 * Renders small condition-indicator dots in a horizontal row between
 * the nameplate and the HP bar.
 */
export class ConditionDotsRenderer {
  readonly container = new Container();
  private dots: Graphics[] = [];
  private static readonly MAX_VISIBLE = 5;
  private static readonly BADGE_RADIUS = 3;

  /** Center-to-center spacing between dots. */
  private static readonly DOT_SPACING = 8;

  constructor() {
    this.container.eventMode = 'none';
  }

  /** Rebuild the dot graphics for the given active conditions. */
  update(
    activeConditionIds: string[],
    conditionDefs: ConditionDefinition[],
    centerY: number,
  ): void {
    this.clear();

    if (activeConditionIds.length === 0) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    const active = activeConditionIds
      .map(id => conditionDefs.find(d => d.id === id))
      .filter((d): d is ConditionDefinition => d !== undefined);

    if (active.length === 0) {
      this.container.visible = false;
      return;
    }

    const r = ConditionDotsRenderer.BADGE_RADIUS;
    const maxVis = ConditionDotsRenderer.MAX_VISIBLE;
    const spacing = ConditionDotsRenderer.DOT_SPACING;

    const visibleCount = Math.min(active.length, maxVis);
    const hasOverflow = active.length > maxVis;
    const totalSlots = hasOverflow ? visibleCount + 1 : visibleCount;

    // Distribute horizontally, centered at x=0
    const totalWidth = (totalSlots - 1) * spacing;
    const startX = -totalWidth / 2;

    for (let i = 0; i < visibleCount; i++) {
      const cond = active[i];
      if (!cond) continue;
      const color = parseInt(cond.color.replace('#', ''), 16);
      const badge = this.createBadge(r, color);
      badge.position.set(startX + i * spacing, centerY);
      this.container.addChild(badge);
      this.dots.push(badge);
    }

    // Overflow indicator
    if (hasOverflow) {
      const badge = this.createBadge(r, 0x888888);
      badge.position.set(startX + visibleCount * spacing, centerY);
      this.container.addChild(badge);
      this.dots.push(badge);
    }
  }

  /** Build a single dot: dark bezel + colored fill, fully opaque. */
  private createBadge(radius: number, color: number): Graphics {
    const g = new Graphics();
    g.eventMode = 'none';

    // Dark bezel ring
    g.circle(0, 0, radius + 1).fill({ color: 0x1a1a1a, alpha: 1 });
    g.circle(0, 0, radius + 1).stroke({ width: 0.75, color: 0x555555, alpha: 1 });

    // Colored fill
    g.circle(0, 0, radius).fill({ color, alpha: 1 });

    // Inner edge for depth
    g.circle(0, 0, radius).stroke({ width: 0.75, color: 0x000000, alpha: 1 });

    return g;
  }

  clear(): void {
    for (const dot of this.dots) dot.destroy();
    this.dots = [];
    this.container.removeChildren();
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  destroy(): void {
    this.clear();
    this.container.destroy();
  }
}
