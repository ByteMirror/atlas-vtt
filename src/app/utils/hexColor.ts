const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A `#rrggbb` colour, as colour inputs produce and PIXI `Color` reads; anything else is rejected. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}
