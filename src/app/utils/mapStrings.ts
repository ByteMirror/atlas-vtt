/** Returns `value` with `replace` applied to every string inside it, however deeply nested. */
export function mapStrings<T>(value: T, replace: (text: string) => string): T {
  if (typeof value === 'string') return replace(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => mapStrings(item, replace)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = mapStrings(item, replace);
    return out as T;
  }
  return value;
}
