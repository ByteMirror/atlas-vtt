/**
 * The only place in Atlas that executes dynamically supplied code.
 *
 * Fantasy Statblocks layouts carry JavaScript as strings: `javascript` blocks,
 * `ifelse` conditions and the `callback` of saves/traits/text blocks. Its bundled
 * layouts (Basic 5e, Pathfinder 2e, Daggerheart, 13th Age) all rely on them, so a
 * renderer that interprets those layouts has to run them, exactly as Fantasy
 * Statblocks does itself.
 *
 * Trust boundary: `code` must come from a layout held by the Fantasy Statblocks
 * plugin (see `resolveLayout` in `FantasyStatblocksService`). That covers layouts
 * the user wrote and community layouts they imported; either way Fantasy
 * Statblocks already runs the same code with the same privileges whenever it
 * renders that layout, so Atlas grants nothing new. Never pass code that
 * originates from note content, frontmatter, a map file or the network. Those
 * sources may only name a layout or supply the `monster` data handed in as an
 * argument.
 */

/**
 * Runs a layout callback with `args` as its named parameters. A missing callback,
 * a throwing callback or a nullish result all yield `fallback`, so a broken layout
 * degrades to the untransformed value instead of breaking the render.
 */
export function runCallback<T>(
  code: string | undefined,
  args: Record<string, unknown>,
  fallback: T,
): T {
  if (!code) return fallback;
  try {
    const names = Object.keys(args);
    const fn = new Function(...names, code) as (...values: unknown[]) => T;
    return fn(...names.map((name) => args[name])) ?? fallback;
  } catch (error) {
    console.error('[Statblock] Layout callback failed:', error);
    return fallback;
  }
}
