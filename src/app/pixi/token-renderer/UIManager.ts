import type { AtlasSettings } from '../../services/SettingsService';
import type { LayerVisibility } from '../playerSafeFrame';
/**
 * Token UI Manager
 * 
 * Coordinates all UI elements for tokens including health bars, nameplates,
 * controls, rotation handles, and resize handles.
 */

import { Container } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { ITokenUIManager, TokenGroupContainer } from './types';
import type { TokenEntity } from '../../types';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import { TokenUIRenderer } from '../TokenUIRenderer';
import { TokenControlsUI } from '../TokenControlsUI';
import { TokenRotationUI } from '../TokenRotationUI';
import { TokenResizeUI } from '../TokenResizeUI';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';

export class UIManager implements ITokenUIManager {
  private viewport: Viewport;
  private store: ViewAtlasStore;
  private viewId: string;
  private isPlayerView: boolean;
  
  // UI containers and renderers
  private uiContainer: Container;
  private playerUIContainer: Container | null = null;
  private playerTokenUIs: Record<string, TokenUIRenderer> = {};
  private tokenUIs: Record<string, TokenUIRenderer> = {};
  private tokenControlsUI?: TokenControlsUI;
  private tokenRotationUI?: TokenRotationUI;
  private tokenResizeUI?: TokenResizeUI;
  
  // Condition definitions provider — forwarded to each TokenUIRenderer
  public conditionDefsProvider: (() => ConditionDefinition[]) | null = null;

  // Hover handlers for UI elements
  private uiHoverHandlers: Record<string, { over: () => void; out: () => void }> = {};
  private _prevHoverId: string | null = null;
  private _prevModifier = false;
  
  // Store unsubscribe functions
  private unsubscribeSelection?: () => void;
  private unsubscribeSettings?: () => void;
  private unsubscribeGrid?: () => void;
  private unsubscribeViewport?: () => void;

  constructor(
    viewport: Viewport,
    store: ViewAtlasStore,
    viewId: string,
    isPlayerView: boolean = false
  ) {
    this.viewport = viewport;
    this.store = store;
    this.viewId = viewId;
    this.isPlayerView = isPlayerView;
    
    // Create UI container for non-rotating elements
    this.uiContainer = new Container();
    this.uiContainer.sortableChildren = true;
    this.uiContainer.eventMode = 'passive'; // UI should not block token interactions
    this.uiContainer.interactiveChildren = true;
    this.uiContainer.zIndex = 100; // Higher z-index to ensure UI appears above tokens
    this.viewport.addChild(this.uiContainer);
    
    // Force viewport to sort children to ensure proper z-ordering
    this.viewport.sortChildren();
    
    // Token controls are DM-only
    if (!this.isPlayerView) {
      this.tokenControlsUI = new TokenControlsUI(this.viewport, this.store);
      this.tokenRotationUI = new TokenRotationUI(this.viewport, this.store);
      this.tokenResizeUI = new TokenResizeUI(this.viewport, this.store);
      
      // Set up cross-references between rotation and resize UI
      this.tokenRotationUI.setResizeUI(this.tokenResizeUI);
    }
    
    // Set up subscriptions
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // Subscribe to selection changes
    this.unsubscribeSelection = this.store.subscribe(
      (state: ViewAtlasState) => state.selectedIds,
      (selectedIds: string[]) => this.updateSelectionUI(selectedIds)
    );
    
    // Subscribe to token settings changes
    this.unsubscribeSettings = this.store.subscribe(
      (state: ViewAtlasState) => state.tokenSettings,
      () => this.updateAllTokenSettings()
    );
    
    // Subscribe to grid changes to reposition selection controls/handles
    this.unsubscribeGrid = this.store.subscribe(
      (state: ViewAtlasState) => state.grid,
      () => this.refreshSelectionControls()
    );
  }

