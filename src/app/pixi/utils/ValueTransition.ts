import { easeOut } from '../../utils/motion';

/**
 * Eases a number towards a target with the ease-out motion token, like a CSS
 * transition: a new target mid-way continues from the current value instead of
 * restarting. `apply` receives every intermediate value.
 */
export class ValueTransition {
  private current: number;
  private target: number;
  private from: number;
  private startTime = 0;
  private frame: number | null = null;
  private onDone: (() => void) | null = null;

  constructor(initial: number, private readonly durationMs: number, private readonly apply: (value: number) => void) {
    this.current = initial;
    this.target = initial;
    this.from = initial;
  }

  get value(): number {
    return this.current;
  }

  get targetValue(): number {
    return this.target;
  }

  get isRunning(): boolean {
    return this.frame !== null;
  }

  /** Sets `value` at once, cancelling a running transition. */
  jumpTo(value: number): void {
    this.cancel();
    this.current = value;
    this.target = value;
    this.apply(value);
  }

  /** Eases from the current value to `value`; `onDone` runs once it arrives. */
  animateTo(value: number, onDone?: () => void): void {
    this.cancel();
    if (value === this.current) {
      this.jumpTo(value);
      onDone?.();
      return;
    }
    this.from = this.current;
    this.target = value;
    this.onDone = onDone ?? null;
    this.startTime = performance.now();
    this.frame = window.requestAnimationFrame(this.step);
  }

  cancel(): void {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.onDone = null;
  }

  private step = (): void => {
    const progress = Math.min(1, Math.max(0, (performance.now() - this.startTime) / this.durationMs));
    this.current = progress < 1 ? this.from + (this.target - this.from) * easeOut(progress) : this.target;
    this.apply(this.current);
    if (progress < 1) {
      this.frame = window.requestAnimationFrame(this.step);
      return;
    }
    this.frame = null;
    const done = this.onDone;
    this.onDone = null;
    done?.();
  };
}
