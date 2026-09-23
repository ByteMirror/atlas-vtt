import { AMBIENT_AUDIO_ENABLED, WALLS_AND_LIGHTING_ENABLED } from '../featureFlags';
import { isActiveAtlasLeaf } from '../utils/activeLeafGuard';
import type { SettingsService } from '../services/SettingsService';

export const MAP_HOTKEYS = [
  { id: 'help', label: 'Keyboard shortcuts', group: 'Map', defaultKey: '?' },
  { id: 'palette', label: 'Command palette', group: 'Map', defaultKey: 'Space' },
  { id: 'assets', label: 'Asset manager', group: 'Map', defaultKey: 'a', dmOnly: true },
  { id: 'dashboard', label: 'GM dashboard', group: 'Map', defaultKey: 'Tab', dmOnly: true },
  { id: 'gmView', label: 'Toggle GM view', group: 'Map', defaultKey: 'd', dmOnly: true },
  { id: 'fitMap', label: 'Fit map to view', group: 'Map', defaultKey: 'Shift+1' },
  { id: 'fitToken', label: 'Zoom to selected token', group: 'Map', defaultKey: 'Shift+2' },
  { id: 'move', label: 'Move / selection tools', group: 'Tools', defaultKey: 'v' },
  { id: 'fog', label: 'Fog tools', group: 'Tools', defaultKey: 'f', dmOnly: true },
  { id: 'draw', label: 'Drawing tools', group: 'Tools', defaultKey: 'b', dmOnly: true },
  { id: 'erase', label: 'Eraser', group: 'Tools', defaultKey: 'e', dmOnly: true },
  { id: 'text', label: 'Text tool', group: 'Tools', defaultKey: 't', dmOnly: true },
  { id: 'measure', label: 'Measure tools', group: 'Tools', defaultKey: 'm' },
  { id: 'pin', label: 'Note pin', group: 'Tools', defaultKey: 'p', dmOnly: true },
  { id: 'wall', label: 'Walls and lighting', group: 'Tools', defaultKey: 'w', dmOnly: true, enabled: WALLS_AND_LIGHTING_ENABLED },
  { id: 'audio', label: 'Ambient audio', group: 'Tools', defaultKey: 's', dmOnly: true, enabled: AMBIENT_AUDIO_ENABLED },
  { id: 'selectAll', label: 'Select all tokens', group: 'Editing', defaultKey: 'Mod+a', dmOnly: true },
  { id: 'copy', label: 'Copy selection', group: 'Editing', defaultKey: 'Mod+c', dmOnly: true, yieldsToTextSelection: true },
  { id: 'cut', label: 'Cut selection', group: 'Editing', defaultKey: 'Mod+x', dmOnly: true, yieldsToTextSelection: true },
  { id: 'paste', label: 'Paste at cursor', group: 'Editing', defaultKey: 'Mod+v', dmOnly: true },
  { id: 'duplicate', label: 'Duplicate selection', group: 'Editing', defaultKey: 'Mod+d', dmOnly: true },
  { id: 'undo', label: 'Undo', group: 'Editing', defaultKey: 'Mod+z', dmOnly: true },
  { id: 'redo', label: 'Redo', group: 'Editing', defaultKey: 'Mod+Shift+z', dmOnly: true },
  { id: 'redoAlt', label: 'Redo (alternate)', group: 'Editing', defaultKey: 'Mod+y', dmOnly: true },
  { id: 'delete', label: 'Delete selection', group: 'Editing', defaultKey: 'Delete', dmOnly: true },
  { id: 'deleteAlt', label: 'Delete selection (alternate)', group: 'Editing', defaultKey: 'Backspace', dmOnly: true },
  { id: 'cancel', label: 'Cancel tool / clear selection', group: 'Editing', defaultKey: 'Escape' },
  { id: 'diceTray', label: 'Dice tray', group: 'Combat', defaultKey: 'r' },
  { id: 'diceLog', label: 'Dice roll log', group: 'Combat', defaultKey: 'Enter' },
  { id: 'initiative', label: 'Initiative tracker', group: 'Combat', defaultKey: 'i', dmOnly: true },
  { id: 'previousTurn', label: 'Previous turn (during combat)', group: 'Combat', defaultKey: 'ArrowUp', dmOnly: true },
  { id: 'nextTurn', label: 'Next turn (during combat)', group: 'Combat', defaultKey: 'ArrowDown', dmOnly: true },
  ...([1, 2, 3, 4, 5] as const).map(n => ({ id: `widget${n}` as const, label: `Hold to select counter ${n}`, group: 'Counters', defaultKey: String(n) })),
  { id: 'increase', label: 'Increase held counter', group: 'Counters', defaultKey: '+' },
  { id: 'increaseAlt', label: 'Increase held counter (alternate)', group: 'Counters', defaultKey: '=' },
  { id: 'decrease', label: 'Decrease held counter', group: 'Counters', defaultKey: '-' },
] as const;
export type MapHotkeyId = typeof MAP_HOTKEYS[number]['id'];
export type MapHotkeys = Record<MapHotkeyId, string>;
export const DEFAULT_MAP_HOTKEYS = Object.fromEntries(MAP_HOTKEYS.map(h => [h.id, h.defaultKey])) as MapHotkeys;
export const availableHotkeys = (player = false) => MAP_HOTKEYS.filter(h => !('enabled' in h && !h.enabled) && !(player && 'dmOnly' in h && h.dmOnly));

/** Printable symbols are layout-aware; shifted digits preserve the familiar Shift+1/2 navigation. */
export function hotkeyFromEvent(event: KeyboardEvent): string | null {
  if (event.isComposing || ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Unidentified'].includes(event.key)) return null;
  let key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const shiftedDigit = event.shiftKey && /^Digit\d$/.test(event.code);
  if (shiftedDigit) key = event.code.slice(-1);
  const shift = event.shiftKey && (shiftedDigit || key.length !== 1 || /[a-z]/i.test(key));
  return `${event.ctrlKey || event.metaKey ? 'Mod+' : ''}${event.altKey ? 'Alt+' : ''}${shift ? 'Shift+' : ''}${key}`;
}
export function matchesHotkey(event: KeyboardEvent, binding: string, allowRepeat = false): boolean {
  return !!binding && (allowRepeat || !event.repeat) && !event.isComposing && hotkeyFromEvent(event) === binding;
}
export function matchesMapHotkey(event: KeyboardEvent, id: MapHotkeyId, settings?: SettingsService): boolean {
  return matchesHotkey(event, (settings?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS)[id]);
}
export function formatHotkey(binding: string): string {
  return binding ? binding.replace(/Mod\+/g, 'Ctrl/Cmd + ').replace(/Shift\+/g, 'Shift + ').replace(/Alt\+/g, 'Alt + ').replace(/(^| \+ )([a-z])$/, (_, prefix: string, key: string) => prefix + key.toUpperCase()) : 'Unassigned';
}
export function canRunMapHotkeys(event: KeyboardEvent, viewId?: string): boolean {
  if (event.defaultPrevented || event.isComposing || !isActiveAtlasLeaf(viewId)) return false;
  const target = event.target as Element | null;
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, [role="textbox"]')) return false;
  if (document.querySelector('.modal-container, .prompt, .suggestion-container, .menu, .atlas-asset-manager-modal, .atlas-command-palette-overlay, .atlas-onboarding-overlay, .atlas-hotkey-help, .atlas-text-dialog-backdrop, .atlas-dm-dashboard-wrapper, .atlas-grid-alignment-panel, [aria-modal="true"]')) return false;
  return true;
}
