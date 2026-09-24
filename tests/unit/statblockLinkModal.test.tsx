import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/react/components/FantasyStatblock', () => ({
  default: ({ notePath, tokens }: { notePath: string; tokens: Array<{ imagePath?: string }> }) => (
    <div data-testid="statblock" data-portrait={tokens[0]?.imagePath}>{notePath}</div>
  ),
}));

import StatblockLinkModal from '../../src/app/packages/components/asset-manager/StatblockLinkModal';
import {
  describeCreature,
  filterStatblockEntries,
  statblockEntries,
} from '../../src/app/packages/components/asset-manager/statblock-link/statblockEntries';

type Handler = () => void;

const CREATURES = [
  { name: 'Aboleth', path: 'Bestiary/Aboleth.md', size: 'Large', type: 'Aberration', cr: 10 },
  { name: 'Adult Red Dragon', path: 'Bestiary/Adult Red Dragon.md', size: 'Huge', type: 'Dragon', cr: 17 },
  { name: 'Acid Burrower', path: 'atlas-vtt/statblocks/Acid Burrower.md', type: 'Solo', tier: 1 },
  { name: 'Dragon Turtle', path: 'Bestiary/Dragon Turtle.md', size: 'Gargantuan', type: 'Dragon', cr: 17 },
  { name: 'Inline Only' },
];

function fakeApp(): { app: never; trigger: (event: string) => void } {
  const handlers = new Map<string, Handler[]>();
  const app = {
    workspace: {
      on: (event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return { event, handler };
      },
      offref: () => undefined,
    },
  } as never;
  return { app, trigger: (event) => handlers.get(event)?.forEach((handler) => handler()) };
}

function installBestiary(creatures: unknown[], resolved = true): void {
  (window as never as Record<string, unknown>).FantasyStatblocks = {
    getBestiaryCreatures: () => creatures,
    isResolved: () => resolved,
  };
}

function open(statblockPath?: string): { onLink: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onLink = vi.fn();
  const onClose = vi.fn();
  render(
    <StatblockLinkModal
      isOpen
      onClose={onClose}
      asset={{ name: 'Red Dragon Token', ...(statblockPath ? { statblockPath } : {}) }}
      onLink={onLink}
      app={fakeApp().app}
    />,
  );
  return { onLink, onClose };
}

const search = (): HTMLInputElement => screen.getByRole('combobox');
const optionNames = (): string[] =>
  screen.queryAllByRole('option').map((option) => option.querySelector('.atlas-statblock-link__option-name')?.textContent ?? '');

// jsdom has no layout; the list scrolls its active row into view.
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => {
  cleanup();
  delete (window as never as Record<string, unknown>).FantasyStatblocks;
});

describe('statblock entries', () => {
  it('describes a creature by kind and rating, whatever its system', () => {
    expect(describeCreature({ name: 'A', size: 'Huge', type: 'Dragon', cr: 16 })).toBe('Huge Dragon · CR 16');
    expect(describeCreature({ name: 'B', type: 'Solo', tier: 1 })).toBe('Solo · Tier 1');
    expect(describeCreature({ name: 'C', level: '3' })).toBe('Level 3');
    expect(describeCreature({ name: 'D', type: { nested: true } })).toBe('');
  });

  it('keeps note-backed creatures only, sorted by name, falling back to the folder', () => {
    const entries = statblockEntries([...CREATURES, { name: 'Bare', path: 'Monsters/Bare.md' }]);
    expect(entries.map((entry) => entry.name)).toEqual(['Aboleth', 'Acid Burrower', 'Adult Red Dragon', 'Bare', 'Dragon Turtle']);
    expect(entries.find((entry) => entry.name === 'Bare')?.detail).toBe('Monsters');
  });

  it('matches every word against name and detail, names starting with the query first', () => {
    const entries = statblockEntries(CREATURES);
    expect(filterStatblockEntries(entries, 'drag').map((entry) => entry.name)).toEqual(['Dragon Turtle', 'Adult Red Dragon']);
    expect(filterStatblockEntries(entries, 'dragon cr 17').map((entry) => entry.name)).toEqual(['Adult Red Dragon', 'Dragon Turtle']);
    expect(filterStatblockEntries(entries, 'tier')).toHaveLength(1);
  });
});

describe('StatblockLinkModal', () => {
  it('selects the linked statblock, marks it and previews it', () => {
    installBestiary(CREATURES);
    open('Bestiary/Adult Red Dragon.md');

    const selected = screen.getByRole('option', { selected: true });
    expect(selected.textContent).toContain('Adult Red Dragon');
    expect(selected.textContent).toContain('Linked');
    expect(screen.getByTestId('statblock').textContent).toBe('Bestiary/Adult Red Dragon.md');
    expect(screen.getByRole('button', { name: 'Link' })).toHaveProperty('disabled', true);
  });

  it('filters as you type and links the active result with Enter', () => {
    installBestiary(CREATURES);
    const { onLink, onClose } = open();

    fireEvent.change(search(), { target: { value: 'dragon' } });
    expect(optionNames()).toEqual(['Dragon Turtle', 'Adult Red Dragon']);

    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onLink).toHaveBeenCalledWith('Bestiary/Adult Red Dragon.md');
    expect(onClose).toHaveBeenCalled();
  });

  it('selects on click and links on double click', () => {
    installBestiary(CREATURES);
    const { onLink } = open();

    fireEvent.click(screen.getByText('Dragon Turtle'));
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('Dragon Turtle');
    expect(onLink).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByText('Aboleth'));
    expect(onLink).toHaveBeenCalledWith('Bestiary/Aboleth.md');
  });

  it("previews the statblock with the token's art as its portrait", () => {
    installBestiary(CREATURES);
    render(
      <StatblockLinkModal
        isOpen
        onClose={vi.fn()}
        asset={{ name: 'Red Dragon Token', imagePath: 'tokens/red-dragon.webp' }}
        onLink={vi.fn()}
        app={fakeApp().app}
      />,
    );
    expect(screen.getByTestId('statblock').dataset.portrait).toBe('tokens/red-dragon.webp');
  });

  it('unlinks the current statblock', () => {
    installBestiary(CREATURES);
    const { onLink } = open('Bestiary/Aboleth.md');

    fireEvent.click(screen.getByRole('button', { name: /Unlink/ }));
    expect(onLink).toHaveBeenCalledWith(null);
  });

  it('explains a missing Fantasy Statblocks plugin', () => {
    open();
    expect(screen.getByText(/Install and enable the Fantasy Statblocks plugin/)).toBeTruthy();
    expect(search().disabled).toBe(true);
  });

  it('shows the creatures once the bestiary resolves', () => {
    installBestiary([], false);
    const { app, trigger } = fakeApp();
    render(<StatblockLinkModal isOpen onClose={vi.fn()} asset={{ name: 'Token' }} onLink={vi.fn()} app={app} />);
    expect(screen.getByText('Loading statblocks…')).toBeTruthy();

    installBestiary(CREATURES);
    act(() => trigger('fantasy-statblocks:bestiary:resolved'));
    expect(optionNames()).toHaveLength(4);
  });
});
