// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { STANDING_LIST, handledByAnotherControl, noteTooltipDismissal } from '../../src/app/keyboard/tooltipEscape';

/** An Escape pressed on `target` while a tooltip shows: the tooltip takes it first, notes it and prevents its default. */
function escapeOn(target: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  const first = (pressed: Event): void => {
    noteTooltipDismissal(pressed);
    pressed.preventDefault();
  };
  document.addEventListener('keydown', first, true);
  target.dispatchEvent(event);
  document.removeEventListener('keydown', first, true);
  return event;
}

const standing = Object.keys(STANDING_LIST)[0]!;

describe('an Escape a tooltip took to close itself', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const popover = (inner = ''): HTMLElement => {
    document.body.insertAdjacentHTML('beforeend', `<section role="dialog" class="atlas-light-popover"><button id="chip">Torch</button>${inner}</section>`);
    return document.getElementById('chip')!;
  };

  it('is the tooltip\'s alone while no list is open', () => {
    expect(handledByAnotherControl(escapeOn(popover()))).toBe(false);
  });

  it('is a list\'s while one is open in the popover or dialog the key was pressed in', () => {
    expect(handledByAnotherControl(escapeOn(popover('<div role="listbox"><button role="option">Always</button></div>')))).toBe(true);
    document.body.innerHTML = '';
    document.body.insertAdjacentHTML('beforeend', '<div class="modal"><button id="field">Name</button><div role="menu"></div></div>');
    expect(handledByAnotherControl(escapeOn(document.getElementById('field')!))).toBe(true);
  });

  it('is not the business of a list elsewhere in the document: a standing list of results, another plugin\'s menu, a list in another dialog', () => {
    const chip = popover();
    document.body.insertAdjacentHTML('beforeend', '<div class="pin-results" role="listbox"></div><div class="menu" role="menu"></div><div role="dialog"><div role="listbox"></div></div>');
    expect(handledByAnotherControl(escapeOn(chip))).toBe(false);
  });

  it('is not the business of a list that always stands open, in the same dialog either', () => {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal"><input id="search" role="combobox" aria-expanded="true" aria-controls="results"><div id="results" role="listbox" ${standing}></div></div>`);
    expect(handledByAnotherControl(escapeOn(document.getElementById('search')!))).toBe(false);
  });

  it('is a list\'s that hangs outside the dialog from a control inside it', () => {
    const chip = popover('<button aria-expanded="true" aria-controls="more">More</button>');
    document.body.insertAdjacentHTML('beforeend', '<div data-radix-popper-content-wrapper><div id="more" role="menu"><button id="item" role="menuitem">Lantern</button></div></div>');
    expect(handledByAnotherControl(escapeOn(chip))).toBe(true);
    // Pressed in the list itself, wherever that hangs.
    expect(handledByAnotherControl(escapeOn(document.getElementById('item')!))).toBe(true);
    // A control that names a list which is closed again opens nothing.
    document.getElementById('more')!.remove();
    expect(handledByAnotherControl(escapeOn(chip))).toBe(false);
  });

  it('pressed outside every popover and dialog is a list\'s only when pressed in that list', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="workspace-leaf"><button id="tool">Select</button><div role="menu"><button id="entry" role="menuitem">Ruler</button></div></div>');
    expect(handledByAnotherControl(escapeOn(document.getElementById('tool')!))).toBe(false);
    expect(handledByAnotherControl(escapeOn(document.getElementById('entry')!))).toBe(true);
    expect(handledByAnotherControl(escapeOn(document.body))).toBe(false);
  });
});
