import { describe, expect, it } from 'vitest';
import { TOOLBAR_CONTROLS } from '../../src/app/settings/toolbarControls';
import { TOOLBAR_REGISTRY } from '../../src/app/packages/components/toolbar/toolbarRegistry';

describe('toolbar registry', () => {
  it('has unique ids and priorities', () => {
    const ids = TOOLBAR_REGISTRY.map(control => control.id);
    expect(new Set(ids).size).toBe(ids.length);
    const priorities = TOOLBAR_REGISTRY.map(control => control.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it('has a control for every setting the user can toggle', () => {
    const ids = new Set(TOOLBAR_REGISTRY.map(control => control.id));
    for (const { id } of TOOLBAR_CONTROLS) expect(ids.has(id)).toBe(true);
  });

  it('lists the settings controls in the bar order, and keeps Move, Measure and Dice always shown', () => {
    const settingsIds = TOOLBAR_CONTROLS.map(control => control.id);
    expect(TOOLBAR_REGISTRY.map(control => control.id).filter(id => (settingsIds as string[]).includes(id))).toEqual(settingsIds);
    const alwaysShown = TOOLBAR_CONTROLS.filter(control => !control.hideable).map(control => control.id);
    expect(alwaysShown).toEqual(['move', 'measure', 'dice']);
  });
});
