import { useEffect, useRef } from 'react';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import { typeSpawnCountDigit, type TypedSpawnCount } from '../utils/spawnCount';

const TOKEN_CARD = '.atlas-asset-card[data-type="tokens"][data-asset-id]';
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

function tokenCardId(target: EventTarget | null): string | null {
  return target instanceof Element ? target.closest<HTMLElement>(TOKEN_CARD)?.dataset.assetId ?? null : null;
}

/**
 * Typing a number while a token card is hovered (or focused) sets how many copies its spawn
 * places. Plain digits are free here: the asset manager's own shortcuts all use Cmd/Ctrl.
 */
export function useSpawnCountTyping(
  container: HTMLElement | null,
  setSpawnCount: (assetId: string, count: number) => void,
): void {
  const onCount = useStableCallback(setSpawnCount);
  const hovered = useRef<string | null>(null);
  const typed = useRef<TypedSpawnCount | null>(null);

  useEffect(() => {
    if (!container) return;
    const doc = container.ownerDocument;
    const trackHover = (event: PointerEvent): void => {
      hovered.current = tokenCardId(event.target);
    };
    const clearHover = (): void => {
      hovered.current = null;
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!/^[0-9]$/.test(event.key)) return;
      if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
      const assetId = hovered.current ?? tokenCardId(doc.activeElement);
      if (!assetId) return;
      const next = typeSpawnCountDigit(typed.current, assetId, event.key, Date.now());
      if (!next) return;
      event.preventDefault();
      typed.current = next;
      onCount(assetId, next.count);
    };

    container.addEventListener('pointerover', trackHover);
    container.addEventListener('pointerleave', clearHover);
    doc.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('pointerover', trackHover);
      container.removeEventListener('pointerleave', clearHover);
      doc.removeEventListener('keydown', handleKeyDown);
      hovered.current = null;
    };
  }, [container, onCount]);
}
