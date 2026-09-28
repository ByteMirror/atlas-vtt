import { resolveSubpath, type App, type TFile } from 'obsidian';

/** Heading lines in the editor (source and live preview) and headings in reading view. */
const HEADING_SELECTOR = '.HyperMD-header, [data-heading]';
/** The `#` marks the source editor shows in front of a heading. */
const HEADING_MARKS = /^#+\s*/;

/** The line `heading` starts on in `file`, as Obsidian resolves a `note#heading` link; null when the note lacks it. */
export function headingLine(app: App, file: TFile, heading: string): number | null {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache) return null;
  return resolveSubpath(cache, `#${heading}`)?.start.line ?? null;
}

/**
 * The drawn heading called `heading` nearest the top of `container`: a note
 * may repeat a heading, and the one scrolled to is the one at the top. Null
 * while it is not drawn, since the editor and reading view only draw what is
 * near the screen.
 */
export function findHeadingElement(container: HTMLElement, heading: string): HTMLElement | null {
  const top = container.getBoundingClientRect().top;
  let nearest: HTMLElement | null = null;
  let nearestDistance = Infinity;
  for (const element of Array.from(container.querySelectorAll<HTMLElement>(HEADING_SELECTOR))) {
    if (headingText(element) !== heading) continue;
    const distance = Math.abs(element.getBoundingClientRect().top - top);
    if (distance < nearestDistance) {
      nearest = element;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function headingText(element: HTMLElement): string {
  return (element.dataset.heading ?? element.textContent ?? '').replace(HEADING_MARKS, '').trim();
}
