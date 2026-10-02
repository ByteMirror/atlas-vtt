import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatblockRenderer } from '../../src/app/react/components/statblock/StatblockRenderer';
import type { StatblockLayout } from '../../src/app/react/components/statblock/statblockTypes';
import layoutJson from './fixtures/fiveFiveLayout.json';

/**
 * The 5.5e layout as Fantasy Statblocks stores it, against a creature that uses
 * every section of it. Guards the sections a layout reaches through a `group`
 * or a nested list, which a hand-built fixture would not cover.
 */
const layout = layoutJson as unknown as StatblockLayout;

const dragon = {
  name: 'Ancient Blue Dragon',
  size: 'Gargantuan',
  type: 'dragon',
  subtype: 'chromatic',
  alignment: 'Lawful Evil',
  ac: 22,
  hp: 481,
  hit_dice: '26d20 + 208',
  speed: '40 ft., Burrow 40 ft., Fly 80 ft.',
  initiative: '+14 (24)',
  stats: [29, 10, 27, 18, 17, 25],
  saves: [{ dexterity: 7 }, { wisdom: 10 }],
  skillsaves: [{ perception: 17 }, { stealth: 7 }],
  immunities: 'Lightning',
  senses: 'Blindsight 60 ft., Darkvision 120 ft.',
  passive: 27,
  languages: 'Common, Draconic',
  cr: '23',
  traits: [
    {
      name: 'Legendary Resistance (4/Day, or 5/Day in Lair)',
      desc: 'If the dragon fails a saving throw, it can choose to succeed instead.',
    },
  ],
  actions: [
    { name: 'Multiattack', desc: 'The dragon makes three Rend attacks.' },
    {
      name: 'Spellcasting',
      desc: 'The dragon casts one of the following spells (spell save DC 22):\n- **At Will:** Detect Magic, Invisibility\n- **1/Day Each:** Scrying, Sending',
    },
  ],
  legendary_description:
    '<span class="legendary-uses">Legendary Action Uses: 3 (4 in Lair).</span>',
  legendary_actions: [
    { name: 'Cloaked Flight', desc: 'The dragon uses Spellcasting to cast Invisibility on itself.' },
    { name: 'Sonic Boom', desc: 'The dragon uses Spellcasting to cast Shatter.' },
    { name: 'Tail Swipe', desc: 'The dragon makes one Rend attack.' },
  ],
};

describe('the 5.5e layout', () => {
  it('renders every section the creature fills', () => {
    const { container } = render(
      <StatblockRenderer layout={layout} monster={dragon} presentation="source" />,
    );
    const text = container.textContent ?? '';

    expect(text).toContain('Ancient Blue Dragon');
    expect(text).toContain('Legendary Resistance');
    expect(text).toContain('Multiattack');
    expect(text).toContain('Spellcasting');
  });

  it('renders the Legendary Actions group, heading and entries', () => {
    const { container } = render(
      <StatblockRenderer layout={layout} monster={dragon} presentation="source" />,
    );
    const text = container.textContent ?? '';

    expect(text).toContain('Legendary Actions');
    expect(text).toContain('Legendary Action Uses: 3 (4 in Lair).');
    expect(text).toContain('Cloaked Flight');
    expect(text).toContain('Sonic Boom');
    expect(text).toContain('Tail Swipe');
  });

  it("renders the bullet list inside Spellcasting's description", () => {
    const { container } = render(
      <StatblockRenderer layout={layout} monster={dragon} presentation="source" />,
    );
    const text = container.textContent ?? '';

    expect(text).toContain('At Will:');
    expect(text).toContain('1/Day Each:');
  });
});
