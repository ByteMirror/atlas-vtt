import React, { useEffect, useRef, useState } from 'react';
import { Component, MarkdownRenderer, type App } from 'obsidian';

interface Props {
  app: App;
  markdown: string;
  onRendered: () => void;
}

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
        await MarkdownRenderer.render(app, markdown, element, '', owner);
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
