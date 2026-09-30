/**
 * The toolbar controls a user can arrange, in their default order (the order
 * of the bar, which the registry in `packages/components/toolbar` follows).
 * Move, Measure and Dice always show, so the toolbar is never empty and a
 * tool is always reachable; a dice tray hangs from its button.
 */
export const TOOLBAR_CONTROLS = [
  { id: 'move', label: 'Move and select', desc: 'Selecting and moving tokens, and the laser pointer.', hideable: false, shownByDefault: true },
  { id: 'fog', label: 'Fog tools', desc: 'Reveal and hide areas of the map, and the eraser.', hideable: true, shownByDefault: true },
  { id: 'draw', label: 'Drawing tools', desc: 'Pen, icons and drawing eraser.', hideable: true, shownByDefault: true },
  { id: 'text', label: 'Text tool', desc: 'Write labels on the map.', hideable: true, shownByDefault: true },
  { id: 'measure', label: 'Measure tools', desc: 'Line, circle and cone measurements.', hideable: false, shownByDefault: true },
  { id: 'pin', label: 'Note pin', desc: 'Pin notes and scene links to the map.', hideable: true, shownByDefault: true },
  { id: 'dice', label: 'Dice tray', desc: 'Roll dice.', hideable: false, shownByDefault: true },
  { id: 'loot', label: 'Loot roller', desc: 'Roll loot tables.', hideable: true, shownByDefault: true },
  { id: 'assets', label: 'Asset manager', desc: 'Open the asset manager.', hideable: true, shownByDefault: true },
  { id: 'palette', label: 'Command palette', desc: 'Open the command palette.', hideable: true, shownByDefault: true },
] as const;

type ToolbarControlEntry = typeof TOOLBAR_CONTROLS[number];
export type ToolbarControlId = ToolbarControlEntry['id'];
export type HideableToolbarControlId = Extract<ToolbarControlEntry, { hideable: true }>['id'];

/** Only what the user changed from the defaults, so controls added later follow their default. */
export type ToolbarControlOverrides = Partial<Record<HideableToolbarControlId, boolean>>;

/** Whether the user may hide the toolbar control with this id. */
export function isHideableToolbarControl(id: string): id is HideableToolbarControlId {
  return TOOLBAR_CONTROLS.some(control => control.id === id && control.hideable);
}

/** Whether a control is on the toolbar; hiding one leaves its keyboard shortcut working. */
export function isToolbarControlShown(overrides: ToolbarControlOverrides | undefined, id: HideableToolbarControlId): boolean {
  const control = TOOLBAR_CONTROLS.find(candidate => candidate.id === id);
  return overrides?.[id] ?? control?.shownByDefault ?? true;
}

/** The overrides with one control set; a value equal to the default is not kept. */
export function withToolbarControl(overrides: ToolbarControlOverrides, id: HideableToolbarControlId, shown: boolean): ToolbarControlOverrides {
  const { [id]: _previous, ...rest } = overrides;
  const control = TOOLBAR_CONTROLS.find(candidate => candidate.id === id);
  return control?.shownByDefault === shown ? rest : { ...rest, [id]: shown };
}

/** Stored overrides reduced to known controls with boolean values, so a bad file cannot hide anything by accident. */
export function readToolbarControlOverrides(stored: unknown): ToolbarControlOverrides {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const raw = stored as Record<string, unknown>;
  return TOOLBAR_CONTROLS.reduce<ToolbarControlOverrides>(
    (overrides, control) => control.hideable && typeof raw[control.id] === 'boolean' ? withToolbarControl(overrides, control.id, raw[control.id] as boolean) : overrides,
    {},
  );
}

/**
 * The order of `defaultIds` with the user's order applied: their order first,
 * then every control they have not placed (a later version's, say) after the
 * control that precedes it by default. An empty user order is the default.
 */
export function orderedToolbarIds(defaultIds: readonly string[], custom: readonly string[]): string[] {
  const known = new Set(defaultIds);
  const order = [...new Set(custom.filter(id => known.has(id)))];
  defaultIds.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = defaultIds.slice(0, index).reverse().find(previous => order.includes(previous));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id);
  });
  return order;
}

/** `order` with the control at `index` moved by `delta` places; unchanged at either end. */
export function movedToolbarOrder(order: readonly string[], index: number, delta: number): string[] {
  const target = index + delta;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return [...order];
  const moved = [...order];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
}

/** A stored order reduced to distinct strings; unknown ids are dropped when it is applied. */
export function readToolbarOrder(stored: unknown): string[] {
  return Array.isArray(stored) ? [...new Set(stored.filter((id): id is string => typeof id === 'string'))] : [];
}
