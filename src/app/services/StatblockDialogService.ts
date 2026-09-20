import { App } from 'obsidian';
import React from 'react';
import { createRoot } from 'react-dom/client';
import StatblockLinkModal from '../packages/components/asset-manager/StatblockLinkModal';

export class StatblockDialogService {
  private app: App;
  private modalContainer: HTMLElement | null = null;
  private root: any = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Shows the statblock selection dialog
   * @param currentStatblockPath The currently linked statblock path (if any)
   * @param onLink Callback when a statblock is selected or unlinked
   * @param assetName The name of the asset/token being linked
   */
  public showStatblockDialog(
    currentStatblockPath: string | null,
    onLink: (statblockPath: string | null) => void,
    assetName: string = 'Token',
  ): void {
    // Clean up any existing modal
    this.closeDialog();

    // Create container for the modal
    this.modalContainer = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

    // Create a dummy asset object for the modal
    const dummyAsset = {
      id: 'temp-' + Date.now(),
      name: assetName,
      type: 'tokens' as const,
      statblockPath: currentStatblockPath,
      thumbnailUrl: '',
      imageUrl: '',
      tags: []
    };

    // Render the modal
    this.root = createRoot(this.modalContainer);
    this.root.render(
      React.createElement(StatblockLinkModal, {
        isOpen: true,
        onClose: () => this.closeDialog(),
        asset: dummyAsset,
        onLink: (path: string | null) => {
          onLink(path);
          this.closeDialog();
        },
        app: this.app,
      })
    );
  }

  /**
   * Closes the statblock dialog if it's open
   */
  public closeDialog(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    if (this.modalContainer) {
      this.modalContainer.remove();
      this.modalContainer = null;
    }
  }
}