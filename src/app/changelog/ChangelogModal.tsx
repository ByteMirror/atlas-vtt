import React from 'react';
import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { ChangelogContent } from './ChangelogContent';
import type { ChangelogOptions } from './types';
import atlasIcon from '../../../docs/images/atlas-vtt-icon.webp?inline';

/** The service targets the main window; Obsidian owns focus and Escape handling. */
export class ChangelogModal extends Modal {
  private root: Root | undefined;
  private rendered = false;

  constructor(app: App, private readonly options: ChangelogOptions) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.empty();
    this.titleEl.addClass('atlas-changelog-title');
    this.titleEl.createEl('img', {
      cls: 'atlas-changelog-icon',
      attr: { src: atlasIcon, alt: '', 'aria-hidden': 'true' },
    });
    this.titleEl.createSpan({ text: 'What’s new in Atlas' });
    this.titleEl.createSpan({ cls: 'atlas-changelog-version', text: this.options.currentVersion });
    this.modalEl.addClass('atlas-vtt-plugin', 'atlas-changelog-modal');
    this.root = createRoot(this.contentEl);
    this.root.render(<ChangelogContent {...this.options} app={this.app}
      onCurrentRendered={() => { this.rendered = true; }} onClose={() => this.close()} />);
  }

  onClose(): void {
    this.root?.unmount();
    this.root = undefined;
    this.contentEl.empty();
    this.options.onClose(this.rendered);
  }
}
