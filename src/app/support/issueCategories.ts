import categories from './issueCategories.json';

/** Shared with the reporting service and GitHub issue templates. */
export const ISSUE_TYPES = categories.ISSUE_TYPES;
export const ISSUE_AREAS = categories.ISSUE_AREAS;

export type IssueType = keyof typeof ISSUE_TYPES;
export type IssueArea = keyof typeof ISSUE_AREAS;
