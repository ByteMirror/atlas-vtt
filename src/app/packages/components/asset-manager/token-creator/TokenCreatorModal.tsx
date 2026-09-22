import React from 'react';
import { Modal, Scope, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { AtlasUIContext } from '../../../../react/root/AtlasUIContext';
import { TokenCreator } from '../TokenCreator';

/** Command palette host for the same creator used by Asset Manager. */
export class TokenCreatorModal extends Modal {
  private root: Root | null = null;
  constructor(app: App) {
    super(app);
    // Handle Escape before the native modal scope so nested menus can dismiss first.
    this.scope = new Scope(this.scope);
    this.scope.register([], 'Escape', event => {
      if (this.modalEl.querySelector('[role="menu"]') || event.defaultPrevented) return;
      event.preventDefault();
      this.close();
    });
  }
  onOpen(): void {
    this.containerEl.addClass('atlas-vtt-plugin');
    this.modalEl.addClass('atlas-token-creator-host');
    this.root = createRoot(this.contentEl);
    this.root.render(<AtlasUIContext.Provider value={{ app: this.app, view: null, pixiApp: null, renderer: null }}>
      <TokenCreator isOpen initialSource="statblocks" onClose={() => this.close()} />
    </AtlasUIContext.Provider>);
  }
  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}
