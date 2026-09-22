import React from 'react';
import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { StatblockImportContent } from './StatblockImportContent';
import './statblock-import.scss';

/** Shared entry point for the command palette and Asset Manager. */
export class StatblockImportModal extends Modal {
  private root: Root | null = null;
  private readonly controller = new AbortController();
  constructor(app: App, private readonly collection = 'default', private readonly afterClose?: () => void) { super(app); }

  onOpen(): void {
    this.setTitle('Import from Fantasy Statblocks');
    this.modalEl.addClass('atlas-vtt-plugin', 'atlas-statblock-import-modal');
    this.root = createRoot(this.contentEl);
    this.root.render(<StatblockImportContent app={this.app} initialCollection={this.collection} controller={this.controller} onClose={() => this.close()} />);
  }

  onClose(): void {
    this.controller.abort();
    this.root?.unmount();
    this.root = null;
    this.afterClose?.();
  }
}
