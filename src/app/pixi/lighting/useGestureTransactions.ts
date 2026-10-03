import { useCallback, useEffect, useRef, type ChangeEvent, type PointerEvent, type RefObject } from 'react';
import type { ViewAtlasStore } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';

interface GestureTransactions {
  /** For a slider's `onPointerDown`: the drag that follows is one undo step. */
  onSliderPointerDown: (event: PointerEvent) => void;
  /** For a colour picker (`useColourPick`): every colour tried while it is open is one undo step. */
  beginPick: () => void;
  endPick: () => void;
}

/**
 * The undo steps of a popover whose controls write to the store at once: a slider drag writes
 * on every move, and the transaction makes the whole drag one step. It ends on the window's
 * pointerup, which comes even when the value did not change.
 */
export function useGestureTransactions(store: ViewAtlasStore): GestureTransactions {
  const onSliderPointerDown = useCallback((event: PointerEvent): void => {
    beginHistoryTransaction(store);
    const win = event.currentTarget.ownerDocument.defaultView ?? window;
    const end = (): void => {
      win.removeEventListener('pointerup', end);
      win.removeEventListener('pointercancel', end);
      endHistoryTransaction(store);
    };
    win.addEventListener('pointerup', end);
    win.addEventListener('pointercancel', end);
  }, [store]);
  const beginPick = useCallback((): void => beginHistoryTransaction(store), [store]);
  const endPick = useCallback((): void => endHistoryTransaction(store), [store]);
  return { onSliderPointerDown, beginPick, endPick };
}

export interface ColourPick {
  onChange: (color: string) => void;
  /** The system picker opened and closed: every colour tried in between is one undo step. */
  onPickStart: () => void;
  onPickEnd: () => void;
}

/**
 * What an `<input type="color">` needs to report its picker as one gesture: `onPickStart` with
 * the first colour tried, `onPickEnd` when the picker closes or the input goes.
 */
export function useColourPick({ onChange, onPickStart, onPickEnd }: ColourPick): { ref: RefObject<HTMLInputElement | null>; onChange: (event: ChangeEvent<HTMLInputElement>) => void } {
  const ref = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const end = (): void => {
      if (!picking.current) return;
      picking.current = false;
      onPickEnd();
    };
    // `change` comes once, when the picker closes; React's onChange is the live `input` event.
    element.addEventListener('change', end);
    element.addEventListener('blur', end);
    return () => {
      element.removeEventListener('change', end);
      element.removeEventListener('blur', end);
      end();
    };
  }, [onPickEnd]);
  return {
    ref,
    onChange: (event) => {
      if (!picking.current) {
        picking.current = true;
        onPickStart();
      }
      onChange(event.target.value);
    },
  };
}
