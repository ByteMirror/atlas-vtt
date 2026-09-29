import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Circle } from 'lucide-react';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { ResponsiveToolbar } from '../../src/app/packages/components/toolbar/ResponsiveToolbar';
import { ToolbarSpaceContext } from '../../src/app/packages/components/toolbar/toolbarSpace';
import type { ResponsiveToolbarItem } from '../../src/app/packages/components/toolbar/toolbarTypes';

// jsdom lays nothing out: every toolbar control and the overflow button measure 40px.
const CONTROL_WIDTH = 40;
let offsetWidth: PropertyDescriptor | undefined;

beforeEach(() => {
  offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.matches('[data-toolbar-item], .atlas-toolbar-overflow, .atlas-toolbar-end') ? CONTROL_WIDTH : 0;
    },
  });
});

afterEach(() => {
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
});

function makeItem(id: string, priority: number, onSelect = vi.fn(), pinned = false): ResponsiveToolbarItem {
  return {
    id,
    priority,
    pinned,
    element: <button type="button">{`${id} button`}</button>,
    menuEntry: { icon: Circle, label: `${id} tool`, isActive: false, onSelect },
  };
}

function renderToolbar(items: ResponsiveToolbarItem[], space: number | null, end?: React.ReactNode) {
  return render(
    <TooltipProvider>
      <ToolbarSpaceContext.Provider value={space}>
        <ResponsiveToolbar items={items} end={end} />
      </ToolbarSpaceContext.Provider>
    </TooltipProvider>,
  );
}

const visibleIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-toolbar-item]:not([hidden])')).map((el) => el.dataset.toolbarItem ?? '');

const ITEMS = (): ResponsiveToolbarItem[] => [
  makeItem('move', 100), makeItem('fog', 85), makeItem('draw', 65), makeItem('measure', 90), makeItem('palette', 55),
];

describe('ResponsiveToolbar', () => {
  it('shows every control while nothing constrains its width', () => {
    const { container } = renderToolbar(ITEMS(), null);
    expect(visibleIds(container)).toEqual(['move', 'fog', 'draw', 'measure', 'palette']);
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull();
  });

  it('keeps the highest priorities in bar order and moves the rest into the menu', () => {
    // 130px: the overflow button (40) and two controls (80).
    const { container } = renderToolbar(ITEMS(), 130);
    expect(visibleIds(container)).toEqual(['move', 'measure']);

    const more = screen.getByRole('button', { name: 'More tools' });
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the end control last, after the overflow button, and reserves its width', () => {
    // 170px: the end control (40), the overflow button (40) and two controls (80).
    const { container } = renderToolbar(ITEMS(), 170, <button type="button">GM view</button>);
    expect(visibleIds(container)).toEqual(['move', 'measure']);

    const bar = container.querySelector('.atlas-vtt-toolbar')!;
    const lastTwo = Array.from(bar.children).slice(-2).map((el) => el.className);
    expect(lastTwo).toEqual(['atlas-toolbar-overflow', 'atlas-toolbar-end']);
    expect(within(bar.lastElementChild as HTMLElement).getByRole('button', { name: 'GM view' })).toBeTruthy();
  });

  it('never moves a pinned control into the menu', () => {
    const items = ITEMS().map((item) => (item.id === 'palette' ? { ...item, pinned: true } : item));
    const { container } = renderToolbar(items, 130);
    expect(visibleIds(container)).toEqual(['move', 'palette']);
  });

  it('lists the hidden controls in the menu and selects one', () => {
    const selectDraw = vi.fn();
    const items = ITEMS().map((item) => (item.id === 'draw' ? makeItem('draw', 65, selectDraw) : item));
    renderToolbar(items, 130);

    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    const menu = screen.getByRole('menu', { name: 'More tools' });
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['fog tool', 'draw tool', 'palette tool']);

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'draw tool' }));
    expect(selectDraw).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu on a press outside it and on Escape', () => {
    renderToolbar(ITEMS(), 130);
    const more = screen.getByRole('button', { name: 'More tools' });

    fireEvent.click(more);
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(more);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus through the menu with the arrow keys', () => {
    renderToolbar(ITEMS(), 130);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    const [fog, draw, palette] = within(screen.getByRole('menu')).getAllByRole('menuitem');

    fog!.focus();
    fireEvent.keyDown(fog!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(draw);
    fireEvent.keyDown(draw!, { key: 'End' });
    expect(document.activeElement).toBe(palette);
    fireEvent.keyDown(palette!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(fog);
  });

  it('brings controls back when the bar gets room again', () => {
    const items = ITEMS();
    const view = renderToolbar(items, 130);
    view.rerender(
      <TooltipProvider>
        <ToolbarSpaceContext.Provider value={400}>
          <ResponsiveToolbar items={items} />
        </ToolbarSpaceContext.Provider>
      </TooltipProvider>,
    );
    expect(visibleIds(view.container)).toEqual(['move', 'fog', 'draw', 'measure', 'palette']);
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull();
  });
});
