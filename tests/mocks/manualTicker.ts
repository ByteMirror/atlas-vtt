import { Ticker } from 'pixi.js';

/** A PIXI ticker stepped by hand in 16 ms frames, so ticker-driven animations advance deterministically. */
export function manualTicker(): { ticker: Ticker; advance: (ms: number) => void } {
  const ticker = new Ticker();
  ticker.autoStart = false;
  // Motion stamps an animation's start with performance.now(), the timebase of real ticker frames
  let now = performance.now();
  ticker.update(now);
  return {
    ticker,
    advance: (ms) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 16) ticker.update((now += 16));
    },
  };
}
