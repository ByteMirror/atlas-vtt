import { describe, expect, it } from 'vitest';
import { formatReportMarkdown, type IssueReport } from '../../src/app/support/issueReport';

const report: IssueReport = {
  type: 'crash',
  area: 'vision',
  title: 'Fog freezes Obsidian',
  description: 'Revealing fog on a large map freezes the window.',
  steps: '1. Open a 8k map\n2. Reveal fog',
  environment: '- Atlas VTT: 0.2.0-beta.1\n- Obsidian: 1.13.1',
  errors: '12:00:01 [Atlas] Fog renderer failed',
};

describe('issue report markdown', () => {
  it('formats a markdown copy with only the filled sections', () => {
    const markdown = formatReportMarkdown({ ...report, steps: '' });
    expect(markdown).toContain('# Fog freezes Obsidian');
    expect(markdown).toContain('Crash or freeze · Fog of war and lighting');
    expect(markdown).toContain('## What happened?');
    expect(markdown).not.toContain('## Steps to reproduce');
    expect(markdown).toContain('## Recent errors');
    expect(formatReportMarkdown({ ...report, type: 'feature' })).toContain('## How could it work?');
    expect(formatReportMarkdown({ ...report, type: 'feature' })).not.toContain('Recent errors');
  });
});
