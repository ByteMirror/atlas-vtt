import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

import {
  attachDiceRolling,
  linkDiceIn,
  splitDiceSegments,
  toRollFormula,
} from '../../src/app/services/statblockDiceLinks';

interface Roll {
  formula: string;
  source: unknown;
}

/** Minimal Obsidian app exposing an Atlas view whose dice tool records rolls. */
function fakeApp(rolls: Roll[]) {
  const diceTool = {
    rollDice: (formula: string, source: unknown) => {
      rolls.push({ formula, source });
      return { formula } as never;
    },
  };
  return {
    workspace: {
      getLeavesOfType: () => [
        { view: { serviceManager: { getToolController: () => ({ getDiceTool: () => diceTool }) } } },
      ],
    },
  } as never;
}

function host(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe('toRollFormula', () => {
  it('keeps dice expressions as-is, stripping whitespace', () => {
    expect(toRollFormula('2d8 + 3')).toBe('2d8+3');
  });

  it('rolls bare modifiers against a d20', () => {
    expect(toRollFormula('+4')).toBe('1d20+4');
  });

  it('strips an ATK label before rolling the bonus', () => {
    expect(toRollFormula('ATK: +4')).toBe('1d20+4');
  });
});

describe('linkDiceIn + attachDiceRolling', () => {
  it('wraps dice notation and rolls it through the Atlas dice tool on click', () => {
    const rolls: Roll[] = [];
    const el = host('<div class="statblock-item-container">HP 2d8+2</div>');

    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({}));

    const link = el.querySelector<HTMLElement>('.atlas-dice-link');
    expect(link?.textContent).toBe('2d8+2');

    link!.click();
    expect(rolls).toHaveLength(1);
    expect(rolls[0]!.formula).toBe('2d8+2');

    dispose();
  });

  it('tags the roll with the token and the nearby ability name', () => {
    const rolls: Roll[] = [];
    const el = host(
      '<div class="atlas-sb-trait"><span class="atlas-sb-trait-name">Bite</span> 1d4+1</div>',
    );

    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({
      tokenName: 'Giant Toad',
      tokenImagePath: 'tokens/toad.png',
    }));

    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();

    expect(rolls[0]!.source).toEqual({
      type: 'statblock',
      tokenName: 'Giant Toad',
      tokenImagePath: 'tokens/toad.png',
      abilityName: 'Bite',
    });

    dispose();
  });

  it('leaves surrounding text intact', () => {
    const el = host('<div>Zunge (+1, Reichweite 15\')</div>');
    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp([]), () => ({}));

    expect(el.textContent).toBe("Zunge (+1, Reichweite 15')");
    expect(el.querySelectorAll('.atlas-dice-link')).toHaveLength(1);

    dispose();
  });

  it('does not re-wrap already linked dice when run again', () => {
    const el = host('<div>1d6</div>');
    linkDiceIn(el);
    linkDiceIn(el);

    expect(el.querySelectorAll('.atlas-dice-link')).toHaveLength(1);
    expect(el.querySelector('.atlas-dice-link')!.querySelector('.atlas-dice-link')).toBeNull();
  });

  it('stops rolling once disposed', () => {
    const rolls: Roll[] = [];
    const el = host('<div>1d20</div>');

    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({}));
    dispose();
    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();

    expect(rolls).toHaveLength(0);
  });

  it('treats a spaced dash before a dice term as punctuation, not a modifier', () => {
    expect(splitDiceSegments('Claws - Very Close - 1d12+2 phy')).toEqual([
      { text: 'Claws - Very Close - ', dice: false },
      { text: '1d12+2', dice: true },
      { text: ' phy', dice: false },
    ]);
  });

  it('splits text into plain and dice segments for the React renderer', () => {
    expect(splitDiceSegments('Bite 1d4+1 slashing')).toEqual([
      { text: 'Bite ', dice: false },
      { text: '1d4+1', dice: true },
      { text: ' slashing', dice: false },
    ]);
  });
});
