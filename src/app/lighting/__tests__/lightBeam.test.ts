import { describe, expect, it } from 'vitest';
import { beamOf, directionTo, snapDirection, withBeam } from '../lightBeam';
import { LIGHT_PRESETS } from '../lightPresets';

const TORCH = LIGHT_PRESETS.torch.emission;

describe('a light\'s beam', () => {
  it('stores the angle it shines, and none for a light that shines all around', () => {
    expect(withBeam(TORCH, 60).angle).toBe(60);
    expect(withBeam({ ...TORCH, angle: 60 }, 360)).toEqual(TORCH);
    expect('angle' in withBeam({ ...TORCH, angle: 60 }, 360)).toBe(false);
    expect(withBeam(TORCH, 360)).toBe(TORCH);
    const lantern = { ...TORCH, angle: 60 };
    expect(withBeam(lantern, 60)).toBe(lantern);
  });

  it('faces up at rotation 0 and turns clockwise, as a token does', () => {
    expect(beamOf({ emission: { ...TORCH, angle: 90 } })).toEqual({ facing: -Math.PI / 2, angle: Math.PI / 2 });
    expect(beamOf({ rotation: 90, emission: { ...TORCH, angle: 90 } })!.facing).toBeCloseTo(0);
    expect(beamOf({ rotation: 90, emission: { ...TORCH, angle: 90 } }, 35)!.apex).toBe(35);
  });

  it('has no beam when it shines all around, and never as a source of darkness', () => {
    expect(beamOf({ rotation: 90, emission: TORCH })).toBeUndefined();
    expect(beamOf({ rotation: 90, emission: { ...TORCH, angle: 90, darkness: true } })).toBeUndefined();
  });

  it('reads the direction from the light to a point as a rotation', () => {
    const light = { x: 100, y: 100 };
    expect(directionTo(light, { x: 100, y: 0 })).toBeCloseTo(0);
    expect(directionTo(light, { x: 200, y: 100 })).toBeCloseTo(90);
    expect(directionTo(light, { x: 100, y: 200 })).toBeCloseTo(180);
    expect(directionTo(light, { x: 0, y: 100 })).toBeCloseTo(270);
  });

  it('snaps a direction to five degrees, to whole degrees with Alt, within one turn', () => {
    expect(snapDirection(93.4, false)).toBe(95);
    expect(snapDirection(93.4, true)).toBe(93);
    expect(snapDirection(-10, false)).toBe(350);
    expect(snapDirection(358, false)).toBe(0);
    expect(snapDirection(725, false)).toBe(5);
  });
});
