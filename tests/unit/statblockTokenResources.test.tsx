import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatblockTokenResources } from '../../src/app/react/components/statblock/StatblockTokenResources';

const layout = { id: 'daggerheart-adversary', name: 'Daggerheart Adversary', blocks: [] };
const monster = { name: 'Acid Burrower', hp: 8, stress: 3 };
const tokens = [1, 2, 3, 4].map((n) => ({ id: `token-${n}`, name: monster.name, instanceNumber: n,
  hp: { current: n === 1 ? 5 : 8, max: 8 }, stress: 0, maxStress: 3 }));
const actions = () => ({ onLocateToken: vi.fn(), onHoverToken: vi.fn(), onUpdateToken: vi.fn() });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('per-token statblock controls', () => {
  it('identifies and locates individual tokens without conflating identical names', () => {
    const handlers = actions();
    render(<StatblockTokenResources {...handlers} monster={monster} layout={layout} tokens={tokens} />);
    const name = screen.getByRole('button', { name: 'Locate Acid Burrower #2 on map' });
    fireEvent.mouseEnter(name);
    expect(handlers.onHoverToken).toHaveBeenCalledWith('token-2');
    fireEvent.click(name);
    expect(handlers.onLocateToken).toHaveBeenCalledWith('token-2');
    expect(handlers.onUpdateToken).not.toHaveBeenCalled();
  });

  it('updates damage and stress pips on only the chosen token', () => {
    const handlers = actions();
    const { rerender } = render(<StatblockTokenResources {...handlers} monster={monster} layout={layout} tokens={tokens} />);
    const first = screen.getByRole('group', { name: 'Acid Burrower #1' });
    fireEvent.click(within(first).getByRole('checkbox', { name: 'HP damage 4 of 8' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('token-1', { hp: { current: 4, max: 8 } });
    rerender(<StatblockTokenResources {...handlers} monster={monster} layout={layout}
      tokens={[{ ...tokens[0]!, hp: { current: 4, max: 8 } }, ...tokens.slice(1)]} />);
    fireEvent.click(within(first).getByRole('checkbox', { name: 'HP damage 4 of 8' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('token-1', { hp: { current: 5, max: 8 } });
    const second = screen.getByRole('group', { name: 'Acid Burrower #2' });
    fireEvent.click(within(second).getByRole('checkbox', { name: 'Stress 2 of 3' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('token-2', { stress: 2, maxStress: 3 });
    expect(handlers.onLocateToken).not.toHaveBeenCalled();
  });

  it('gives numeric HP and other resources gauges with bounded plus/minus controls', () => {
    const handlers = actions();
    render(<StatblockTokenResources {...handlers} monster={{ name: 'Mage', hp: 27, mana: 6 }}
      layout={{ ...layout, id: 'basic' }} tokens={[{ id: 'mage', hp: { current: 0, max: 27 } }]} />);
    expect((screen.getByRole('button', { name: 'Decrease HP' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('meter', { name: 'HP' }).getAttribute('aria-valuenow')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Increase HP' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('mage', { hp: { current: 1, max: 27 } });
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Mana' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('mage', { statblockResources: { mana: { current: 5, max: 6 } } });
  });

  it('keeps map instance numbers after another token is removed', () => {
    render(<StatblockTokenResources {...actions()} monster={monster} layout={layout} tokens={tokens.slice(1, 3)} />);
    expect(screen.getByRole('button', { name: 'Locate Acid Burrower #2 on map' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Locate Acid Burrower #3 on map' })).toBeTruthy();
  });

  it('avoids duplicate labels for tokens whose artwork-based instance numbers collide', () => {
    render(<StatblockTokenResources {...actions()} monster={monster} layout={layout}
      tokens={tokens.slice(0, 2).map((token) => ({ ...token, instanceNumber: 1 }))} />);
    expect(screen.getAllByRole('button', { name: 'Locate Acid Burrower #1 on map' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Locate Acid Burrower #2 on map' })).toBeTruthy();
  });

  it('limits the list to three entries and enables scrolling only when more exist', () => {
    const { container, rerender } = render(<StatblockTokenResources {...actions()} monster={monster} layout={layout} tokens={tokens} />);
    expect(container.querySelector('.atlas-sb-token-list')?.getAttribute('data-scrollable')).toBe('true');
    expect(screen.getAllByRole('group')).toHaveLength(4);
    rerender(<StatblockTokenResources {...actions()} monster={monster} layout={layout} tokens={tokens.slice(0, 3)} />);
    expect(container.querySelector('.atlas-sb-token-list')?.getAttribute('data-scrollable')).toBe('false');
  });
});


it('measures three full entries independently of the dashboard entrance transform', () => {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('atlas-sb-token-entry') ? Array.from(this.parentElement!.children).indexOf(this) * 105 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(105);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.offsetTop * 0.97;
    return { top, bottom: top + 105 * 0.97 } as DOMRect;
  });
  const { container } = render(<StatblockTokenResources {...actions()} monster={monster} layout={layout} tokens={tokens} />);
  expect((container.querySelector('.atlas-sb-token-list') as HTMLElement).style.maxHeight).toBe('315px');
});
