import { describe, expect, it } from 'vitest';
import { wheelGauge } from '../../../src/app/pixi/token-renderer/resources/wheelGeometry';

const TOP = -Math.PI / 2;
const TURN = Math.PI * 2;

describe('wheelGauge', () => {
  it('fills clockwise from the top by the share that is left or used', () => {
    expect(wheelGauge({ current: 30, max: 120 })).toEqual({ share: 0.25, end: TOP + TURN / 4, ticks: [] });
    expect(wheelGauge({ current: 0, max: 20 })?.share).toBe(0);
    expect(wheelGauge({ current: 25, max: 20 })?.share).toBe(1);
  });

  it('marks one segment per point up to a maximum of eight, with a tick between neighbours', () => {
    const gauge = wheelGauge({ current: 4, max: 6 })!;
    expect(gauge.share).toBeCloseTo(4 / 6);
    expect(gauge.ticks).toHaveLength(6);
    expect(gauge.ticks[0]).toBe(TOP);
    expect(gauge.ticks[3]).toBeCloseTo(TOP + TURN / 2);
    expect(wheelGauge({ current: 3, max: 9 })?.ticks).toEqual([]);
    expect(wheelGauge({ current: 1, max: 2.5 })?.ticks).toEqual([]);
  });

  it('is one unbroken ring for a single point: nothing divides it', () => {
    expect(wheelGauge({ current: 1, max: 1 })).toEqual({ share: 1, end: TOP + TURN, ticks: [] });
  });

  it('is nothing without a maximum', () => {
    expect(wheelGauge({ current: 0, max: 0 })).toBeNull();
  });
});
