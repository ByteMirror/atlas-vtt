/** A number as its input text; blank when unset. */
export function numberText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** `value` when it is a finite number above 0; anything else (text, 0, negative, NaN, Infinity) is undefined. */
export function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** What a number input holds: blank is undefined, as is anything that is not a number. */
export function parseNumberText(text: string): number | undefined {
  return text.trim() === '' ? undefined : Number(text);
}
