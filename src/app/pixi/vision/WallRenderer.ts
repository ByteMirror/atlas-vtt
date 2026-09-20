// src/app/pixi/vision/WallRenderer.ts

import { Graphics, Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { WallSegment, LightSource } from '../../types/wallTypes';
import { WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';
import { cssColorToHexNumber } from '../utils/colorUtils';

const VERTEX_HANDLE_RADIUS = 4;
const LIGHT_ICON_RADIUS = 14;
const HIT_TOLERANCE = 6;

/**
 * Renders GM-only wall editor visuals: wall lines, door icons,
 * light source icons, vertex handles, and selection highlights.
 * Only visible when wall tool is active or GM is peeking.
 */
export class WallRenderer {
  private container: Container;
  private wallGraphics: Graphics;
  private handleGraphics: Graphics;
  private lightGraphics: Graphics;
  private previewGraphics: Graphics;
  private store: StoreApi<ViewAtlasState>;
  private selectedWallIds: Set<string> = new Set();
  private selectedLightIds: Set<string> = new Set();
  private _unsubscribe?: () => void;

  /** Live preview state: anchor point + current cursor position */
  private previewAnchor: { x: number; y: number } | null = null;
  private previewCursor: { x: number; y: number } | null = null;

  /** Door placement preview state */
  private doorPreviewState: { wall: { p1: { x: number; y: number }; p2: { x: number; y: number } }; t: number; doorType: string } | null = null;

  /** Freeform drawing preview path */
  private freeformPath: Array<{ x: number; y: number }> = [];

  constructor(
    viewport: Viewport,
    store: StoreApi<ViewAtlasState>,
  ) {
    this.store = store;

    this.container = new Container();
    this.container.zIndex = 1100;
    this.container.sortableChildren = true;
    this.container.eventMode = 'none';
    this.container.visible = false;

    this.wallGraphics = new Graphics();
    this.handleGraphics = new Graphics();
    this.lightGraphics = new Graphics();
    this.previewGraphics = new Graphics();

    this.container.addChild(this.wallGraphics);
    this.container.addChild(this.lightGraphics);
    this.container.addChild(this.handleGraphics);
    this.container.addChild(this.previewGraphics);

    viewport.addChild(this.container);

    // Subscribe to relevant state changes
    this._unsubscribe = store.subscribe((state) => {
      const isWallTool = WALLS_AND_LIGHTING_ENABLED && state.activeTool === 'wall';
      this.container.visible = isWallTool;
      if (isWallTool) {
        this.redraw(state);
      }
    });
  }

  forceRedraw(): void {
    const state = this.store.getState();
    this.redraw(state);
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
    if (visible) this.forceRedraw();
  }

  setSelectedWalls(ids: string[]): void {
    this.selectedWallIds = new Set(ids);
    this.forceRedraw();
  }

  setSelectedLights(ids: string[]): void {
    this.selectedLightIds = new Set(ids);
    this.forceRedraw();
  }

  /**
   * Set the anchor point for the live wall preview (the last placed vertex).
   * Pass null to clear the preview.
   */
  setPreviewAnchor(point: { x: number; y: number } | null): void {
    this.previewAnchor = point;
    this.drawPreview();
  }

  /** Update the cursor end of the live preview line. Called on pointermove. */
  updatePreviewCursor(x: number, y: number): void {
    this.previewCursor = { x, y };
    this.drawPreview();
  }

  /** Clear the preview line. */
  clearPreview(): void {
    this.previewAnchor = null;
    this.previewCursor = null;
    this.previewGraphics.clear();
  }

  /** Start freeform preview path. */
  startFreeformPreview(x: number, y: number): void {
    this.freeformPath = [{ x, y }];
    this.drawFreeformPreview();
  }

  /** Add a point to the freeform preview path. */
  addFreeformPreviewPoint(x: number, y: number): void {
    this.freeformPath.push({ x, y });
    this.drawFreeformPreview();
  }

  /** Clear freeform preview. */
  clearFreeformPreview(): void {
    this.freeformPath = [];
    this.previewGraphics.clear();
  }

  private drawFreeformPreview(): void {
    this.previewGraphics.clear();
    if (this.freeformPath.length < 2) {
      // Single point — just show the anchor dot
      if (this.freeformPath.length === 1) {
        const p = this.freeformPath[0]!;
        this.previewGraphics.circle(p.x, p.y, VERTEX_HANDLE_RADIUS + 1);
        this.previewGraphics.fill({ color: 0xffffff, alpha: 0.9 });
      }
      return;
    }

    const g = this.previewGraphics;

    // Draw the path as a continuous line
    g.moveTo(this.freeformPath[0]!.x, this.freeformPath[0]!.y);
    for (let i = 1; i < this.freeformPath.length; i++) {
      g.lineTo(this.freeformPath[i]!.x, this.freeformPath[i]!.y);
    }
    g.stroke({ width: 3, color: 0xffffff, alpha: 0.7 });

    // Start point
    const first = this.freeformPath[0]!;
    g.circle(first.x, first.y, VERTEX_HANDLE_RADIUS + 1);
    g.fill({ color: 0xffffff, alpha: 0.9 });

    // Current point
    const last = this.freeformPath[this.freeformPath.length - 1]!;
    g.circle(last.x, last.y, VERTEX_HANDLE_RADIUS);
    g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
  }

  /** Show a door icon preview sliding along a wall. */
  setDoorPreview(wall: { p1: { x: number; y: number }; p2: { x: number; y: number } }, t: number, doorType: string): void {
    this.doorPreviewState = { wall, t, doorType };
    this.drawDoorPreview();
  }

  clearDoorPreview(): void {
    this.doorPreviewState = null;
    this.previewGraphics.clear();
  }

  private drawDoorPreview(): void {
    this.previewGraphics.clear();
    if (!this.doorPreviewState) return;

    const { wall, t, doorType } = this.doorPreviewState;
    const g = this.previewGraphics;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const doorHalf = len > 0 ? Math.min(20, len * 0.4) : 10;
    const doorHalfT = len > 0 ? doorHalf / len : 0.1;

    const tStart = Math.max(0, t - doorHalfT);
    const tEnd = Math.min(1, t + doorHalfT);

    const startX = wall.p1.x + dx * tStart;
    const startY = wall.p1.y + dy * tStart;
    const endX = wall.p1.x + dx * tEnd;
    const endY = wall.p1.y + dy * tEnd;
    const midX = wall.p1.x + dx * t;
    const midY = wall.p1.y + dy * t;

    const color = doorType === 'secret-door' ? 0xff8844 : 0x44aaff;

    // Door segment preview line
    g.moveTo(startX, startY);
    g.lineTo(endX, endY);
    g.stroke({ width: 4, color, alpha: 0.8 });

    // Door icon preview at midpoint — small rounded rect with handle
    const angle = Math.atan2(dy, dx);
    g.setTransform(midX, midY, 1, 1, angle + Math.PI / 2);
    g.roundRect(-8, -10, 16, 20, 2);
    g.fill({ color, alpha: 0.6 });
    g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
    g.circle(4, 1, 2);
    g.fill({ color: 0xffd54f, alpha: 0.9 });
    g.setTransform(0, 0, 1, 1, 0);

    // Endpoint markers
    g.circle(startX, startY, 3);
    g.fill({ color: 0xffffff, alpha: 0.8 });
    g.circle(endX, endY, 3);
    g.fill({ color: 0xffffff, alpha: 0.8 });
  }

  private drawPreview(): void {
    this.previewGraphics.clear();
    if (!this.previewAnchor || !this.previewCursor) return;

    const g = this.previewGraphics;
    const color = 0xffffff;

    // Anchor point: filled circle
    g.circle(this.previewAnchor.x, this.previewAnchor.y, VERTEX_HANDLE_RADIUS + 1);
    g.fill({ color, alpha: 0.9 });

    // Preview line: dashed to show it's not placed yet
    this.drawDashedLine(
      g,
      this.previewAnchor.x, this.previewAnchor.y,
      this.previewCursor.x, this.previewCursor.y,
      color, 2, 6, 4,
    );

    // Cursor point: hollow circle
    g.circle(this.previewCursor.x, this.previewCursor.y, VERTEX_HANDLE_RADIUS);
    g.stroke({ width: 1.5, color, alpha: 0.7 });
  }

  private redraw(state: ViewAtlasState): void {
    this.wallGraphics.clear();
    this.handleGraphics.clear();
    this.lightGraphics.clear();

    const walls = state.objects.walls;
    const lights = state.objects.lights;

    for (const wall of Object.values(walls)) {
      this.drawWall(wall);
    }

    for (const light of Object.values(lights)) {
      this.drawLight(light);
    }
  }

  private drawWall(wall: WallSegment): void {
    const isSelected = this.selectedWallIds.has(wall.id);
    const accentColor = cssColorToHexNumber(
      getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim() || '#7f6df2'
    );
    const baseColor = this.getWallColor(wall);
    const color = isSelected ? accentColor : baseColor;

    const g = this.wallGraphics;
    const isOpen = (wall.type === 'door' || wall.type === 'secret-door') && !(wall.closed ?? true);

    switch (wall.type) {
      case 'solid':
        g.moveTo(wall.p1.x, wall.p1.y);
        g.lineTo(wall.p2.x, wall.p2.y);
        g.stroke({ width: 3, color, alpha: 1 });
        break;

      case 'door': {
        // Line only — door icon is rendered by VisionRenderer (always visible)
        g.moveTo(wall.p1.x, wall.p1.y);
        g.lineTo(wall.p2.x, wall.p2.y);
        g.stroke({ width: isOpen ? 1.5 : 2.5, color: isOpen ? 0x44dd44 : color, alpha: isOpen ? 0.5 : 1 });
        break;
      }

      case 'secret-door': {
        // Dashed line only — door icon is rendered by VisionRenderer (GM only)
        const dashColor = isOpen ? 0x44dd44 : color;
        this.drawDashedLine(g, wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y,
          dashColor, isOpen ? 1.5 : 2.5, 8, 5);
        break;
      }

      default:
        g.moveTo(wall.p1.x, wall.p1.y);
        g.lineTo(wall.p2.x, wall.p2.y);
        g.stroke({ width: 2, color, alpha: 1 });
    }

    // Direction arrow: shows which side light can pass through
    if (wall.direction) {
      this.drawDirectionArrow(g, wall, isSelected ? accentColor : 0xffffcc);
    }

    // Draw vertex handles
    const h = this.handleGraphics;
    const handleColor = isSelected ? accentColor : 0xffffff;
    h.circle(wall.p1.x, wall.p1.y, VERTEX_HANDLE_RADIUS);
    h.fill({ color: handleColor, alpha: 0.8 });
    h.stroke({ width: 1, color: baseColor });

    h.circle(wall.p2.x, wall.p2.y, VERTEX_HANDLE_RADIUS);
    h.fill({ color: handleColor, alpha: 0.8 });
    h.stroke({ width: 1, color: baseColor });
  }

  private drawLight(light: LightSource): void {
    const isSelected = this.selectedLightIds.has(light.id);
    const color = isSelected ? 0x7f6df2 : 0xffcc33;

    const g = this.lightGraphics;

    // Outer glow ring
    g.circle(light.x, light.y, LIGHT_ICON_RADIUS + 6);
    g.fill({ color: 0xffaa00, alpha: 0.15 });

    // Main icon: filled warm yellow circle with white border
    g.circle(light.x, light.y, LIGHT_ICON_RADIUS);
    g.fill({ color, alpha: 0.9 });
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

    // Inner dot for visual weight
    g.circle(light.x, light.y, 4);
    g.fill({ color: 0xffffff, alpha: 0.6 });

    // Radius preview circles (inner + outer)
    g.circle(light.x, light.y, light.innerRadius);
    g.stroke({ width: 1, color: 0xffaa00, alpha: 0.25 });

    if (light.outerRadius && light.outerRadius > light.innerRadius) {
      g.circle(light.x, light.y, light.outerRadius);
      g.stroke({ width: 1, color: 0xffaa00, alpha: 0.12 });
    }
  }

  private getWallColor(wall: WallSegment): number {
    switch (wall.type) {
      case 'solid': return 0xaaaaaa;
      case 'door': return 0x44aaff;
      case 'secret-door': return 0xff8844;
      default: return 0xaaaaaa;
    }
  }

  private drawDashedLine(
    g: Graphics,
    x1: number, y1: number,
    x2: number, y2: number,
    color: number, width: number,
    dashLength: number, gapLength: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    const nx = dx / dist;
    const ny = dy / dist;

    let pos = 0;
    let drawing = true;
    while (pos < dist) {
      const segLen = drawing ? dashLength : gapLength;
      const end = Math.min(pos + segLen, dist);
      if (drawing) {
        g.moveTo(x1 + nx * pos, y1 + ny * pos);
        g.lineTo(x1 + nx * end, y1 + ny * end);
        g.stroke({ width, color });
      }
      pos = end;
      drawing = !drawing;
    }
  }

  /**
   * Draw a single prominent arrow at the wall midpoint showing which side
   * light passes through. Styled like a Foundry VTT directional indicator:
   * a filled arrow pointing toward the pass-through side.
   */
  private drawDirectionArrow(g: Graphics, wall: WallSegment, color: number): void {
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 10) return;

    // Normal pointing toward the pass-through side
    let nx: number, ny: number;
    if (wall.direction === 'left') {
      nx = -dy / len;
      ny = dx / len;
    } else {
      nx = dy / len;
      ny = -dx / len;
    }

    const mx = (wall.p1.x + wall.p2.x) / 2;
    const my = (wall.p1.y + wall.p2.y) / 2;

    // Tangent along wall
    const tx = dx / len;
    const ty = dy / len;

    // Arrow dimensions
    const arrowLength = 12;
    const arrowWidth = 7;

    // Arrow tip (offset from wall along normal)
    const tipX = mx + nx * arrowLength;
    const tipY = my + ny * arrowLength;

    // Arrow base corners (on the wall line, spread along tangent)
    const baseLeftX = mx - tx * arrowWidth;
    const baseLeftY = my - ty * arrowWidth;
    const baseRightX = mx + tx * arrowWidth;
    const baseRightY = my + ty * arrowWidth;

    // Stem indent (creates the notch at the arrow base)
    const stemX = mx + nx * 3;
    const stemY = my + ny * 3;

    // Draw filled arrow
    g.moveTo(tipX, tipY);
    g.lineTo(baseLeftX, baseLeftY);
    g.lineTo(stemX, stemY);
    g.lineTo(baseRightX, baseRightY);
    g.closePath();
    g.fill({ color, alpha: 0.9 });
    g.stroke({ width: 1, color: 0x000000, alpha: 0.3 });
  }

  /** Hit-test walls at a world coordinate. Returns wall id or null. */
  hitTestWalls(worldX: number, worldY: number): string | null {
    const walls = this.store.getState().objects.walls;
    for (const wall of Object.values(walls)) {
      if (this.pointToSegmentDist(worldX, worldY, wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y) < HIT_TOLERANCE) {
        return wall.id;
      }
    }
    return null;
  }

  /** Hit-test light sources at a world coordinate. Returns light id or null. */
  hitTestLights(worldX: number, worldY: number): string | null {
    const lights = this.store.getState().objects.lights;
    for (const light of Object.values(lights)) {
      const dx = worldX - light.x;
      const dy = worldY - light.y;
      if (dx * dx + dy * dy < LIGHT_ICON_RADIUS * LIGHT_ICON_RADIUS * 4) {
        return light.id;
      }
    }
    return null;
  }

  /** Hit-test wall vertex handles. Returns { wallId, vertex } or null. */
  hitTestVertices(worldX: number, worldY: number): { wallId: string; vertex: 'p1' | 'p2' } | null {
    const walls = this.store.getState().objects.walls;
    const threshold = VERTEX_HANDLE_RADIUS * 3;
    const thresholdSq = threshold * threshold;

    for (const wall of Object.values(walls)) {
      const d1 = (worldX - wall.p1.x) ** 2 + (worldY - wall.p1.y) ** 2;
      if (d1 < thresholdSq) return { wallId: wall.id, vertex: 'p1' };

      const d2 = (worldX - wall.p2.x) ** 2 + (worldY - wall.p2.y) ** 2;
      if (d2 < thresholdSq) return { wallId: wall.id, vertex: 'p2' };
    }
    return null;
  }

  private pointToSegmentDist(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  getContainer(): Container {
    return this.container;
  }

  destroy(): void {
    this._unsubscribe?.();
    this.wallGraphics.destroy();
    this.handleGraphics.destroy();
    this.lightGraphics.destroy();
    this.previewGraphics.destroy();
    this.container.destroy({ children: true });
  }
}
