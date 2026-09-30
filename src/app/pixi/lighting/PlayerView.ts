import type { HideableLayer } from '../playerSafeFrame';

/**
 * Whether scene lighting shows the players' view: while their frame is captured, or as the
 * GM's preview. As a `HideableLayer`, `visible` is what the player-frame capture flips.
 */
export class PlayerView implements HideableLayer {
  private capturing = false;
  private previewing = false;

  constructor(private readonly onChange: (active: boolean) => void) {}

  get visible(): boolean {
    return this.capturing;
  }

  set visible(capturing: boolean) {
    this.capturing = capturing;
    this.onChange(this.active);
  }

  get active(): boolean {
    return this.capturing || this.previewing;
  }

  setPreview(on: boolean): void {
    this.previewing = on;
    this.onChange(this.active);
  }
}
