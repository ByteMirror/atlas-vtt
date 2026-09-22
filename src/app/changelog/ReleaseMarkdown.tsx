import React, { useEffect, useRef, useState } from 'react';
import { Component, MarkdownRenderer, type App } from 'obsidian';
import { splitReleaseSections } from './releaseSections';

interface Props {
  app: App;
  markdown: string;
  onRendered: () => void;
}

/** Renders release notes as labelled category sections; `onRendered` fires once every section is in place. */
export function ReleaseMarkdown({ app, markdown, onRendered }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const owner = new Component();
    let active = true;
    owner.load();
    element.replaceChildren();
    void (async () => {
      try {
        for (const section of splitReleaseSections(markdown)) {
          const container = element.createDiv({ cls: 'atlas-changelog-section' });
          if (section.label) container.createEl('h4', { cls: 'atlas-changelog-category', text: section.label });
          await MarkdownRenderer.render(app, section.markdown, container.createDiv({ cls: 'atlas-changelog-section-body' }), '', owner);
        }
        if (active) onRendered();
      } catch (error) {
        if (!active) return;
        element.replaceChildren();
        setFailed(true);
        console.error('[Atlas] Could not render release notes', error);
      }
    })();
    return () => {
      active = false;
      owner.unload();
      element.replaceChildren();
    };
  }, [app, markdown, onRendered]);

  return <>
    <div ref={host} className="atlas-changelog-markdown" />
    {failed && <>
      <p role="alert">Formatting could not be loaded. The release notes are shown below.</p>
      <pre className="atlas-changelog-fallback">{markdown}</pre>
    </>}
  </>;
}
