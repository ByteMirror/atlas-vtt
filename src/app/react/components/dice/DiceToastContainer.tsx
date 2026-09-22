import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DiceToast, type ToastPhase } from './DiceToast';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { DICE_TOAST_KNOT_PATHS, DICE_TOAST_KNOT_SYMBOL_ID } from './diceToastOrnament';

interface ToastEntry {
  id: string;
  result: DiceRollResult;
  phase: ToastPhase;
}

const ENTER_DURATION = 350;
const AUTO_DISMISS = 7000;
const EXIT_DURATION = 300;

export function DiceToastContainer(): React.ReactElement | null {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const addToast = useCallback((result: DiceRollResult): void => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, result, phase: 'entering' }]);

    // entering → visible
    window.setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, phase: 'visible' as const } : t)),
      );
    }, ENTER_DURATION);

    // auto-dismiss → exiting
    window.setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) =>
          t.id === id && t.phase !== 'exiting' ? { ...t, phase: 'exiting' as const } : t,
        ),
      );
    }, AUTO_DISMISS);

    // remove from DOM after exit animation
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS + EXIT_DURATION);
  }, []);

  const dismissToast = useCallback((id: string): void => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, phase: 'exiting' as const } : t)),
    );
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_DURATION);
  }, []);

  // Single global listener — every dice roll in the app dispatches this event
  useEffect(() => {
    const handler = (e: Event): void => {
      addToast((e as CustomEvent).detail as DiceRollResult);
    };
    document.addEventListener('atlas-dice-rolled', handler);
    return () => {
      document.removeEventListener('atlas-dice-rolled', handler);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="atlas-dice-toast-container atlas-vtt-plugin">
      {/* Knotwork defined once; every toast corner draws it with <use>. */}
      <svg className="atlas-dice-toast-container__defs" aria-hidden="true">
        <defs>
          <g id={DICE_TOAST_KNOT_SYMBOL_ID} fill="none" stroke="currentColor" strokeWidth="10">
            {DICE_TOAST_KNOT_PATHS.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </defs>
      </svg>
      {toasts.map((toast) => (
        <DiceToast
          key={toast.id}
          result={toast.result}
          phase={toast.phase}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>,
    document.body,
  );
}
