import type { NotePin } from '../types';

/** Pin kinds that show an auto-assigned label instead of an icon. */
export type PinLabelKind = 'number' | 'letter';

export function isPinLabelKind(icon: string | undefined): icon is PinLabelKind {
  return icon === 'number' || icon === 'letter';
}

/**
 * Next label of a sequence: one past the highest label in use, so a deleted
 * pin's label is never reissued and keyed notes ("Room 3") stay valid.
 */
export function nextPinLabel(pins: Record<string, NotePin>, kind: PinLabelKind): string {
  const used = Object.values(pins).flatMap((pin) => (pin.icon === kind && pin.label ? [pin.label] : []));

  if (kind === 'number') {
    return String(Math.max(0, ...used.map(Number)) + 1);
  }
  return nextLetterLabel(used);
}

/**
 * Spreadsheet-style sequence (A…Z, AA, AB…): bijective base 26, where A = 1 and
 * there is no zero digit. Labels are compared by index because 'AA' sorts before 'Z'.
 */
function nextLetterLabel(used: string[]): string {
  const toIndex = (label: string): number =>
    [...label].reduce((n, char) => n * 26 + (char.charCodeAt(0) - 64), 0);

  let n = Math.max(0, ...used.map(toIndex)) + 1;
  let label = '';
  while (n > 0) {
    n--;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}
