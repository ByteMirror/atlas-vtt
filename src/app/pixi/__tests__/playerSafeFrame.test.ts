import { describe, expect, it, vi } from 'vitest';
import { captureWithoutLayers, captureWithLayerVisibility } from '../playerSafeFrame';

describe('captureWithoutLayers', () => {
  it('captures a frame rendered without the DM-only layers, then restores them', () => {
    const pins = { visible: true };
    const alreadyHidden = { visible: false };
    const events: string[] = [];

    captureWithoutLayers(
      [pins, alreadyHidden],
      () => events.push(`render:${pins.visible ? 'pins' : 'no-pins'}`),
      () => events.push(`capture:${pins.visible ? 'pins' : 'no-pins'}`)
    );

    expect(events).toEqual(['render:no-pins', 'capture:no-pins', 'render:pins']);
    expect(pins.visible).toBe(true);
    expect(alreadyHidden.visible).toBe(false);
  });

  it('restores the layers even when capturing throws', () => {
    const pins = { visible: true };
    expect(() => captureWithoutLayers([pins], () => undefined, () => { throw new Error('boom'); })).toThrow('boom');
    expect(pins.visible).toBe(true);
  });

  it('skips the extra renders when nothing needs hiding', () => {
    let renders = 0;
    let captures = 0;
    captureWithoutLayers([{ visible: false }], () => { renders++; }, () => { captures++; });
    expect([renders, captures]).toEqual([0, 1]);
  });
});

describe('captureWithLayerVisibility', () => {
  it('renders opaque fog for players even when no visibility flags change, then restores the DM preview', () => {
    const fog = { visible: true, alpha: 0.5 };
    const events: string[] = [];

    captureWithLayerVisibility(
      [{ layer: fog, visible: true, alpha: 1 }],
      () => events.push(`render:${fog.alpha}`),
      () => events.push(`capture:${fog.alpha}`),
    );

    expect(events).toEqual(['render:1', 'capture:1', 'render:0.5']);
    expect(fog.alpha).toBe(0.5);
  });

  it.each(['render', 'capture'])('restores fog opacity when %s fails', (failure) => {
    const fog = { visible: true, alpha: 0.5 };
    const render = vi.fn(() => {
      if (failure === 'render' && fog.alpha === 1) throw new Error('failed');
    });

    expect(() => captureWithLayerVisibility(
      [{ layer: fog, visible: true, alpha: 1 }], render, () => {
        expect(fog.alpha).toBe(1);
        if (failure === 'capture') throw new Error('failed');
      },
    )).toThrow('failed');
    expect(fog.alpha).toBe(0.5);
    expect(fog.visible).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('can show player layers and hide DM layers, restoring both after a failed capture', () => {
    const dm = { visible: true };
    const player = { visible: false };
    const render = vi.fn();
    expect(() => captureWithLayerVisibility([
      { layer: dm, visible: false }, { layer: player, visible: true },
    ], render, () => {
      expect(dm.visible).toBe(false);
      expect(player.visible).toBe(true);
      throw new Error('capture failed');
    })).toThrow('capture failed');
    expect(dm.visible).toBe(true);
    expect(player.visible).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