  createTokenUI(tokenId: string, container: TokenGroupContainer, token: TokenEntity): TokenUIRenderer | null {
    // Only create UI for character tokens
    if (token.kind !== 'character') {
      return null;
    }
    
    const ui = new TokenUIRenderer(this.store, this.viewId, this.viewport);
    ui.conditionDefsProvider = this.conditionDefsProvider;
    this.tokenUIs[tokenId] = ui;
    
    const uiElement = ui.getContainer();
    this.uiContainer.addChild(uiElement);
    
    // Get token size from container metadata
    const tokenSize = container.tokenSize || 70;
    const gridSize = this.store.getState().grid?.size || 70;
    const tokenSizeInCells = token.size || 1;
    const tokenDiameterInCells = (2 * tokenSizeInCells - 1);
    
    // Initial update and position sync
    ui.update(token, tokenSize, tokenDiameterInCells, gridSize);
    this.syncUIPosition(tokenId, container.position.x, container.position.y);
    
    // Set up hover handlers for the UI
    this.setupUIHoverHandlers(tokenId, container);
    
    return ui;
  }

  updateTokenUI(tokenId: string, token: TokenEntity): void {
    const ui = this.tokenUIs[tokenId];
    if (!ui || token.kind !== 'character') {
      return;
    }
    
    const tokenSprite = this.getTokenSprite(tokenId);
    if (!tokenSprite) {
      return;
    }
    
    // Get sprite dimensions
    const sprite = tokenSprite.getChildByLabel('tokenSprite');
    const spriteWidth = sprite?.width || 70;
    const gridSize = this.store.getState().grid?.size || 70;
    const tokenSizeInCells = token.size || 1;
    const tokenDiameterInCells = (2 * tokenSizeInCells - 1);
    
    ui.update(token, spriteWidth, tokenDiameterInCells, gridSize);
  }

  updateSelectionUI(selectedTokenIds: string[]): void {
    // Update TokenControlsUI based on selection
    if (this.tokenControlsUI) {
      if (selectedTokenIds.length === 1) {
        const tokenId = selectedTokenIds[0];
        if (tokenId) {
          const tokenSprite = this.getTokenSprite(tokenId);
          if (tokenSprite) {
            const sprite = tokenSprite.getChildByLabel('tokenSprite');
            const tokenSize = sprite?.width || 70;
            this.tokenControlsUI.show(
              tokenId,
              tokenSprite.position.x,
              tokenSprite.position.y,
              tokenSize
            );
          }
        }
      } else {
        this.tokenControlsUI.hide();
      }
    }
    
    // Update rotation UI based on selection
    if (this.tokenRotationUI) {
      if (selectedTokenIds.length === 1) {
        const tokenId = selectedTokenIds[0];
        if (tokenId) {
          const tokenSprite = this.getTokenSprite(tokenId);
          if (tokenSprite) {
            const sprite = tokenSprite.getChildByLabel('tokenSprite');
            const tokenSize = sprite?.width || 70;
            this.tokenRotationUI.show(tokenId, tokenSize);
          }
        }
      } else {
        this.tokenRotationUI.hide();
      }
    }
    
    // Update resize UI based on selection
    if (this.tokenResizeUI) {
      if (selectedTokenIds.length === 1) {
        const tokenId = selectedTokenIds[0];
        if (tokenId) {
          const tokenSprite = this.getTokenSprite(tokenId);
          if (tokenSprite) {
            const sprite = tokenSprite.getChildByLabel('tokenSprite');
            const tokenSize = sprite?.width || 70;
            this.tokenResizeUI.show(tokenId, tokenSize);
          }
        }
      } else {
        this.tokenResizeUI.hide();
      }
    }
    
    // Update selection state for all token UIs
    for (const tokenId in this.tokenUIs) {
      const ui = this.tokenUIs[tokenId];
      if (ui) {
        const isSelected = selectedTokenIds.includes(tokenId);
        ui.setSelectionState(isSelected);
      }
    }
  }

  /** Re-trigger selection UI to reposition controls/handles after grid changes. */
  private refreshSelectionControls(): void {
    const selectedIds = this.store.getState().selectedIds;
    if (selectedIds.length > 0) {
      this.updateSelectionUI(selectedIds);
    }
  }

