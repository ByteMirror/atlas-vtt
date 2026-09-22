/** Inline DOM editor for a token's current/max value (HP, stress) shown over the Pixi bar. */

export interface ResourceValue {
  current: number;
  max: number;
}

export type ResourceField = keyof ResourceValue;

/** Parses an absolute number or signed delta for the selected field. */
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

export interface ValueEditorOptions {
  /** Element the editor is positioned relative to (the Pixi canvas). */
  anchorEl: HTMLElement;
  /** Bar centre in canvas-local screen pixels. */
  screenX: number;
  screenY: number;
  value: ResourceValue;
  field: ResourceField;
  resourceLabel: string;
  onCommit: (value: ResourceValue) => void;
}

/** Opens a single-line input over the bar; Enter commits, Escape/blur cancels. Returns a close function. */
export function openValueEditor({ anchorEl, screenX, screenY, value, field, resourceLabel, onCommit }: ValueEditorOptions): () => void {
  const rect = anchorEl.getBoundingClientRect();
  const input = document.body.createEl('input', { cls: 'atlas-vtt-plugin atlas-token-value-editor', type: 'text' });
  input.value = String(value[field]);
  input.setAttribute('aria-label', `${field === 'current' ? 'Current' : 'Maximum'} ${resourceLabel}`);
  input.style.left = `${rect.left + screenX}px`;
  input.style.top = `${rect.top + screenY}px`;

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    input.remove();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const next = parseValueInput(input.value, value, field);
      if (next) onCommit(next);
      close();
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', close);

  input.focus();
  input.select();
  return close;
}
