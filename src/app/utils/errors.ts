/** Human-readable text for a caught value, which may be an `Error`, a string or an event. */
export function describeError(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return 'unknown error';
}

/** Normalises a caught or event-style failure value into an `Error`. */
export function toError(value: unknown, context: string): Error {
  if (value instanceof Error) return value;
  return new Error(`${context}: ${describeError(value)}`);
}
