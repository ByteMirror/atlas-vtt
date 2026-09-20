import { describe, it, expect } from 'vitest';
import { isViewportPanEnabled } from '../../src/app/pixi/utils/viewportPan';

describe('isViewportPanEnabled', () => {
  it('keeps right-drag pan alive for the draw tools', () => {
    expect(isViewportPanEnabled('draw-pen')).toBe(true);
    expect(isViewportPanEnabled('draw-eraser')).toBe(true);
    expect(isViewportPanEnabled('draw-icon')).toBe(true);
  });

  it('keeps pan alive for move and measure tools', () => {
    expect(isViewportPanEnabled('move')).toBe(true);
    expect(isViewportPanEnabled('measure-cone')).toBe(true);
  });

  it('pauses pan for tools that own the pointer', () => {
    expect(isViewportPanEnabled('fog')).toBe(false);
    expect(isViewportPanEnabled('text')).toBe(false);
    expect(isViewportPanEnabled('note-pin')).toBe(false);
  });
});
