import { ISSUE_AREAS, ISSUE_TYPES, type IssueArea, type IssueType } from './issueCategories';

const NEW_ISSUE_URL = 'https://github.com/ByteMirror/atlas-vtt/issues/new';
/** Stays well under the limit at which GitHub answers with "414 URI Too Long". */
export const MAX_ISSUE_URL_LENGTH = 7500;

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
  /** GitHub form field ids (see `.github/ISSUE_TEMPLATE`); sections without an id are not part of that form. */
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

export interface IssueUrl {
  url: string;
  /** False when sections were dropped or the description shortened to keep the link short. */
  complete: boolean;
}

const link = (params: URLSearchParams): string => `${NEW_ISSUE_URL}?${params.toString()}`;

/** Pre-filled "new issue" link. Long reports lose optional sections last-first, then the description is shortened. */
export function buildIssueUrl(report: IssueReport): IssueUrl {
  const form = issueForm(report.type);
  const params = new URLSearchParams({ template: form.file, title: report.title.trim(), area: ISSUE_AREAS[report.area] });
  if (form.fields.type) params.set(form.fields.type, ISSUE_TYPES[report.type]);
  params.set(form.fields.description, report.description.trim());
  const optional = (['steps', 'environment', 'errors'] as const).filter(section => form.fields[section] && report[section].trim());
  for (const section of optional) params.set(form.fields[section]!, report[section].trim());

  let url = link(params);
  let complete = true;
  for (const section of [...optional].reverse()) {
    if (url.length <= MAX_ISSUE_URL_LENGTH) break;
    params.delete(form.fields[section]!);
    url = link(params);
    complete = false;
  }
  while (url.length > MAX_ISSUE_URL_LENGTH) {
    const description = params.get(form.fields.description) ?? '';
    const keep = Math.max(0, description.length - (url.length - MAX_ISSUE_URL_LENGTH) - 1);
    params.set(form.fields.description, `${description.slice(0, keep)}…`);
    url = link(params);
    complete = false;
  }
  return { url, complete };
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
