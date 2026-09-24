import { Container, Graphics, type Ticker } from 'pixi.js';
import type { AnimationPlaybackControls } from 'framer-motion';
import { resourceBarFill } from '../resourceBarFill';
import { animateOnTicker } from '../utils/tickerMotion';
import { EASE_OUT_CONTROL_POINTS } from '../../utils/motion';
import { lightenColor } from '../../styles/designTokens';
import { getBarGradient } from './barGradient';

/** Where the fill of a full bar would be drawn, in UI units. */
export interface BarFillRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FILL_DURATION_S = 0.4;
/** A loss stays visible for a beat before the trail drains, so the eye catches how much was lost. */
const TRAIL_DELAY_S = 0.35;
const TRAIL_DURATION_S = 0.5;
const TRAIL_ALPHA = 0.55;

/** A bar with a max of 0 divides by zero; it shows empty. */
const clampFraction = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * A resource bar's fill that eases to each new value. A loss leaves a pale trail of
 * the lost amount that drains after a beat; a gain shows the new amount as that pale
 * trail at once and the fill grows into it.
 */
export class AnimatedBarFill {
  readonly view = new Container();
  private readonly trail = new Graphics();
  private readonly fill = new Graphics();
  private rect: BarFillRect = { x: 0, y: 0, width: 0, height: 0 };
  /** Fraction on screen; null until the first value, which shows without animating. */
  private shown: number | null = null;
  private trailShown = 0;
  private target = 0;
  private fillAnimation: AnimationPlaybackControls | null = null;
  private trailAnimation: AnimationPlaybackControls | null = null;

  /** `colorFor` gives the fill colour for a fraction; without a ticker every change is instant. */
  constructor(private readonly colorFor: (fraction: number) => number, private readonly ticker: Ticker | null) {
    this.view.addChild(this.trail, this.fill);
  }

  /** Shows `fraction` (0 to 1) of the bar laid out in `rect`; `animate` eases from what is on screen. */
  set(fraction: number, rect: BarFillRect, animate: boolean): void {
    this.rect = rect;
    const target = clampFraction(fraction);
    if (this.shown !== null && target === this.target) {
      this.draw();
      return;
    }
    this.target = target;
    if (this.shown === null || !animate || !this.ticker) {
      this.jumpTo(target);
      return;
    }

    this.fillAnimation?.stop();
    this.fillAnimation = animateOnTicker(this.ticker, this.shown, target, {
      duration: FILL_DURATION_S,
      ease: [...EASE_OUT_CONTROL_POINTS],
      onUpdate: (value) => {
        this.shown = value;
        this.draw();
      },
    });

    this.trailAnimation?.stop();
    this.trailAnimation = null;
    if (target >= this.trailShown) {
      this.trailShown = target;
      this.draw();
      return;
    }
    this.trailAnimation = animateOnTicker(this.ticker, this.trailShown, target, {
      delay: TRAIL_DELAY_S,
      duration: TRAIL_DURATION_S,
      ease: 'easeInOut',
      onUpdate: (value) => {
        this.trailShown = value;
        this.draw();
      },
    });
  }

  destroy(): void {
    this.fillAnimation?.stop();
    this.trailAnimation?.stop();
  }

  private jumpTo(target: number): void {
    this.fillAnimation?.stop();
    this.trailAnimation?.stop();
    this.shown = target;
    this.trailShown = target;
    this.draw();
  }

  private draw(): void {
    if (this.view.destroyed) return;
    const { x, y, width, height } = this.rect;
    const shown = this.shown ?? 0;
    this.trail.clear();
    this.fill.clear();
    if (this.trailShown > shown) {
      resourceBarFill(this.trail, x, y, width * this.trailShown, height)
        .fill({ color: lightenColor(this.colorFor(this.target), 0.55), alpha: TRAIL_ALPHA });
    }
    if (shown > 0) {
      resourceBarFill(this.fill, x, y, width * shown, height).fill(getBarGradient(this.colorFor(shown)));
    }
  }
}
