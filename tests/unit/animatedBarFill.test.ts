import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { manualTicker } from '../mocks/manualTicker';
import { AnimatedBarFill, type BarFillRect } from '../../src/app/pixi/token-renderer/AnimatedBarFill';

// Gradients rasterise on a 2D canvas, which jsdom lacks; a flat colour draws the same shape.
vi.mock('../../src/app/pixi/token-renderer/barGradient', () => ({ getBarGradient: (color: number) => color }));

const RECT: BarFillRect = { x: 0, y: 0, width: 100, height: 6 };

/** Right edge of what a layer of the bar draws, i.e. how full it looks. */
function drawnWidth(bar: AnimatedBarFill, layer: 0 | 1): number {
  const graphics = bar.view.children[layer] as Graphics;
  return graphics.context.instructions.length === 0 ? 0 : graphics.bounds.maxX;
}
const trailWidth = (bar: AnimatedBarFill): number => drawnWidth(bar, 0);
const fillWidth = (bar: AnimatedBarFill): number => drawnWidth(bar, 1);

describe('AnimatedBarFill', () => {
  it('shows the first value at once', () => {
    const { ticker } = manualTicker();
    const bar = new AnimatedBarFill(() => 0x00ff00, ticker);

    bar.set(0.5, RECT, true);

    expect(fillWidth(bar)).toBeCloseTo(50);
  });

  it('eases the fill down and drains a trail of the loss after a beat', () => {
    const { ticker, advance } = manualTicker();
    const bar = new AnimatedBarFill(() => 0x00ff00, ticker);
    bar.set(1, RECT, true);

    bar.set(0.25, RECT, true);
    advance(160);
    expect(fillWidth(bar)).toBeLessThan(100);
    expect(fillWidth(bar)).toBeGreaterThan(25);
    expect(trailWidth(bar)).toBeCloseTo(100);

    advance(1200);
    expect(fillWidth(bar)).toBeCloseTo(25);
    expect(trailWidth(bar)).toBe(0);
  });

  it('shows a gain as a trail at once and grows the fill into it', () => {
    const { ticker, advance } = manualTicker();
    const bar = new AnimatedBarFill(() => 0x00ff00, ticker);
    bar.set(0.2, RECT, true);

    bar.set(0.8, RECT, true);
    expect(trailWidth(bar)).toBeCloseTo(80);
    advance(160);
    expect(fillWidth(bar)).toBeGreaterThan(20);
    expect(fillWidth(bar)).toBeLessThan(80);

    advance(600);
    expect(fillWidth(bar)).toBeCloseTo(80);
    expect(trailWidth(bar)).toBe(0);
  });

  it('jumps when animation is off', () => {
    const { ticker } = manualTicker();
    const bar = new AnimatedBarFill(() => 0x00ff00, ticker);
    bar.set(1, RECT, true);

    bar.set(0.3, RECT, false);

    expect(fillWidth(bar)).toBeCloseTo(30);
    expect(trailWidth(bar)).toBe(0);
  });

  it('shows an empty bar for a max of 0', () => {
    const bar = new AnimatedBarFill(() => 0x00ff00, null);

    bar.set(Number.NaN, RECT, true);

    expect(fillWidth(bar)).toBe(0);
  });
});
