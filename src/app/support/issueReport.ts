import { ISSUE_AREAS, ISSUE_TYPES, type IssueArea, type IssueType } from './issueCategories';

export interface IssueReport {
  type: IssueType;
  area: IssueArea;
  title: string;
  description: string;
  /** Steps to reproduce, or the proposal for feature requests. */
  steps: string;
  environment: string;
  errors: string;
}

type OptionalSection = 'steps' | 'environment' | 'errors';

interface SectionWording {
  label: string;
  hint: string;
}

/** Everything that differs between the GitHub issue forms; the single place that knows bug from feature. */
export interface IssueForm {
  file: string;
  title: string;
  /** Matching GitHub form field ids (see `.github/ISSUE_TEMPLATE`); sections without an id are not part of that form. */
  fields: { type?: string; description: string } & Partial<Record<OptionalSection, string>>;
  wording: Record<'description' | 'steps', SectionWording>;
}

const BUG_FORM: IssueForm = {
  file: 'bug_report.yml',
  title: 'Report an issue',
  fields: { type: 'type', description: 'description', steps: 'steps', environment: 'environment', errors: 'errors' },
  wording: {
    description: { label: 'What happened?', hint: 'What did you do, what did you expect, and what happened instead?' },
    steps: { label: 'Steps to reproduce', hint: 'Numbered steps help a lot. Mention whether it happens every time.' },
  },
};

const FEATURE_FORM: IssueForm = {
  file: 'feature_request.yml',
  title: 'Suggest a feature',
  fields: { description: 'description', steps: 'proposal', environment: 'environment' },
  wording: {
    description: { label: 'What would you like to do?', hint: 'Describe the goal or the problem this would solve at your table.' },
    steps: { label: 'How could it work?', hint: 'Optional. Sketch how you imagine the feature or where it would live.' },
  },
};

export function issueForm(type: IssueType): IssueForm {
  return type === 'feature' ? FEATURE_FORM : BUG_FORM;
}

/** Plain-markdown version of the report for the clipboard or manual submission. */
export function formatReportMarkdown(report: IssueReport): string {
  const form = issueForm(report.type);
  const sections: Array<[string, string]> = [
    [form.wording.description.label, report.description.trim()],
    [form.wording.steps.label, report.steps.trim()],
    ['Environment', report.environment.trim()],
    ['Recent errors', form.fields.errors ? report.errors.trim() : ''],
  ];
  return [
    `# ${report.title.trim()}`,
    '',
    `${ISSUE_TYPES[report.type]} · ${ISSUE_AREAS[report.area]}`,
    ...sections.filter(([, body]) => body).flatMap(([heading, body]) => ['', `## ${heading}`, '', body]),
    '',
  ].join('\n');
}
