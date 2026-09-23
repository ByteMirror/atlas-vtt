/** `1 file`, `3 files`: a count with its noun in the matching number. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
