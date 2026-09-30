import { canRunMapHotkeys, hotkeyFromEvent, matchesHotkey } from './mapHotkeys';

/**
 * Calls `onChange(true)` while the key bound by `binding()` is held on the map and
 * `onChange(false)` when it is released or the window loses focus. Returns the unbinding.
 */
export function bindHoldHotkey(
  win: Window,
  binding: () => string,
  viewId: string | undefined,
  onChange: (held: boolean) => void,
): () => void {
  let held = false;
  const release = (): void => {
    if (!held) return;
    held = false;
    onChange(false);
  };
  const keydown = (event: KeyboardEvent): void => {
    if (held || !matchesHotkey(event, binding()) || !canRunMapHotkeys(event, viewId)) return;
    held = true;
    onChange(true);
  };
  const keyup = (event: KeyboardEvent): void => {
    if (held && hotkeyFromEvent(event)?.toLowerCase().endsWith(binding().toLowerCase().split('+').pop() ?? '')) release();
  };
  win.addEventListener('keydown', keydown);
  win.addEventListener('keyup', keyup);
  win.addEventListener('blur', release);
  return () => {
    win.removeEventListener('keydown', keydown);
    win.removeEventListener('keyup', keyup);
    win.removeEventListener('blur', release);
  };
}
