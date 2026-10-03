import type { HideableLayer } from '../playerSafeFrame';

/**
 * Whether scene lighting shows the players' view. As a `HideableLayer`, `visible` is what the
 * players' view flips (`playerLightingLayers`): for one captured frame, or held for as long as
 * the GM's canvas shows session view.
 */
export class PlayerView implements HideableLayer {
  private shown = false;

  constructor(private readonly onChange: (shown: boolean) => void) {}

  get visible(): boolean {
    return this.shown;
  }

  set visible(shown: boolean) {
    this.shown = shown;
    this.onChange(shown);
  }
}
