import { PIN_ICON_PATHS, type PinIconId, type PinTone } from '../types/pinIcons';
import { WIDGET_ICON_VIEW_BOX } from '../types/widgetIcons';

/** Replaces `parent`'s content with the pin icon's glyph, filled with the element's `currentColor`. */
export function setPinGlyph(parent: HTMLElement, id: PinIconId): void {
  parent.empty();
  parent
    .createSvg('svg', { attr: { viewBox: WIDGET_ICON_VIEW_BOX, fill: 'currentColor', 'aria-hidden': 'true' } })
    .createSvg('path', { attr: { d: PIN_ICON_PATHS[id] } });
}

/** Hands the tone to the stylesheet, which picks the variant of the active theme as `--pin-color`. */
export function setPinTone(element: HTMLElement, tone: PinTone): void {
  element.style.setProperty('--pin-color-light', tone.light);
  element.style.setProperty('--pin-color-dark', tone.dark);
}