  showTokenControls(tokenId: string, container: Container): void {
    const sprite = container.getChildByLabel('tokenSprite');
    const tokenSize = sprite?.width || 70;
    
    if (this.tokenControlsUI) {
      this.tokenControlsUI.show(
        tokenId,
        container.position.x,
        container.position.y,
        tokenSize
      );
    }
    
    if (this.tokenRotationUI) {
      this.tokenRotationUI.show(tokenId, tokenSize);
    }
    
    if (this.tokenResizeUI) {
      this.tokenResizeUI.show(tokenId, tokenSize);
    }
  }

  hideTokenControls(): void {
    this.tokenControlsUI?.hide();
    this.tokenRotationUI?.hide();
    this.tokenResizeUI?.hide();
  }

  destroyTokenUI(tokenId: string): void {
    const playerUI = this.playerTokenUIs[tokenId];
    if (playerUI) {
      playerUI.getContainer().removeFromParent();
      playerUI.destroy();
      delete this.playerTokenUIs[tokenId];
    }
    const ui = this.tokenUIs[tokenId];
    if (ui) {
      const uiElement = ui.getContainer();
      if (uiElement.parent) {
        uiElement.parent.removeChild(uiElement);
      }
      ui.destroy();
      delete this.tokenUIs[tokenId];
    }
    
    // Clean up hover handlers
    if (this.uiHoverHandlers[tokenId]) {
      delete this.uiHoverHandlers[tokenId];
    }
  }

  /**
   * Destroy all token-specific UIs while preserving singleton controls
   * Used when switching maps to clear token UIs without losing control UI instances
   */
  destroyAllTokenUIs(): void {
    // Destroy all token UIs
    for (const tokenId in this.tokenUIs) {
      this.destroyTokenUI(tokenId);
    }
    // Controls (tokenControlsUI, tokenRotationUI, tokenResizeUI) remain intact
  }

  destroyAll(): void {
    // Destroy all token UIs
    for (const tokenId in this.tokenUIs) {
      this.destroyTokenUI(tokenId);
    }
    
    // Destroy control UIs
    this.tokenControlsUI?.destroy();
    this.tokenRotationUI?.destroy();
    this.tokenResizeUI?.destroy();
    
    // Unsubscribe from stores
    this.unsubscribeSelection?.();
    this.unsubscribeSettings?.();
    this.unsubscribeGrid?.();
    this.unsubscribeViewport?.();
    
    // Remove and destroy UI container
    if (this.uiContainer.parent) {
      this.uiContainer.parent.removeChild(this.uiContainer);
    }
    this.uiContainer.destroy({ children: true });
    this.playerUIContainer?.destroy({ children: true });
    this.playerUIContainer = null;
  }

  // Helper methods

  syncUIPosition(tokenId: string, x: number, y: number): void {
    const ui = this.tokenUIs[tokenId];
    if (ui) {
      ui.getContainer().position.set(x, y);
    }
  }

  syncUIScale(tokenId: string, tokenSize: number, gridSizeOverride?: number): void {
    const ui = this.tokenUIs[tokenId];
    if (ui) {
      const token = this.store.getState().objects?.tokens?.[tokenId];
      if (token && token.kind === 'character') {
        const gridSize = gridSizeOverride ?? (this.store.getState().grid?.size || 70);
        const tokenSizeInCells = token.size || 1;
        const tokenDiameterInCells = (2 * tokenSizeInCells - 1);
        ui.update(token, tokenSize, tokenDiameterInCells, gridSize);
      }
    }
  }

  updateControlsPosition(x: number, y: number, tokenSize: number): void {
    this.tokenControlsUI?.updatePosition(x, y, tokenSize);
  }

  updateHandlePositions(): void {
    this.tokenRotationUI?.updateHandlePositions();
    this.tokenResizeUI?.updateHandlePositions();
  }

  setTokenUIVisibility(tokenId: string, visible: boolean): void {
    const ui = this.tokenUIs[tokenId];
    if (ui) {
      ui.getContainer().visible = visible;
    }
  }

