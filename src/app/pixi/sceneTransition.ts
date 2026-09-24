import type { Application } from 'pixi.js';
import { MOTION_EASE_OUT, MOTION_SLOW_MS, prefersReducedMotion } from '../utils/motion';
import './scene-transition.scss';

/** The incoming map starts this much larger and settles in: reads as depth, not as a zoom. */
const SETTLE_SCALE = 1.015;

export interface SceneTransition {
  /** Crossfades from the frozen frame to whatever the canvas shows next. */
  play(): void;
  /** Drops the frozen frame at once. */
  cancel(): void;
  /** Paints the frozen frame at its current opacity, so an interrupted fade can be carried over. */
  paintInto(context: CanvasRenderingContext2D): void;
}

/**
 * Freezes the current map of the DM canvas as a still frame above it. While a scene
 * loads behind it, the still frame hides the half-built map; `play` then fades it
 * out while the new map settles in.
 *
 * @param previous A transition still fading out; its visible state is carried into the new frame.
 */
export function captureSceneTransition(app: Application, previous: SceneTransition | null): SceneTransition | null {
  const source = app.canvas;
  return freezeCanvasFrame(source, (context) => {
    // A WebGL canvas keeps its drawing buffer only until the frame is composited, so render and copy in one task
    app.renderer.render(app.stage);
    context.drawImage(source, 0, 0);
  }, previous);
}

export interface FreezeOptions {
  /**
   * Let the incoming map settle in with a slight scale (default). Turn it off for
   * canvases displayed with nearest-neighbour sampling (`image-rendering: pixelated`
   * or `crisp-edges`): a fractional scale there shifts which pixels are duplicated
   * on every frame, so edges and grid lines crawl and the motion reads as stutter.
   */
  settle?: boolean;
}

/**
 * Layers a still frame, painted by `paint`, directly above `target` (same size,
 * below any later siblings such as UI overlays). Works in popout windows.
 */
export function freezeCanvasFrame(
  target: HTMLCanvasElement,
  paint: (context: CanvasRenderingContext2D) => void,
  previous: SceneTransition | null,
  { settle: shouldSettle = true }: FreezeOptions = {},
): SceneTransition | null {
  const parent = target.parentElement;
  if (!parent || target.width === 0 || target.height === 0) return null;

  const snapshot = parent.createEl('canvas', { cls: 'atlas-scene-transition-snapshot' });
  const context = snapshot.getContext('2d');
  if (!context) {
    snapshot.remove();
    return null;
  }
  snapshot.width = target.width;
  snapshot.height = target.height;
  paint(context);
  previous?.paintInto(context);
  previous?.cancel();
  target.after(snapshot);

  let fade: Animation | null = null;
  let settle: Animation | null = null;

  const cancel = (): void => {
    fade?.cancel();
    settle?.cancel();
    snapshot.remove();
    // Release the frame's pixels right away instead of waiting for garbage collection
    snapshot.width = 0;
    snapshot.height = 0;
  };

  return {
    play(): void {
      const timing: KeyframeAnimationOptions = { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT };
      fade = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
      fade.onfinish = cancel;
      if (shouldSettle && !prefersReducedMotion(target)) {
        settle = target.animate([{ transform: `scale(${SETTLE_SCALE})` }, { transform: 'none' }], timing);
      }
    },
    cancel,
    paintInto(into: CanvasRenderingContext2D): void {
      if (!snapshot.isConnected) return;
      into.globalAlpha = Number(snapshot.win.getComputedStyle(snapshot).opacity);
      into.drawImage(snapshot, 0, 0);
      into.globalAlpha = 1;
    },
  };
}
