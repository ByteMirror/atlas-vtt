/** Popover below a token's resource bar for editing its current and maximum values. */

export interface ResourceValue {
  current: number;
  max: number;
}

export type ResourceField = keyof ResourceValue;

/** Parses an absolute number or signed delta for one field, clamping current into 0..max. */
export function parseValueInput(raw: string, value: ResourceValue, field: ResourceField = 'current'): ResourceValue | null {
  const single = /^([+-]?)(\d+)$/.exec(raw.trim());
  if (!single) return null;
  const [, sign, digits] = single;
  const amount = Number(digits);
  const next = sign === '+' ? value[field] + amount : sign === '-' ? value[field] - amount : amount;
  if (!Number.isSafeInteger(next)) return null;
  const max = field === 'max' ? next : value.max;
  const current = field === 'current' ? next : value.current;
  if (max <= 0) return null;
  return { current: Math.max(0, Math.min(max, current)), max };
}

/** Screen rectangle of the bar the popover hangs from, in canvas-local pixels. */
export interface BarAnchor {
  x: number;
  top: number;
  bottom: number;
}

export interface ResourceEditorOptions {
  /** Element the anchor is measured against (the Pixi canvas). */
  anchorEl: HTMLElement;
  anchor: BarAnchor;
  value: ResourceValue;
  resourceLabel: string;
  onCommit: (value: ResourceValue) => void;
  onClose: () => void;
}

export interface ResourceEditor {
  close: () => void;
  reposition: (anchor: BarAnchor) => void;
}

const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Opens the editor under the bar. Enter or clicking outside applies valid values, Escape discards,
 * Tab switches fields and the arrow keys step the focused value (Shift for tens).
 */
export function openResourceEditor({ anchorEl, anchor, value, resourceLabel, onCommit, onClose }: ResourceEditorOptions): ResourceEditor {
  const root = document.body.createDiv({
    cls: 'atlas-vtt-plugin atlas-token-value-editor',
    attr: { role: 'dialog', 'aria-label': `Edit ${resourceLabel}` },
  });
  const currentInput = createField(root, 'Current', resourceLabel, value.current);
  root.createSpan({ cls: 'atlas-token-value-editor__separator', text: '/' });
  const maxInput = createField(root, 'Maximum', resourceLabel, value.max);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    root.remove();
    onClose();
  };

  const parse = (): ResourceValue | null => {
    const withMax = parseValueInput(maxInput.value, value, 'max');
    const next = withMax && parseValueInput(currentInput.value, withMax, 'current');
    maxInput.toggleAttribute('aria-invalid', !withMax);
    currentInput.toggleAttribute('aria-invalid', !!withMax && !next);
    return next;
  };
  const commit = (): boolean => {
    const next = parse();
    if (!next) {
      (maxInput.hasAttribute('aria-invalid') ? maxInput : currentInput).focus();
      return false;
    }
    onCommit(next);
    close();
    return true;
  };
  const isDirty = (): boolean => currentInput.value !== String(value.current) || maxInput.value !== String(value.max);

  const onOutsidePointerDown = (e: PointerEvent): void => {
    if (root.contains(e.target as Node)) return;
    if (!isDirty() || !commit()) close();
  };
  document.addEventListener('pointerdown', onOutsidePointerDown, true);

  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      close();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      stepInput(e.target, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    }
  });

  const reposition = (next: BarAnchor): void => {
    const rect = anchorEl.getBoundingClientRect();
    const halfWidth = root.offsetWidth / 2;
    const x = Math.min(Math.max(rect.left + next.x, VIEWPORT_MARGIN + halfWidth), window.innerWidth - VIEWPORT_MARGIN - halfWidth);
    const below = rect.top + next.bottom + POPOVER_GAP;
    const fitsBelow = below + root.offsetHeight <= window.innerHeight - VIEWPORT_MARGIN;
    root.style.left = `${x}px`;
    root.style.top = `${fitsBelow ? below : rect.top + next.top - POPOVER_GAP - root.offsetHeight}px`;
  };
  reposition(anchor);

  currentInput.focus();
  currentInput.select();
  return { close, reposition };
}

function createField(root: HTMLElement, fieldName: string, resourceLabel: string, initial: number): HTMLInputElement {
  const input = root.createEl('input', {
    cls: 'atlas-token-value-editor__input',
    type: 'text',
    attr: { inputmode: 'numeric', autocomplete: 'off', 'aria-label': `${fieldName} ${resourceLabel}` },
  });
  input.value = String(initial);
  return input;
}

function stepInput(input: HTMLInputElement, delta: number): void {
  const parsed = /^\d+$/.exec(input.value.trim());
  if (!parsed) return;
  input.value = String(Math.max(0, Number(parsed[0]) + delta));
  input.select();
}
