import { describe, expect, it } from 'vitest';
import { scrollWithin } from '../../src/app/utils/scrollWithin';

/** A list 100 px high whose top is at y = 200, scrolled by `scrollTop`, and an element at `top` of its content. */
function list(scrollTop: number, top: number, height: number): { container: HTMLElement; element: Element } {
  const container = { scrollTop, getBoundingClientRect: () => ({ top: 200, bottom: 300 }) } as unknown as HTMLElement;
  const element = { getBoundingClientRect: () => ({ top: 200 + top - scrollTop, bottom: 200 + top - scrollTop + height }) } as unknown as Element;
  return { container, element };
}

function scrolled(scrollTop: number, top: number, height: number, block: 'start' | 'nearest'): number {
  const { container, element } = list(scrollTop, top, height);
  scrollWithin(container, element, block);
  return container.scrollTop;
}

describe('scrollWithin', () => {
  it('leaves the list alone while the element shows whole', () => {
    expect(scrolled(50, 60, 40, 'nearest')).toBe(50);
  });

  it('scrolls no farther than it takes to show an element below or above', () => {
    expect(scrolled(0, 150, 40, 'nearest')).toBe(90);
    expect(scrolled(200, 150, 40, 'nearest')).toBe(150);
  });

  it('shows the top of an element taller than the list', () => {
    expect(scrolled(0, 150, 300, 'nearest')).toBe(150);
  });

  it('puts the element at the top of the list where asked', () => {
    expect(scrolled(0, 60, 40, 'start')).toBe(60);
    expect(scrolled(200, 60, 40, 'start')).toBe(60);
  });
});