  private setupUIHoverHandlers(tokenId: string, tokenGroup: Container): void {
    const ui = this.tokenUIs[tokenId];
    if (!ui) return;
    
    const uiContainer = ui.getContainer();
    
    // UI container must NOT be interactive — it sits at z=100 above tokens
    // and would intercept pointerdown events, blocking click and drag.
    uiContainer.eventMode = 'passive';
    uiContainer.interactiveChildren = false;

    // No pointer event listeners needed — hover state is driven by
    // TokenRenderer.onViewportPointerMove → UIManager.setHoverState().
  }

  /** Viewport-driven hover state update. Pass null to clear all hover. */
  public setHoverState(tokenId: string | null, modifierKeyDown = false): void {
    const changed = tokenId !== this._prevHoverId;
    const modChanged = modifierKeyDown !== this._prevModifier;
    this._prevModifier = modifierKeyDown;

    if (!changed && !modChanged) return;

    // Clear previous hover (only if the hovered token changed)
    if (changed && this._prevHoverId) {
      const prevUi = this.tokenUIs[this._prevHoverId];
      if (prevUi) {
        prevUi.setHoverState(false, false);
      }
    }

    if (changed) this._prevHoverId = tokenId;

    // Set / update hover on current token
    if (tokenId) {
      const ui = this.tokenUIs[tokenId];
      if (ui) {
        ui.setHoverState(true, modifierKeyDown);
      }
    }
  }

  private updateAllTokenSettings(): void {
    // Update all token UIs when settings change
    for (const tokenId in this.tokenUIs) {
      const ui = this.tokenUIs[tokenId];
      const token = this.store.getState().objects?.tokens?.[tokenId];
      if (ui && token && token.kind === 'character') {
        this.updateTokenUI(tokenId, token);
      }
    }
  }

  private getTokenSprite(tokenId: string): TokenGroupContainer | null {
    // This will need to be provided by TokenRenderer
    // For now, return null - will be fixed in integration
    return null;
  }

  // Public API for TokenRenderer integration

  setTokenSpriteProvider(provider: (tokenId: string) => TokenGroupContainer | null): void {
    this.getTokenSprite = provider;
  }

  /** Cached player overlays keep player preferences independent of the DM UI. */
  getPlayerViewLayers(settings: Pick<AtlasSettings['localPlayerView'], 'showTokenHP' | 'showTokenStress' | 'showTokenNameplates'>): LayerVisibility[] {
    if (!this.playerUIContainer) {
      this.playerUIContainer = new Container();
      this.playerUIContainer.zIndex = this.uiContainer.zIndex;
      this.playerUIContainer.eventMode = 'none';
      this.playerUIContainer.visible = false;
      this.viewport.addChild(this.playerUIContainer);
    }
    const state = this.store.getState();
    for (const tokenId of Object.keys(this.tokenUIs)) {
      const token = state.objects.tokens[tokenId];
      const sprite = this.getTokenSprite(tokenId);
      if (!token || token.kind !== 'character' || !sprite) continue;
      let ui = this.playerTokenUIs[tokenId];
      if (!ui) {
        ui = new TokenUIRenderer(this.store, this.viewId);
        this.playerTokenUIs[tokenId] = ui;
        this.playerUIContainer.addChild(ui.getContainer());
      }
      ui.conditionDefsProvider = this.conditionDefsProvider;
      ui.update(token, sprite.tokenSize || 70,
        1, state.grid?.size || 70, settings);
      ui.getContainer().position.copyFrom(sprite.position);
      ui.getContainer().renderable = sprite.visible && !token.isHidden;
    }
    return [
      { layer: this.uiContainer, visible: false },
      { layer: this.playerUIContainer, visible: true },
    ];
  }

  getUIContainer(): Container {
    return this.uiContainer;
  }

  getTokenUIs(): Record<string, TokenUIRenderer> {
    return this.tokenUIs;
  }

  getControlsUI(): TokenControlsUI | undefined {
    return this.tokenControlsUI;
  }

  getRotationUI(): TokenRotationUI | undefined {
    return this.tokenRotationUI;
  }

  getResizeUI(): TokenResizeUI | undefined {
    return this.tokenResizeUI;
  }
}
