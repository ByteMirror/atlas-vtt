import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatblockRenderer } from '../../src/app/react/components/statblock/StatblockRenderer';
import type {
  StatblockItem,
  StatblockLayout,
} from '../../src/app/react/components/statblock/statblockTypes';

/** The shape of the 5.5e layout: a header block, the ability table, then sections. */
const header: StatblockItem = {
  type: 'inline',
  id: 'header',
  properties: [],
  nested: [
    { type: 'image', id: 'image', properties: ['image'] },
    {
      type: 'inline',
      id: 'titles',
      properties: [],
      nested: [
        { type: 'heading', id: 'name', properties: ['name'], size: 1 },
        { type: 'subheading', id: 'sub', properties: ['size', 'type'], separator: ', ' },
      ],
    },
  ],
};

const statsTable: StatblockItem = { type: 'table', id: 'stats', properties: ['stats'] };

function layoutOf(overrides: Partial<StatblockLayout> = {}): StatblockLayout {
  return {
    name: '5.5e Layout',
    id: 'five-five',
    columns: 2,
    forceColumns: true,
    columnWidth: 380,
    blocks: [header, statsTable],
    ...overrides,
  };
}

const monster = {
  name: 'Aboleth',
  size: 'Large',
  type: 'aberration',
  stats: [21, 9, 15, 18, 15, 18],
  saves: ['Dex +5', 'Int +8', 'Wis +6'],
};

const portrait = { src: 'app://local/tokens/aboleth.webp' };

