/**
 * The cloud fog modifier's display: the fog players see, as clouds, and the
 * transition when a finished edit changes it. Clouds part left and right over
 * what the edit uncovered and gather in from both sides over what it covered.
 *
 * It shows the fog it was last given (`present`), which the fog renderer only
 * does while nobody is editing fog, so players keep the fog from before an edit
 * until it is finished. Nothing runs between edits: the clouds are one baked
 * texture, and a transition animates a few dozen sprites for about a second.
 */
import * as PIXI from 'pixi.js';
import { displayedFogOps, type FogBounds, type FogOperation } from '../../types/fogTypes';
import { requestRender } from '../RenderScheduler';
import { ValueTransition } from '../utils/ValueTransition';
import { destroyTree } from '../utils/destroyTree';
import { prefersReducedMotion } from '../../utils/motion';
import { bakeCloudFog, CLOUD_SCALE, cloudTones, createPuffCanvas, intersectClouds, sampleFogMask } from './fogCloudCanvas';
import { findFogChange, layoutPuffs, revealCellSize, type FogPuff } from './fogReveal';

const TRANSITION_MS = 1100;
/** Share of the transition over which the clouds from before the edit fade out, hidden by parting puffs. */
const FADE_OUT_END = 0.35;
/** Share of the transition over which newly covered clouds fade in, once gathering puffs arrived. */
const FADE_IN_START = 0.55;
const FADE_IN_END = 0.95;

interface BakedFog {
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
}

interface PuffSprite {
  sprite: PIXI.Sprite;
  puff: FogPuff;
}

interface Presented {
  fog: Record<string, FogOperation>;
  bounds: FogBounds;
  color: string;
  canvas: HTMLCanvasElement | null;
}

export class FogCloudLayer {
  readonly container = new PIXI.Container();
  private presented: Presented | null = null;
  private current: BakedFog | null = null;
  /** During a transition, bottom to top: clouds in both states, the state before, the state after (`current`). */
  private stable: BakedFog | null = null;
  private fading: BakedFog | null = null;
  private puffTexture: PIXI.Texture | null = null;
  private puffs: PuffSprite[] = [];
  private readonly transition = new ValueTransition(0, TRANSITION_MS, (progress) => this.applyTransition(progress));

  constructor(private readonly app: PIXI.Application) {
    this.container.label = 'fogClouds';
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
  }

  get isRevealing(): boolean {
    return this.transition.isRunning;
  }

  /**
   * Show `fog` as clouds of `color`. With `animate`, clouds part over what the fog
   * shown so far covered and `fog` does not, and gather over the reverse.
   * Unchanged fog, bounds and colour do nothing.
   */
  present(fog: Record<string, FogOperation>, bounds: FogBounds, color: string, animate: boolean): void {
    const shown = this.presented;
    if (shown && shown.fog === fog && shown.color === color && sameBounds(bounds, shown.bounds)) return;
    const ops = displayedFogOps(fog);
    const canvas = ops.some((op) => !op.isErasing) ? safely(() => bakeCloudFog(ops, bounds, color)) : null;
    this.finishTransition();
    this.presented = { fog, bounds, color, canvas };

    const previous = this.current;
    this.current = canvas ? createBakedFog(canvas, bounds) : null;
    if (this.current) this.container.addChildAt(this.current.sprite, 0);

    const moves = animate && shown && shown.color === color && sameBounds(bounds, shown.bounds) && !this.reducedMotion();
    const puffs = moves ? safely(() => this.changePuffs(displayedFogOps(shown.fog), ops, bounds)) ?? [] : [];
    if (puffs.length === 0) {
      if (previous) destroyBakedFog(previous);
      requestRender(this.app);
      return;
    }
    this.startTransition(previous, shown?.canvas ?? null, canvas, bounds, puffs, color);
  }

  /** Forget the fog shown, e.g. when another map loads; the next `present` does not animate. */
  reset(): void {
    if (!this.presented && !this.isRevealing) return;
    this.finishTransition();
    if (this.current) destroyBakedFog(this.current);
    this.current = null;
    this.presented = null;
    requestRender(this.app);
  }

  destroy(): void {
    this.finishTransition();
    if (this.current) destroyBakedFog(this.current);
    this.current = null;
    destroyTree(this.container);
    this.puffTexture?.destroy(true);
    this.puffTexture = null;
  }

  private reducedMotion(): boolean {
    const canvas = this.app.canvas as HTMLCanvasElement | undefined;
    return !!canvas && prefersReducedMotion(canvas);
  }

