import React, { useCallback, useId, useState } from 'react';
import type { App } from 'obsidian';
import { ChevronDown } from 'lucide-react';
import { Button } from '../packages/components/primitives/button';
import { ReleaseMarkdown } from './ReleaseMarkdown';
import type { ChangelogOptions, ReleaseNote } from './types';

interface Props extends Omit<ChangelogOptions, 'onClose'> {
  app: App;
  onCurrentRendered: () => void;
  onClose: () => void;
}

function ReleaseEntry({ release, initialOpen, isNew, onRendered, app }: {
  release: ReleaseNote; initialOpen: boolean; isNew: boolean; onRendered: () => void; app: App;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(initialOpen);
  const id = useId();
  const date = new Date(`${release.date}T00:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
  return <article className="atlas-changelog-entry">
    <h3 className="atlas-changelog-heading">
      <Button variant="ghost" className="atlas-changelog-trigger" aria-expanded={expanded}
        aria-controls={`${id}-panel`} id={`${id}-heading`} onClick={() => setExpanded(!expanded)}>
        <span className="atlas-changelog-release-label">
          <span className="atlas-changelog-meta"><span>{release.version}</span><time dateTime={release.date}>{date}</time></span>
          <span className="atlas-changelog-release-title">{release.title}</span>
          {isNew && <span className="atlas-changelog-new">New since your last update</span>}
        </span>
        <ChevronDown aria-hidden="true" className="atlas-changelog-chevron" />
      </Button>
    </h3>
    <div id={`${id}-panel`} aria-labelledby={`${id}-heading`} hidden={!expanded} className="atlas-changelog-panel">
      {expanded && <ReleaseMarkdown app={app} markdown={release.markdown} onRendered={onRendered} />}
    </div>
  </article>;
}

export function ChangelogContent(props: Props): React.JSX.Element {
  const [showOnUpdate, setShowOnUpdate] = useState(props.showOnUpdate);
  const ignoreRendered = useCallback(() => {}, []);
  return <div className="atlas-changelog-content">
    <p className="atlas-changelog-intro">Installed version {props.currentVersion}. Explore the latest changes and previous releases.</p>
    <div className="atlas-changelog-history">
      {props.releases.map((release, index) => <ReleaseEntry key={release.version} release={release}
        app={props.app} initialOpen={index === 0} isNew={props.newVersions.has(release.version)}
        onRendered={release.version === props.currentVersion ? props.onCurrentRendered : ignoreRendered} />)}
      {!props.releases.length && <p>Release notes are not bundled for this version yet.</p>}
    </div>
    <div className="atlas-changelog-footer">
      <label className="atlas-changelog-preference">
        <input type="checkbox" checked={showOnUpdate} onChange={event => {
          setShowOnUpdate(event.target.checked);
          props.onPreferenceChange(event.target.checked);
        }} />
        <span>Show changelog after updates</span>
      </label>
      <Button onClick={props.onClose}>Close</Button>
    </div>
  </div>;
}
