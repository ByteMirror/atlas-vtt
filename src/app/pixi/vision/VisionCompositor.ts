import type { VisionPolygon, Point } from '../../types/visionTypes';

const MAX_CANVAS_DIM = 2048;
const SHADOW_BLUR = 4;

/**
 * Three-canvas compositor: smooth gradient circle + blurred wall shadows.
 *
 * 1. lightCanvas: radial gradient circle with natural falloff
 * 2. shadowCanvas: wall shadow mask with blur for soft edges
 * 3. main canvas: fog with light cutouts
 */
export class VisionCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private shadowCanvas: HTMLCanvasElement;
  private shadowCtx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private resFactor: number = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;
    this.shadowCanvas = document.createElement('canvas');
    this.shadowCtx = this.shadowCanvas.getContext('2d')!;
  }

  render(
    polygons: VisionPolygon[],
    worldBounds: { minX: number; minY: number; maxX: number; maxY: number },
  ): HTMLCanvasElement {
    const worldW = worldBounds.maxX - worldBounds.minX;
    const worldH = worldBounds.maxY - worldBounds.minY;

    const maxDim = Math.max(worldW, worldH);
    const resFactor = maxDim > MAX_CANVAS_DIM ? MAX_CANVAS_DIM / maxDim : 1.0;

    this.resFactor = resFactor;
    this.width = Math.ceil(worldW * resFactor);
    this.height = Math.ceil(worldH * resFactor);
    this.offsetX = worldBounds.minX;
    this.offsetY = worldBounds.minY;

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.lightCanvas.width = this.width;
    this.lightCanvas.height = this.height;
    this.shadowCanvas.width = this.width;
    this.shadowCanvas.height = this.height;

    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(0, 0, this.width, this.height);

    for (const poly of polygons) {
      this.renderSource(ctx, poly);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';

    return this.canvas;
  }

  private renderSource(ctx: CanvasRenderingContext2D, poly: VisionPolygon): void {
    const scale = this.resFactor;
    const cx = (poly.origin.x - this.offsetX) * scale;
    const cy = (poly.origin.y - this.offsetY) * scale;
    const outerR = poly.outerRadius * scale;
    const innerR = poly.innerRadius * scale;
    const intensity = poly.intensity ?? 1;

    // ── Step 1: Smooth gradient circle on lightCanvas ─────────────
    const lc = this.lightCtx;
    lc.clearRect(0, 0, this.width, this.height);
    lc.filter = 'none';
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;

    const innerRatio = outerR > 0 ? Math.min(innerR / outerR, 0.95) : 0.5;

    // Many-stop gradient simulating real light: inverse-square-like falloff
    // that's continuous from center to edge. No separate "bright" and "dim"
    // zones — just one smooth curve that gradually dims, like real light.
    //
    // The innerRatio controls WHERE the curve inflects (falloff accelerates),
    // but the transition is always gradual — never a visible step.
    const grad = lc.createRadialGradient(cx, cy, 0, cx, cy, outerR);
    const STOPS = 32;
    for (let i = 0; i <= STOPS; i++) {
      const t = i / STOPS; // 0 = center, 1 = outer edge

      // Compute a smooth continuous falloff inspired by real light physics.
      // Instead of separate bright/dim zones, use a single curve that
      // inflects around innerRatio:
      //
      //   alpha = 1 / (1 + k * (t / inflect)^2)
      //
      // k is small before the inflect point (gentle falloff in bright zone)
      // and larger after (steeper falloff in dim zone).
      let alpha: number;
      if (t <= innerRatio) {
        // Gentle falloff: k=0.8 gives ~55% at innerRatio
        const normalized = t / (innerRatio || 0.5);
        alpha = 1.0 / (1.0 + 0.8 * normalized * normalized);
      } else {
        // Steeper falloff continuing from where bright zone left off
        const atInner = 1.0 / (1.0 + 0.8); // ~0.556
        const dimT = (t - innerRatio) / (1.0 - innerRatio);
        // Cubic ease: starts at atInner, ends at ~0.10
        let base = atInner * (1.0 - dimT * dimT * dimT * 0.82);

        // Last ~8% of the radius: accelerate the falloff sharply
        // so the final stretch drops to near-zero (natural edge fade)
        if (t > 0.92) {
          const edgeT = (t - 0.92) / 0.08; // 0→1 over last 8%
          base *= (1.0 - edgeT * edgeT * edgeT); // cubic drop to 0
        }

        alpha = base;
      }

      grad.addColorStop(t, this.rgba(alpha, intensity));
    }
    grad.addColorStop(1, this.rgba(0.0, intensity));

    lc.fillStyle = grad;
    lc.beginPath();
    lc.arc(cx, cy, outerR, 0, Math.PI * 2);
    lc.fill();

    // ── Step 2: Wall shadow mask with blur ────────────────────────
    const sc = this.shadowCtx;
    sc.clearRect(0, 0, this.width, this.height);
    sc.filter = `blur(${SHADOW_BLUR}px)`;
    sc.globalCompositeOperation = 'source-over';
    sc.globalAlpha = 1;

    // White = shadow (everywhere)
    sc.fillStyle = 'white';
    sc.fillRect(0, 0, this.width, this.height);

    // Cut out the visibility polygon = no shadow where visible
    sc.globalCompositeOperation = 'destination-out';
    sc.fillStyle = 'white';
    this.buildAndFillPolygon(sc, poly.vertices);
    sc.filter = 'none';

    // ── Step 3: Subtract shadows from light ───────────────────────
    lc.globalCompositeOperation = 'destination-out';
    lc.globalAlpha = 1;
    lc.drawImage(this.shadowCanvas, 0, 0);

    // ── Step 4: Stamp light onto fog as cutout ────────────────────
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.drawImage(this.lightCanvas, 0, 0);
  }

  private rgba(alpha: number, intensity: number): string {
    const a = Math.max(0, Math.min(1, alpha * intensity));
    return `rgba(255,255,255,${a.toFixed(4)})`;
  }

  getOffset(): { x: number; y: number } {
    return { x: this.offsetX, y: this.offsetY };
  }

  getScale(): number {
    return this.resFactor;
  }

  private buildAndFillPolygon(ctx: CanvasRenderingContext2D, vertices: Point[]): void {
    if (vertices.length < 3) return;
    const scale = this.resFactor;
    ctx.beginPath();
    ctx.moveTo(
      (vertices[0]!.x - this.offsetX) * scale,
      (vertices[0]!.y - this.offsetY) * scale,
    );
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(
        (vertices[i]!.x - this.offsetX) * scale,
        (vertices[i]!.y - this.offsetY) * scale,
      );
    }
    ctx.closePath();
    ctx.fill();
  }

  destroy(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.lightCanvas.width = 0;
    this.lightCanvas.height = 0;
    this.shadowCanvas.width = 0;
    this.shadowCanvas.height = 0;
  }
}
