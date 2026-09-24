import { useRef } from 'react';

/** `value`, except while `hold` is true: then the value from the last render before the hold began. */
export function useHeldWhile<T>(hold: boolean, value: T): T {
  const held = useRef(value);
  if (!hold) held.current = value;
  return held.current;
}