  private changePuffs(before: FogOperation[], after: FogOperation[], bounds: FogBounds): FogPuff[] {
    const cellSize = revealCellSize(bounds);
    const beforeMask = sampleFogMask(before, bounds, cellSize);
    const afterMask = sampleFogMask(after, bounds, cellSize);
    if (!beforeMask || !afterMask) return [];
    const { revealed, covered } = findFogChange(beforeMask, afterMask, bounds, cellSize);
    return [...layoutPuffs(revealed, 'part'), ...layoutPuffs(covered, 'gather')];
  }

  private startTransition(
    previous: BakedFog | null,
    previousCanvas: HTMLCanvasElement | null,
    nextCanvas: HTMLCanvasElement | null,
    bounds: FogBounds,
    puffs: FogPuff[],
    color: string,
  ): void {
    // Clouds in both states never blink while the old ones fade out and the new ones fade in
    if (previousCanvas && nextCanvas) {
      this.stable = createBakedFog(safely(() => intersectClouds(previousCanvas, nextCanvas)) ?? nextCanvas, bounds);
      this.container.addChild(this.stable.sprite);
    }
    this.fading = previous;
    if (previous) this.container.addChild(previous.sprite);
    if (this.current) this.container.addChild(this.current.sprite);

    this.puffTexture ??= PIXI.Texture.from(createPuffCanvas());
    const tones = cloudTones(color);
    for (const puff of puffs) {
      const sprite = new PIXI.Sprite(this.puffTexture);
      sprite.anchor.set(0.5);
      sprite.tint = tones[puff.tone] ?? tones[0] ?? 0xffffff;
      sprite.eventMode = 'none';
      this.container.addChild(sprite);
      this.puffs.push({ sprite, puff });
    }
    this.transition.jumpTo(0);
    this.transition.animateTo(1, () => this.finishTransition());
  }

  /** One frame at eased `progress` (0-1). */
  private applyTransition(progress: number): void {
    if (this.fading) this.fading.sprite.alpha = 1 - Math.min(1, progress / FADE_OUT_END);
    if (this.current) {
      this.current.sprite.alpha = smoothstep((progress - FADE_IN_START) / (FADE_IN_END - FADE_IN_START));
    }
    for (const { sprite, puff } of this.puffs) {
      const t = Math.min(1, Math.max(0, (progress - puff.delay) / (1 - puff.delay)));
      // Parting puffs travel from the area outwards; gathering ones the same path backwards
      const away = puff.motion === 'part' ? t : 1 - t;
      sprite.position.set(puff.x + puff.dx * away, puff.y + puff.dy * away);
      sprite.width = sprite.height = puff.radius * 2 * (1 + 0.9 * away);
      sprite.rotation = puff.spin * away;
      sprite.alpha = puff.motion === 'part'
        ? 1 - smoothstep((t - 0.2) / 0.8)
        : smoothstep(t / 0.3) * (1 - smoothstep((t - 0.75) / 0.25));
    }
    // Alpha and transform changes alone may not mark the stage as changed
    requestRender(this.app);
  }

  private finishTransition(): void {
    this.transition.cancel();
    for (const { sprite } of this.puffs) destroyTree(sprite);
    this.puffs = [];
    if (this.fading) destroyBakedFog(this.fading);
    this.fading = null;
    if (this.stable) destroyBakedFog(this.stable);
    this.stable = null;
    if (this.current) {
      this.current.sprite.alpha = 1;
      this.container.addChildAt(this.current.sprite, 0);
    }
    requestRender(this.app);
  }
}

function createBakedFog(canvas: HTMLCanvasElement, bounds: FogBounds): BakedFog {
  const texture = PIXI.Texture.from(canvas);
  const sprite = new PIXI.Sprite(texture);
  sprite.eventMode = 'none';
  sprite.position.set(bounds.x, bounds.y);
  sprite.scale.set(1 / CLOUD_SCALE);
  return { sprite, texture };
}

function destroyBakedFog(baked: BakedFog): void {
  destroyTree(baked.sprite);
  if (!baked.texture.destroyed) baked.texture.destroy(true);
}

function sameBounds(a: FogBounds, b: FogBounds | null): boolean {
  return !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/** Canvas work that fails where there is no Canvas 2D (tests) leaves the fog as it was. */
function safely<T>(work: () => T): T | null {
  try {
    return work();
  } catch (error) {
    console.error('[FogCloudLayer] Cloud fog failed:', error);
    return null;
  }
}
