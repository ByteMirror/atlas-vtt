import { describe, expect, it } from 'vitest';
import { buildIssueUrl, formatReportMarkdown, MAX_ISSUE_URL_LENGTH, type IssueReport } from '../../src/app/support/issueReport';

const report: IssueReport = {
  type: 'crash',
  area: 'vision',
  title: 'Fog freezes Obsidian',
  description: 'Revealing fog on a large map freezes the window.',
  steps: '1. Open a 8k map\n2. Reveal fog',
  environment: '- Atlas VTT: 0.2.0-beta.1\n- Obsidian: 1.13.1',
  errors: '12:00:01 [Atlas] Fog renderer failed',
};

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('issue report links', () => {
  it('pre-fills the bug form fields by their ids', () => {
    const { url, complete } = buildIssueUrl(report);
    const query = params(url);
    expect(url.startsWith('https://github.com/ByteMirror/atlas-vtt/issues/new?')).toBe(true);
    expect(query.get('template')).toBe('bug_report.yml');
    expect(query.get('title')).toBe('Fog freezes Obsidian');
    expect(query.get('type')).toBe('Crash or freeze');
    expect(query.get('area')).toBe('Fog of war, vision and lighting');
    expect(query.get('description')).toBe(report.description);
    expect(query.get('steps')).toBe(report.steps);
    expect(query.get('environment')).toBe(report.environment);
    expect(query.get('errors')).toBe(report.errors);
    expect(complete).toBe(true);
  });
  it('uses the feature form without type or error fields', () => {
    const query = params(buildIssueUrl({ ...report, type: 'feature', steps: 'A button in the toolbar' }).url);
    expect(query.get('template')).toBe('feature_request.yml');
    expect(query.has('type')).toBe(false);
    expect(query.has('errors')).toBe(false);
    expect(query.get('proposal')).toBe('A button in the toolbar');
    expect(query.get('area')).toBe('Fog of war, vision and lighting');
  });
  it('skips empty optional fields', () => {
    const query = params(buildIssueUrl({ ...report, steps: '  ', errors: '' }).url);
    expect(query.has('steps')).toBe(false);
    expect(query.has('errors')).toBe(false);
  });
  it('drops optional sections, then shortens the description, to stay under the URL limit', () => {
    const long = buildIssueUrl({ ...report, errors: 'x'.repeat(6000), environment: 'y'.repeat(3000) });
    expect(long.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    expect(long.complete).toBe(false);
    expect(params(long.url).has('errors')).toBe(false);
    expect(params(long.url).get('environment')).toBe('y'.repeat(3000));
    expect(params(long.url).get('steps')).toBe(report.steps);

    const huge = buildIssueUrl({ ...report, description: 'z'.repeat(9000) });
    expect(huge.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    expect(huge.complete).toBe(false);
    expect([...params(huge.url).keys()].sort()).toEqual(['area', 'description', 'template', 'title', 'type']);
    expect(params(huge.url).get('description')).toMatch(/^z+…$/);
  });
  it('formats a markdown copy with only the filled sections', () => {
    const markdown = formatReportMarkdown({ ...report, steps: '' });
    expect(markdown).toContain('# Fog freezes Obsidian');
    expect(markdown).toContain('Crash or freeze · Fog of war, vision and lighting');
    expect(markdown).toContain('## What happened?');
    expect(markdown).not.toContain('## Steps to reproduce');
    expect(markdown).toContain('## Recent errors');
    expect(formatReportMarkdown({ ...report, type: 'feature' })).toContain('## How could it work?');
    expect(formatReportMarkdown({ ...report, type: 'feature' })).not.toContain('Recent errors');
  });
});
