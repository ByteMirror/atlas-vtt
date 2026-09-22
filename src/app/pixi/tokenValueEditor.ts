/** Inline DOM editor for a token's current/max value (HP, stress) shown over the Pixi bar. */

export interface ResourceValue {
  current: number;
  max: number;
}

/**
 * Parse user input against the existing value.
 * Accepts `15` (set current), `15/40` (set both), `+5` / `-3` (delta on current).
 * Returns null when the input is not understood.
 */
export function parseValueInput(raw: string, value: ResourceValue): ResourceValue | null {
  const text = raw.replace(/\s+/g, '');
  const both = /^(\d+)\/(\d+)$/.exec(text);
  const single = /^([+-]?)(\d+)$/.exec(text);

  let current: number;
  let max: number;
  if (both) {
    current = Number(both[1]);
    max = Number(both[2]);
  } else if (single) {
    const [, sign, digits] = single;
    const amount = Number(digits);
    max = value.max;
    switch (sign) {
      case '+':
        current = value.current + amount;
        break;
      case '-':
        current = value.current - amount;
        break;
      default:
        current = amount;
    }
  } else {
    return null;
  }

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
  onCommit: (value: ResourceValue) => void;
}

/** Opens a single-line input over the bar; Enter commits, Escape/blur cancels. Returns a close function. */
export function openValueEditor({ anchorEl, screenX, screenY, value, onCommit }: ValueEditorOptions): () => void {
  const rect = anchorEl.getBoundingClientRect();
  const input = document.body.createEl('input', { cls: 'atlas-vtt-plugin atlas-token-value-editor', type: 'text' });
  input.value = `${value.current}/${value.max}`;
  input.style.left = `${rect.left + screenX}px`;
  input.style.top = `${rect.top + screenY}px`;

  const close = (): void => {
    input.remove();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const next = parseValueInput(input.value, value);
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
