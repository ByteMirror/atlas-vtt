import { describe, expect, it } from 'vitest';
import { splitReleaseSections } from '../../src/app/changelog/releaseSections';

describe('release note sections', () => {
  it('splits headings into labelled categories and keeps their bodies', () => {
    const sections = splitReleaseSections('## New\n\n- Feature.\n\n## Fixed\n\n- Bug.\n\n## Important changes\n\n- Removed.');
    expect(sections).toEqual([
      { label: 'New', markdown: '- Feature.' },
      { label: 'Fixed', markdown: '- Bug.' },
      { label: 'Important changes', markdown: '- Removed.' },
    ]);
  });
  it('keeps unlabelled leading notes and ignores empty input', () => {
    expect(splitReleaseSections('- Plain note.\n\n## Notes\n\n- Other.')).toEqual([
      { label: null, markdown: '- Plain note.' },
      { label: 'Notes', markdown: '- Other.' },
    ]);
    expect(splitReleaseSections('   ')).toEqual([]);
  });
});
