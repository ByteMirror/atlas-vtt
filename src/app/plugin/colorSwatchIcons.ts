import { addIcon } from 'obsidian';

const RING_COLORS: Record<string, string> = {
  'atlas-ring-blue': '#60a5fa',
  'atlas-ring-orange': '#fb923c',
  'atlas-ring-red': '#f87171',
  'atlas-ring-green': '#4ade80',
  'atlas-ring-purple': '#c084fc',
  'atlas-ring-yellow': '#facc15',
  'atlas-ring-pink': '#f472b6',
  'atlas-ring-cyan': '#22d3ee',
  'atlas-ring-white': '#ffffff',
  'atlas-ring-black': '#000000',
};

/** Registers the filled-circle icons used as colour swatches in token ring menus. */
export function registerColorSwatchIcons(): void {
  for (const [id, color] of Object.entries(RING_COLORS)) {
    // White needs an outline to stay visible on light themes.
    const stroke = color === '#ffffff' ? 'stroke="#666666" stroke-width="0.8"' : '';
    addIcon(
      id,
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${color}" ${stroke}/></svg>`
    );
  }
}
