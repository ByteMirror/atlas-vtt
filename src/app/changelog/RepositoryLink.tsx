import React from 'react';
import { ATLAS_GITHUB_URL } from '../support/communityLinks';
import { GitHubIcon } from './GitHubIcon';

/** Header link to the Atlas repository; opens in the system browser like any external link in Obsidian. */
export function RepositoryLink(): React.JSX.Element {
  return <a className="atlas-changelog-repository" href={ATLAS_GITHUB_URL} target="_blank" rel="noopener noreferrer">
    <GitHubIcon className="atlas-changelog-repository-icon" />
    <span>GitHub</span>
  </a>;
}
