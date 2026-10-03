/**
 * Escape presses a tooltip took to close itself. Its layer (Radix) prevents the key's default
 * when it dismisses, which everything else reads as "a control used this key" and then leaves
 * the key alone: with a tooltip showing, the first Escape closed only the tooltip.
 */
const tooltipDismissals = new WeakSet<Event>();

/** Marks a list that always stands open (search results, a picker's choices): Escape is never its own. */
export const STANDING_LIST = { 'data-atlas-standing-list': '' } as const;

/** A select's options or a menu, while open. */
const OPEN_LIST = '[role="menu"], [role="listbox"]:not([data-atlas-standing-list])';
/** What holds a control together with the lists it opens: a popover or dialog of Atlas, a modal of Obsidian. */
const HOLDER = '[role="dialog"], .atlas-modal, .modal';

/** The list `control` says it has open, wherever that hangs in the document (a menu in a portal). */
function listOf(control: Element): Element | null {
  const id = control.getAttribute('aria-controls') ?? control.getAttribute('aria-owns');
  const named = id ? control.ownerDocument.getElementById(id) : null;
  return named?.matches(OPEN_LIST) ? named : named?.querySelector(OPEN_LIST) ?? null;
}

/**
 * Whether a list is open that the key pressed on `target` belongs to: the list the key was
 * pressed in, one inside the popover or dialog that holds the target, or one a control in there
 * has open elsewhere. A list anywhere else in the document (a search's standing results, a menu
 * of Obsidian or of another plugin, another dialog's) has nothing to do with the key.
 */
function hasOpenList(target: Element): boolean {
  if (target.closest(OPEN_LIST)) return true;
  const holder = target.closest(HOLDER);
  if (!holder) return false;
  return !!holder.querySelector(OPEN_LIST) || [...holder.querySelectorAll('[aria-expanded="true"]')].some((control) => listOf(control));
}

/**
 * A tooltip closes on this Escape; called by the tooltip before its layer prevents the default.
 * While a list of the key's own is open the key is that list's all the same: the tooltip is the
 * topmost layer and takes the key first, alone where the list is a layer too (a menu, which then
 * stays open), so whoever asks who took the event would close what holds the list. The key then
 * counts as used by a control, as it does when the list closes on it without a tooltip.
 */
export function noteTooltipDismissal(event: Event): void {
  // Not `instanceof`: an element of a popout window is none of this window's classes.
  const target = event.target as Partial<Element> | null;
  if (typeof target?.closest !== 'function' || !hasOpenList(target as Element)) tooltipDismissals.add(event);
}

/** Whether a control used the key for itself (an open list that closed, a switch): its default was prevented, and not by a tooltip closing. */
export function handledByAnotherControl(event: Event): boolean {
  return event.defaultPrevented && !tooltipDismissals.has(event);
}
