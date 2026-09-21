/**
 * Issue types and affected areas offered in the in-app report form. The labels
 * are the exact dropdown options of the GitHub issue forms in
 * `.github/ISSUE_TEMPLATE`, which lets Atlas pre-fill them through the URL.
 */
export const ISSUE_TYPES = {
  bug: "Something doesn't work",
  crash: 'Crash or freeze',
  performance: 'Slow or laggy',
  compatibility: 'Conflict with another plugin or theme',
  feature: 'Feature request',
  question: 'Question or something else',
} as const;

export const ISSUE_AREAS = {
  maps: 'Maps and scenes',
  grid: 'Grid and alignment',
  tokens: 'Tokens and creatures',
  statblocks: 'Statblocks, notes and pins',
  'asset-manager': 'Asset manager and collections',
  vision: 'Fog of war, vision and lighting',
  combat: 'Initiative and combat',
  dice: 'Dice',
  'player-view': 'Player view window',
  audio: 'Music and ambience',
  settings: 'Settings, hotkeys and commands',
  install: 'Installing or updating Atlas',
  unknown: 'Not sure / something else',
} as const;

export type IssueType = keyof typeof ISSUE_TYPES;
export type IssueArea = keyof typeof ISSUE_AREAS;
