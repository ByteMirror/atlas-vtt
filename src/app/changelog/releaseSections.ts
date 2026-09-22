import type { ReleaseSection } from './types';

const HEADING = /^## (.+)$/gm;

/** Splits release-note Markdown at its `##` headings so each category renders with its own label. */
export function splitReleaseSections(markdown: string): ReleaseSection[] {
  const sections: ReleaseSection[] = [];
  let label: string | null = null;
  let start = 0;
  const push = (end: number): void => {
    const body = markdown.slice(start, end).trim();
    if (body || label !== null) sections.push({ label, markdown: body });
  };
  for (const heading of markdown.matchAll(HEADING)) {
    push(heading.index);
    label = heading[1]!.trim();
    start = heading.index + heading[0].length;
  }
  push(markdown.length);
  return sections;
}