describe('statblock presentation', () => {
  describe('following the layout', () => {
    it('flows into the columns the layout declares', () => {
      const { container } = render(
        <StatblockRenderer layout={layoutOf()} monster={monster} presentation="source" />,
      );

      const flow = container.querySelector<HTMLElement>('.atlas-sb-flow');
      expect(flow?.hasAttribute('data-columns')).toBe(true);

      const card = container.querySelector<HTMLElement>('.atlas-statblock');
      expect(card?.style.getPropertyValue('--atlas-sb-columns')).toBe('2');
      // Columns appear from a readable width, not the generous one the layout asks.
      expect(card?.style.getPropertyValue('--atlas-sb-column-width')).toBe('340px');
      // 2 × 380 + one 24px gap + the card's 2 × 16px padding.
      expect(card?.style.getPropertyValue('--atlas-sb-max-width')).toBe('816px');
    });

    it('leaves a layout that asks for one column without a column flow', () => {
      const { container } = render(
        <StatblockRenderer
          layout={layoutOf({ columns: 1 })}
          monster={monster}
          presentation="source"
        />,
      );

      expect(container.querySelector('.atlas-sb-flow')?.hasAttribute('data-columns')).toBe(false);
      expect(
        container.querySelector<HTMLElement>('.atlas-statblock')?.style.getPropertyValue('--atlas-sb-columns'),
      ).toBe('');
    });

    it('gives a layout that declares no columns the two Fantasy Statblocks defaults to', () => {
      // The built-in Basic 5e Layout declares neither; Fantasy Statblocks still
      // fits two columns into a wide enough container.
      const { container } = render(
        <StatblockRenderer
          layout={{ name: 'Basic 5e Layout', id: 'basic-5e-layout', blocks: [statsTable] }}
          monster={monster}
          presentation="source"
        />,
      );

      const card = container.querySelector<HTMLElement>('.atlas-statblock');
      expect(container.querySelector('.atlas-sb-flow')?.hasAttribute('data-columns')).toBe(true);
      expect(card?.style.getPropertyValue('--atlas-sb-columns')).toBe('2');
      // 2 × the 400px default + one 24px gap + the card's 2 × 16px padding.
      expect(card?.style.getPropertyValue('--atlas-sb-max-width')).toBe('856px');
    });

    it("lets a creature override its layout's columns, as Fantasy Statblocks does", () => {
      const { container } = render(
        <StatblockRenderer
          layout={layoutOf()}
          monster={{ ...monster, columns: 1 }}
          presentation="source"
        />,
      );

      expect(container.querySelector('.atlas-sb-flow')?.hasAttribute('data-columns')).toBe(false);
    });

    it("reads a creature's columnWidth written as a CSS length", () => {
      const { container } = render(
        <StatblockRenderer
          layout={layoutOf()}
          monster={{ ...monster, columnWidth: '300px' }}
          presentation="source"
        />,
      );

      const card = container.querySelector<HTMLElement>('.atlas-statblock');
      expect(card?.style.getPropertyValue('--atlas-sb-column-width')).toBe('300px');
      expect(card?.style.getPropertyValue('--atlas-sb-max-width')).toBe('656px');
    });

    it("puts the token's artwork in the layout's own image slot", () => {
      const { container } = render(
        <StatblockRenderer
          layout={layoutOf()}
          monster={monster}
          portrait={portrait}
          presentation="source"
        />,
      );

      const slot = container.querySelector('.atlas-sb-item[data-type="image"] .atlas-token-portrait');
      expect(slot).not.toBeNull();
      // ...and not also floated beside the heading.
      expect(container.querySelectorAll('.atlas-token-portrait')).toHaveLength(1);
    });

    it('stacks a heading over its subheading', () => {
      const { container } = render(
        <StatblockRenderer layout={layoutOf()} monster={monster} presentation="source" />,
      );

      const titles = container.querySelector('.atlas-sb-inline--titles');
      expect(titles).not.toBeNull();
      // The header row itself is not a title stack; it also holds the artwork.
      expect(container.querySelectorAll('.atlas-sb-inline--titles')).toHaveLength(1);
    });
  });

  describe("Atlas' own presentation", () => {
    it('ignores the layout\'s columns and floats the portrait', () => {
      const { container } = render(
        <StatblockRenderer
          layout={layoutOf()}
          monster={monster}
          portrait={portrait}
          presentation="atlas"
        />,
      );

      expect(container.querySelector('.atlas-sb-flow')?.hasAttribute('data-columns')).toBe(false);
      expect(container.querySelector('.atlas-statblock-body > .atlas-sb-portrait')).not.toBeNull();
    });
  });

  describe('ability scores', () => {
    it('draws a headerless stats table as the 2024 grid, in both presentations', () => {
      for (const presentation of ['source', 'atlas'] as const) {
        const { container } = render(
          <StatblockRenderer layout={layoutOf()} monster={monster} presentation={presentation} />,
        );

        const rows = container.querySelectorAll('.atlas-sb-ability-table tbody tr');
        expect(rows).toHaveLength(6);
        expect(container.querySelectorAll('.atlas-sb-ability-table')).toHaveLength(2);
      }
    });

    it('rolls each modifier and save as a d20, named for the toast', () => {
      const { container } = render(
        <StatblockRenderer layout={layoutOf()} monster={monster} presentation="source" />,
      );

      const links = Array.from(
        container.querySelectorAll<HTMLElement>('.atlas-sb-ability-table .atlas-dice-link'),
      );

      const strCheck = links.find((link) => link.dataset.ability === 'Strength check');
      expect(strCheck?.textContent).toBe('+5');
      expect(strCheck?.dataset.formula).toBe('1d20+5');

      // Not proficient, so the save repeats the modifier.
      const strSave = links.find((link) => link.dataset.ability === 'Strength save');
      expect(strSave?.textContent).toBe('+5');
      expect(strSave?.hasAttribute('data-proficient')).toBe(false);

      // Proficient: the creature's own bonus, not the modifier.
      const intSave = links.find((link) => link.dataset.ability === 'Intelligence save');
      expect(intSave?.textContent).toBe('+8');
      expect(intSave?.dataset.formula).toBe('1d20+8');
      expect(intSave?.hasAttribute('data-proficient')).toBe(true);
    });

    it('keeps the plain table when the layout names its own headers', () => {
      const { container } = render(
        <StatblockRenderer
          layout={layoutOf({
            blocks: [{ ...statsTable, headers: ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'], calculate: true }],
          })}
          monster={monster}
          presentation="source"
        />,
      );

      expect(container.querySelector('.atlas-sb-abilities')).toBeNull();
      expect(container.querySelectorAll('.atlas-sb-table th')).toHaveLength(6);
    });

    it('falls back to the plain table for a creature without ability scores', () => {
      const { container } = render(
        <StatblockRenderer
          layout={layoutOf({ blocks: [statsTable] })}
          monster={{ name: 'Adversary', stats: ['a', 'b'] }}
          presentation="source"
        />,
      );

      expect(container.querySelector('.atlas-sb-abilities')).toBeNull();
      expect(container.querySelector('.atlas-sb-table')).not.toBeNull();
    });
  });
});
