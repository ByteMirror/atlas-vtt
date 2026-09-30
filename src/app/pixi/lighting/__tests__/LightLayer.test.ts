import { describe, expect, it } from 'vitest';
import { LightLayer } from '../LightLayer';
import type { LightFrame } from '../lightShaders';

const frame: LightFrame = { x: 1000, y: 3000, bright: 250, dim: 500, sourceRadius: 15, color: [1, 0.6, 0.2], intensity: 1 };

describe('LightLayer', () => {
  it('gives its light quad real bounds around the light, which PIXI uses as the filter area', () => {
    const layer = new LightLayer();
    layer.update(frame, []);
    const bounds = layer.view.children[0]!.getLocalBounds();
    expect(bounds.minX).toBeLessThanOrEqual(1000 - 500);
    expect(bounds.maxX).toBeGreaterThanOrEqual(1000 + 500);
    expect(bounds.minY).toBeLessThanOrEqual(3000 - 500);
    expect(bounds.maxY).toBeGreaterThanOrEqual(3000 + 500);
    expect(bounds.maxX - bounds.minX).toBeLessThan(1400);
  });

  it('moves its bounds with the light', () => {
    const layer = new LightLayer();
    layer.update(frame, []);
    layer.update({ ...frame, x: 200, y: 100 }, null);
    const bounds = layer.view.children[0]!.getLocalBounds();
    expect((bounds.minX + bounds.maxX) / 2).toBeCloseTo(200);
    expect((bounds.minY + bounds.maxY) / 2).toBeCloseTo(100);
  });
});
