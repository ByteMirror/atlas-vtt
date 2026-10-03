import { describe, expect, it } from 'vitest';
import { placeLightPopover, type LightPopoverPlacementInput } from '../lightPopoverPlacement';

const size = { width: 272, height: 340 };
const area = { width: 1200, height: 800 };

/** A light with a bright ring of 100 px and a dim ring of 200 px, handles above and below it. */
function at(x: number, y: number, overrides: Partial<LightPopoverPlacementInput> = {}): LightPopoverPlacementInput {
  return {
    anchor: { x, y },
    markerClearance: 26,
    ringClearance: 112,
    bright: 100,
    handles: [{ x, y: y - 100 }, { x, y: y + 200 }],
    size,
    area,
    current: null,
    ...overrides,
  };
}

describe('placeLightPopover', () => {
  it('opens beyond the bright ring on the roomier side, level with the light, so the GM sees what he tunes', () => {
    expect(placeLightPopover(at(300, 400))).toMatchObject({ x: 412, y: 230, choice: { side: 'right', outside: true } });
    expect(placeLightPopover(at(900, 400))).toMatchObject({ x: 900 - 112 - 272, y: 230, choice: { side: 'left', outside: true } });
  });

  it('grows out of the light wherever it sits: the origin is the light within its box', () => {
    expect(placeLightPopover(at(300, 400)).origin).toEqual({ x: -112, y: 170 });
    expect(placeLightPopover(at(900, 400)).origin).toEqual({ x: 272 + 112, y: 170 });
  });

  it('takes the other side beyond the ring before it covers the bright area', () => {
    // Right of the ring it would cross the edge; left of it there is room.
    expect(placeLightPopover(at(850, 400, { area: { width: 1100, height: 800 } })).choice).toEqual({ side: 'left', outside: true });
  });

  it('sits beside the marker when the ring leaves no room beyond it', () => {
    const wide = at(600, 400, { ringClearance: 512, bright: 500, handles: [{ x: 600, y: -100 }, { x: 600, y: 1100 }] });
    expect(placeLightPopover(wide)).toMatchObject({ x: 626, choice: { side: 'right', outside: false } });
  });

  it('has no place beyond a ring that is no wider than the marker', () => {
    expect(placeLightPopover(at(300, 400, { ringClearance: 12, bright: 0 })).choice).toEqual({ side: 'right', outside: false });
  });

  it('keeps its place while it fits there, so it does not jump as the map pans or the light is tuned', () => {
    const current = { side: 'right' as const, outside: false };
    expect(placeLightPopover(at(800, 400, { current }))).toMatchObject({ choice: current, kept: true, x: 826 });
    const left = { side: 'left' as const, outside: true };
    expect(placeLightPopover(at(500, 400, { current: left }))).toMatchObject({ choice: left, kept: true });
  });

  it('leaves its place once it no longer fits there', () => {
    const placed = placeLightPopover(at(1000, 400, { current: { side: 'right', outside: false } }));
    expect(placed.kept).toBe(false);
    expect(placed.choice.side).toBe('left');
  });

  it('never covers a ring handle where another place avoids it', () => {
    // A view too narrow for either side: below the light it would lie on the dim ring's handle, above it is clear.
    const narrow = at(240, 500, { area: { width: 480, height: 900 }, handles: [{ x: 240, y: 440 }, { x: 240, y: 620 }], bright: 60, ringClearance: 72 });
    const placed = placeLightPopover(narrow);
    expect(placed.choice.side).toBe('above');
    expect(placed.y + size.height).toBeLessThanOrEqual(440 - 12);
  });

  it('goes below or above the light in a view too narrow for either side, centred on it', () => {
    const narrow = at(240, 200, { area: { width: 480, height: 900 }, handles: [], bright: 60, ringClearance: 72 });
    expect(placeLightPopover(narrow)).toMatchObject({ x: 104, y: 272, choice: { side: 'below', outside: true } });
  });

  it('keeps clear of the bars along the top and bottom of the view', () => {
    const inset = { top: 56, bottom: 88 };
    expect(placeLightPopover(at(300, 60, { inset })).y).toBe(64);
    expect(placeLightPopover(at(300, 780, { inset })).y).toBe(800 - 88 - 8 - 340);
    // The origin stays the light, also when the popover was pushed along it.
    expect(placeLightPopover(at(300, 780, { inset })).origin.y).toBe(780 - (800 - 88 - 8 - 340));
  });

  it('stays inside the view when the light is panned out of it', () => {
    expect(placeLightPopover(at(-500, 400)).x).toBe(8);
    expect(placeLightPopover(at(5000, 400)).x).toBe(1200 - 8 - 272);
    expect(placeLightPopover(at(300, -900)).y).toBe(8);
  });

  it('lands on whole pixels', () => {
    const placed = placeLightPopover(at(300.4, 400.7));
    expect(Number.isInteger(placed.x) && Number.isInteger(placed.y)).toBe(true);
  });
});
