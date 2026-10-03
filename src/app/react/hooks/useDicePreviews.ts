import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import type { DiceColour, DiceFont } from '../../dice3d/diceLook';
import { renderDicePreviews } from '../../dice3d/diceLookRuntime';

/**
 * A d20 in each colour and `font`, as image URLs, rendered by the dice renderer
 * itself. Rendered again when Obsidian's CSS changes, since the accent die takes
 * the accent colour.
 */
export function useDicePreviews(app: App | undefined, font: DiceFont): Partial<Record<DiceColour, string>> {
  const [previews, setPreviews] = useState<Partial<Record<DiceColour, string>>>({});
  const [cssVersion, setCssVersion] = useState(0);

  useEffect(() => {
    if (!app) return;
    const ref = app.workspace.on('css-change', () => setCssVersion((version) => version + 1));
    return (): void => app.workspace.offref(ref);
  }, [app]);

  useEffect(() => {
    let alive = true;
    void renderDicePreviews(font).then((next) => {
      if (alive) setPreviews(next);
    });
    return (): void => {
      alive = false;
    };
  }, [font, cssVersion]);

  return previews;
}
