import { describe, expect, it } from 'vitest';
import { fitWithin, frameImageRect, frameSize } from '../../src/app/imageProcessing/imageLayout';
import { renderedImageRect, TOKEN_CROP_FRACTION, tokenCropPlacement } from '../../src/app/packages/components/asset-manager/token-creator/cropMath';

describe('fitWithin', () => {
  it('scales down to the tighter bound and keeps the aspect ratio', () => {
    expect(fitWithin({ width: 11708, height: 12917 }, 8192, 8192)).toEqual({ width: 7425, height: 8192 });
    expect(fitWithin({ width: 2048, height: 1024 }, 400, 400)).toEqual({ width: 400, height: 200 });
  });

  it('never scales up', () => {
    expect(fitWithin({ width: 300, height: 120 }, 400, 400)).toEqual({ width: 300, height: 120 });
  });
});

describe('token frames', () => {
  it('give the frame as many pixels as the source has across it, within the bounds', () => {
    const placement = tokenCropPlacement(1, { x: 0, y: 0 });
    expect(frameSize({ width: 2048, height: 2048 }, placement, 256, 400)).toBe(400);
    expect(frameSize({ width: 350, height: 350 }, placement, 256, 400)).toBe(280);
    expect(frameSize({ width: 100, height: 100 }, placement, 256, 400)).toBe(256);
    expect(frameSize({ width: 2048, height: 2048 }, tokenCropPlacement(3, { x: 0, y: 0 }), 256, 400)).toBe(400);
  });

  it('place the image exactly where the crop editor shows it', () => {
    const aspect = { width: 1600, height: 900 };
    const scale = 1.7;
    const position = { x: 0.12, y: -0.08 };
    const size = 400;
    const actual = frameImageRect(aspect, tokenCropPlacement(scale, position), size);

    // The crop editor's rectangle in well units, mapped onto the square around the token circle.
    const well = renderedImageRect(scale, position, aspect);
    const origin = (1 - TOKEN_CROP_FRACTION) / 2;
    const pixelsPerUnit = size / TOKEN_CROP_FRACTION;
    expect(actual.left).toBeCloseTo((well.left - origin) * pixelsPerUnit, 9);
    expect(actual.top).toBeCloseTo((well.top - origin) * pixelsPerUnit, 9);
    expect(actual.width).toBeCloseTo(well.width * pixelsPerUnit, 9);
    expect(actual.height).toBeCloseTo(well.height * pixelsPerUnit, 9);
  });
});
