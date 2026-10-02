import React from 'react';
import { GripVertical, Pin, PinOff } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

export interface StatblockPinApi {
  pinned: boolean;
  onToggle: () => void;
}

/**
 * What a floating statblock may be dragged by: the grip, or anywhere in the
 * block that carries the creature's name. The window that owns the card reads
 * this; the card only declares it, so no pointer handling crosses the boundary.
 */
export const STATBLOCK_DRAG_HANDLE = '.atlas-sb-grip, .atlas-sb-item:has(.atlas-sb-heading)';

/** Controls that never start a drag, however they are placed inside a handle. */
export const STATBLOCK_DRAG_EXCLUDED = 'button, a, input, select, textarea, .atlas-dice-link';

/** Grip beside the pin, so the card shows it can be moved. */
export function StatblockGrip(): React.JSX.Element {
  return (
    <LabelTooltip label="Drag to move — the header works too">
      <div className="atlas-sb-grip" aria-hidden="true">
        <GripVertical />
      </div>
    </LabelTooltip>
  );
}

/**
 * Keeps a hover preview open. Unpinned, the window lives only while the
 * modifier key is held; pinned, it stays until it is closed, so a statblock can
 * be read, scrolled and rolled from while play carries on.
 */
export function StatblockPinButton({ pinned, onToggle }: StatblockPinApi): React.JSX.Element {
  return (
    <LabelTooltip label={pinned ? 'Unpin statblock' : 'Keep statblock open'}>
      <button
        type="button"
        className={`atlas-sb-pin ${pinned ? 'atlas-sb-pin--active' : ''}`}
        aria-pressed={pinned}
        aria-label={pinned ? 'Unpin statblock' : 'Keep statblock open'}
        onClick={(event) => {
          // The map dismisses previews on a stray click; this one is the control.
          event.stopPropagation();
          onToggle();
        }}
      >
        {pinned ? <PinOff /> : <Pin />}
      </button>
    </LabelTooltip>
  );
}
