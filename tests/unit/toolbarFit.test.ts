import { describe, expect, it } from 'vitest';
import { overflowingToolbarItems, type ToolbarFitItem, type ToolbarFitLayout } from '../../src/app/packages/components/toolbar/toolbarFit';

const item = (id: string, priority: number, width: number | undefined = 40, pinned = false): ToolbarFitItem => ({ id, priority, width, pinned });

// 8px padding + 1px border on each side, 8px gaps, a 40px overflow button.
const layout = (available: number): ToolbarFitLayout => ({ available, chrome: 18, gap: 8, overflowButtonWidth: 40 });

const ITEMS = [item('move', 100), item('fog', 85), item('draw', 65), item('measure', 90), item('palette', 55)];
// All five: 18 + 5 * 40 + 4 * 8 = 250px.

describe('overflowingToolbarItems', () => {
  it('hides nothing while every item fits', () => {
    expect(overflowingToolbarItems(ITEMS, layout(250)).size).toBe(0);
  });

  it('hides nothing while the width is unconstrained', () => {
    expect(overflowingToolbarItems(ITEMS, layout(Number.POSITIVE_INFINITY)).size).toBe(0);
  });

  it('moves the lowest priorities out first and leaves room for the overflow button', () => {
    // 249px: 18 + 40 (button) + 48 per kept item leaves room for three.
    expect([...overflowingToolbarItems(ITEMS, layout(249))]).toEqual(['draw', 'palette']);
    // One pixel short of three items with the button: two stay.
    expect([...overflowingToolbarItems(ITEMS, layout(201))]).toEqual(['fog', 'draw', 'palette']);
  });

  it('never hides a pinned item, even when it has a low priority', () => {
    const items = ITEMS.map((entry) => (entry.id === 'palette' ? { ...entry, pinned: true } : entry));
    expect([...overflowingToolbarItems(items, layout(202))]).toEqual(['fog', 'draw']);
  });

  it('keeps pinned items when they alone are too wide', () => {
    const items = [item('move', 100, 40, true), item('fog', 85, 40, true), item('draw', 65)];
    expect([...overflowingToolbarItems(items, layout(60))]).toEqual(['draw']);
  });

  it('keeps items that have not been measured yet so they can be', () => {
    const items = [item('move', 100), { id: 'new', priority: 1, width: undefined, pinned: false }, item('draw', 65, 60)];
    expect([...overflowingToolbarItems(items, layout(120))]).toEqual(['draw']);
  });

  it('stops at the first item that does not fit instead of skipping to a narrower one', () => {
    const items = [item('wide', 100, 120), item('narrow', 10, 20)];
    // Button + narrow would fit (18 + 40 + 28 = 86), but the wider, more important item goes first.
    expect([...overflowingToolbarItems(items, layout(100))]).toEqual(['wide', 'narrow']);
  });

  it('hides later items first among equal priorities', () => {
    const items = [item('a', 50), item('b', 50), item('c', 50)];
    expect([...overflowingToolbarItems(items, layout(153))]).toEqual(['b', 'c']);
  });
});
