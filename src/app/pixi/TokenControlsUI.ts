import { Container, Graphics, Texture, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Character } from '../types';
import type { TokenUpdates, ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { colors, barDimensions } from '../styles/designTokens';
import { toError } from '../utils/errors';
import type { TokenGestureEventDetail } from '../types/atlasWindowEvents';
import { openResourceEditor, type BarAnchor, type ResourceEditor, type ResourceValue } from './tokenValueEditor';
import { ResourceBarHitArea } from './ResourceBarHitArea';
import { destroyTree } from './utils/destroyTree';
import { resourceUpdates, visibleResourceBars } from './token-renderer/tokenResources';

type ControlIconType = 'plus' | 'minus';

/** Round +/- button; keeps what `drawButtonState` needs to redraw it. */
interface ControlButton extends Container {
  bg: Graphics;
  iconType: ControlIconType;
  iconColor: number;
}

export class TokenControlsUI {
  private container: Container;
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private currentTokenId: string | null = null;
  private buttons: ControlButton[] = [];
  private isHiddenDuringResize: boolean = false;
  private isHiddenDuringRotation: boolean = false;
  private isDestroyed: boolean = false;

  // Button containers
  private hpMinusBtn: ControlButton;
  private hpPlusBtn: ControlButton;
  private stressMinusBtn: ControlButton;
  private stressPlusBtn: ControlButton;

  // Overlays on the bars; click opens the value popover below the bar
  private hpHit: ResourceBarHitArea;
  private stressHit: ResourceBarHitArea;
  private editor: ResourceEditor | null = null;
  private followEditor: (() => void) | null = null;

  // Colors from design tokens
  private readonly HP_COLOR = colors.health.healthy;
  private readonly STRESS_COLOR = colors.stress.fill;
  private readonly DANGER_COLOR = colors.health.critical;

  // Bar geometry from design tokens
  private barHeight: number = barDimensions.token.height;
  private barWidth: number = barDimensions.token.width;
  
  // Icon SVG definitions (Lucide React Plus and Minus icons)
  private readonly ICON_SVGS = {
    plus: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"/>
      <path d="M12 5v14"/>
    </svg>`,
    minus: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"/>
    </svg>`
  };
  
  // Texture cache for icons
  private iconTextureCache: Map<string, Texture> = new Map();
  
  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.viewport = viewport;
    this.store = store;
    
    // Create main container
    this.container = new Container();
    this.container.visible = false;
    this.container.eventMode = 'passive'; // Allow events to pass through to tokens
    this.container.sortableChildren = true;

    // Don't stop propagation at container level - let individual buttons handle it
    
    // Create buttons first (without icons)
    this.hpMinusBtn = this.createButton('minus', this.DANGER_COLOR);
    this.hpPlusBtn = this.createButton('plus', this.HP_COLOR);
    this.stressMinusBtn = this.createButton('minus', this.DANGER_COLOR);
    this.stressPlusBtn = this.createButton('plus', this.STRESS_COLOR);
    
    // Initialize icon textures and redraw buttons when ready
    this.initializeIconTextures().then(() => {
      // Check if instance was destroyed while textures were loading
      if (this.isDestroyed) {
        return;
      }
      
      // Ensure buttons still exist before redrawing (might be destroyed during map switch)
      if (this.hpMinusBtn && !this.hpMinusBtn.destroyed) {
        this.drawButtonState(this.hpMinusBtn, false);
      }
      if (this.hpPlusBtn && !this.hpPlusBtn.destroyed) {
        this.drawButtonState(this.hpPlusBtn, false);
      }
      if (this.stressMinusBtn && !this.stressMinusBtn.destroyed) {
        this.drawButtonState(this.stressMinusBtn, false);
      }
      if (this.stressPlusBtn && !this.stressPlusBtn.destroyed) {
        this.drawButtonState(this.stressPlusBtn, false);
      }
    }).catch(err => {
      console.error('[TokenControlsUI] Failed to initialize textures:', err);
    });
    
    this.hpHit = new ResourceBarHitArea(this.HP_COLOR);
    this.stressHit = new ResourceBarHitArea(this.STRESS_COLOR);
    this.container.addChild(this.hpHit);
    this.container.addChild(this.stressHit);

    // Add all buttons to container
    this.container.addChild(this.hpMinusBtn);
    this.container.addChild(this.hpPlusBtn);
    this.container.addChild(this.stressMinusBtn);
    this.container.addChild(this.stressPlusBtn);
    
    // Initially hide all buttons
    this.hpMinusBtn.visible = false;
    this.hpPlusBtn.visible = false;
    this.stressMinusBtn.visible = false;
    this.stressPlusBtn.visible = false;
    
    // Add to viewport
    this.viewport.addChild(this.container);
    
    // Listen for resize events to hide/show controls
    window.addEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.addEventListener('atlas-token-resize-ended', this.onResizeEnded);
    
    // Listen for rotation events to hide/show controls
    window.addEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.addEventListener('atlas-token-rotation-ended', this.onRotationEnded);
  }
  
  private async initializeIconTextures(): Promise<void> {
    // Create textures for each icon type and color combination
    const colors = [
      { name: 'danger', hex: this.DANGER_COLOR },
      { name: 'hp', hex: this.HP_COLOR },
      { name: 'stress', hex: this.STRESS_COLOR }
    ];
    
    const svgSize = 48; // Match status badge icon size
    
    for (const [iconType, svgTemplate] of Object.entries(this.ICON_SVGS)) {
      for (const color of colors) {
        const key = `${iconType}-${color.name}`;
        const colorHex = `#${color.hex.toString(16).padStart(6, '0')}`;
        const svg = svgTemplate.replace(/currentColor/g, colorHex);
        
        // Create canvas following TokenUIRenderer pattern
        const canvas = createEl('canvas');
        canvas.width = svgSize;
        canvas.height = svgSize;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              try {
                ctx.drawImage(img, 0, 0, svgSize, svgSize);
                const texture = Texture.from(canvas);
                this.iconTextureCache.set(key, texture);
                resolve();
              } catch (err) {
                console.error(`[TokenControlsUI] Failed to create texture for ${key}:`, err);
                reject(toError(err, 'Failed to build icon texture'));
              }
            };
            img.onerror = (err) => {
              console.error(`[TokenControlsUI] Failed to load SVG for ${key}:`, err);
              reject(toError(err, 'Failed to build icon texture'));
            };
            img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
          });
        }
      }
    }
  }
  
  private createButton(iconType: ControlIconType, iconColor: number): ControlButton {
    const bg = new Graphics();
    const button: ControlButton = Object.assign(new Container(), { bg, iconType, iconColor });
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.addChild(bg);
    
    // Draw initial state
    this.drawButtonState(button, false);
    
    // Add hover handlers
    button.on('pointerover', () => this.drawButtonState(button, true));
    button.on('pointerout', () => this.drawButtonState(button, false));
    
    this.buttons.push(button);
    return button;
  }
  
  /** Wires a bar overlay so clicking it opens the popover for `value` under that bar. */
  private bindBarEditor(hit: ResourceBarHitArea, barTop: number, value: ResourceValue, resourceLabel: string, onCommit: (next: ResourceValue) => void): void {
    hit.layout(barTop);
    hit.on('pointerdown', (e) => {
      e.preventDefault(); // Keep the canvas's default focus from stealing the popover's focus.
      e.stopPropagation();
      this.openEditor(hit, barTop, value, resourceLabel, onCommit);
    });
  }

  private openEditor(hit: ResourceBarHitArea, barTop: number, value: ResourceValue, resourceLabel: string, onCommit: (next: ResourceValue) => void): void {
    this.editor?.close();
    hit.setActive(true);
    const follow = (): void => this.editor?.reposition(this.barAnchor(barTop));
    this.followEditor = follow;
    this.viewport.on('moved', follow);
    this.viewport.on('zoomed', follow);
    this.editor = openResourceEditor({
      anchorEl: this.viewport.options.events.domElement,
      anchor: this.barAnchor(barTop),
      value,
      resourceLabel,
      onCommit,
      onClose: () => {
        this.viewport.off('moved', follow);
        this.viewport.off('zoomed', follow);
        this.editor = null;
        this.followEditor = null;
        if (!hit.destroyed) hit.setActive(false);
      },
    });
  }

  /** Screen-space anchor of the bar at `barTop`, in canvas-local pixels. */
  private barAnchor(barTop: number): BarAnchor {
    const topLeft = this.container.toGlobal({ x: -this.barWidth / 2, y: barTop });
    const bottomRight = this.container.toGlobal({ x: this.barWidth / 2, y: barTop + this.barHeight });
    return { x: (topLeft.x + bottomRight.x) / 2, top: topLeft.y, bottom: bottomRight.y };
  }

  private drawButtonState(button: ControlButton, isHover: boolean): void {
    const { bg, iconType, iconColor } = button;
    
    // The icon textures load asynchronously, so a redraw can arrive after destroy
    if (bg.destroyed) {
      console.warn('[TokenControlsUI] drawButtonState called with invalid bg Graphics');
      return;
    }
    
    bg.clear();
    
    // Get theme colors
    const isDarkMode = document.body.classList.contains('theme-dark');
    const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
    const strokeColor = isDarkMode ? 0xffffff : 0x000000;
    const strokeAlpha = isDarkMode ? 0.4 : 0.3;
    
    // Draw background - circular like status badges
    const size = 10; // Small button size to match bar height better
    const radius = size / 2;
    
    // Background fill
    bg.fill({ color: bgColor, alpha: 1 });
    bg.circle(0, 0, radius);
    bg.fill();
    
    // Stroke with proper line style - thinner like status badges
    bg.setStrokeStyle({ width: 0.5, color: strokeColor, alpha: isHover ? strokeAlpha * 1.5 : strokeAlpha });
    bg.stroke();
    bg.circle(0, 0, radius);
    bg.stroke();
    
    // Remove old icon if exists
    while (button.children.length > 1) {
      const oldIcon = button.removeChildAt(1);
      if (oldIcon instanceof Sprite) {
        oldIcon.destroy();
      }
    }
    
    // Add icon sprite
    const colorName = iconColor === this.DANGER_COLOR ? 'danger' : 
                     iconColor === this.HP_COLOR ? 'hp' : 'stress';
    const textureKey = `${iconType}-${colorName}`;
    const iconTexture = this.iconTextureCache.get(textureKey);
    
    if (iconTexture) {
      const iconSprite = new Sprite(iconTexture);
      iconSprite.anchor.set(0.5);
      iconSprite.scale.set(size * 0.5 / 48); // Scale from 48px SVG to fit button
      iconSprite.position.set(0, 0);
      iconSprite.alpha = 1;
      button.addChild(iconSprite);
    }
  }
  
  /** Shows the controls under a token whose bars are drawn at `uiScale`. */
  public show(tokenId: string, worldX: number, worldY: number, tokenSize: number, uiScale: number): void {
    const state = this.store.getState();
    const token = state.objects.tokens[tokenId] as Character | undefined;
    
    if (!token || visibleResourceBars(token, this.barSettings()).length === 0) {
      this.hide();
      return;
    }
    
    this.currentTokenId = tokenId;
    this.placeBelowToken(worldX, worldY, tokenSize);
    this.container.scale.set(uiScale);

    // Update button visibility and handlers
    this.updateButtons(token);
    
    // Make container visible (unless hidden during resize or rotation)
    this.container.visible = !this.isHiddenDuringResize && !this.isHiddenDuringRotation;
  }
  
  public hide(): void {
    this.currentTokenId = null;
    this.container.visible = false;
    this.editor?.close();
    this.hpHit.hide();
    this.stressHit.hide();
    
    // Remove all click handlers
    this.hpMinusBtn.removeAllListeners('pointerdown');
    this.hpPlusBtn.removeAllListeners('pointerdown');
    this.stressMinusBtn.removeAllListeners('pointerdown');
    this.stressPlusBtn.removeAllListeners('pointerdown');
  }
  
  public updatePosition(worldX: number, worldY: number, tokenSize: number): void {
    if (!this.isVisible) return;
    
    this.placeBelowToken(worldX, worldY, tokenSize);
    this.followEditor?.();
  }

  /** Lays the controls out for `tokenId`'s new size, also while a resize gesture hides them. */
  public followTokenSize(tokenId: string, worldX: number, worldY: number, tokenSize: number): void {
    if (tokenId !== this.currentTokenId) return;
    this.placeBelowToken(worldX, worldY, tokenSize);
    this.followEditor?.();
  }

  /** Matches the controls to the scale of `tokenId`'s bars as it changes. */
  public setScaleFor(tokenId: string, uiScale: number): void {
    if (tokenId !== this.currentTokenId) return;
    this.container.scale.set(uiScale);
    this.followEditor?.();
  }

  private get isVisible(): boolean {
    return this.container.visible;
  }

  /** Anchors the controls at the bottom edge of the token centred at (`worldX`, `worldY`), like its bars. */
  private placeBelowToken(worldX: number, worldY: number, tokenSize: number): void {
    this.container.position.set(worldX, worldY + tokenSize / 2);
  }
  
  private updateButtons(token: Character): void {
    // Clear existing handlers
    this.hpMinusBtn.removeAllListeners('pointerdown');
    this.hpPlusBtn.removeAllListeners('pointerdown');
    this.stressMinusBtn.removeAllListeners('pointerdown');
    this.stressPlusBtn.removeAllListeners('pointerdown');
    this.hpHit.removeAllListeners('pointerdown');
    this.stressHit.removeAllListeners('pointerdown');
    this.hideResourceBar(this.hpHit, this.hpMinusBtn, this.hpPlusBtn);
    this.hideResourceBar(this.stressHit, this.stressMinusBtn, this.stressPlusBtn);

    // Same bars, order and offsets as TokenUIRenderer, so each overlay sits on its bar
    let barTop = 2;
    for (const { kind, value } of visibleResourceBars(token, this.barSettings())) {
      const apply = (next: ResourceValue): TokenUpdates => resourceUpdates(token, kind, value, next);
      const setCurrent = (delta: number): void =>
        this.setTokenValue(apply({ ...value, current: Math.max(0, Math.min(value.max, value.current + delta)) }));
      if (kind === 'hp') {
        this.bindResourceBar(this.hpHit, this.hpMinusBtn, this.hpPlusBtn, barTop, value, 'HP', setCurrent, (next) => this.setTokenValue(apply(next)));
      } else {
        this.bindResourceBar(this.stressHit, this.stressMinusBtn, this.stressPlusBtn, barTop, value, 'secondary resource', setCurrent, (next) => this.setTokenValue(apply(next)));
      }
      barTop += this.barHeight + barDimensions.token.gap;
    }
  }

  private barSettings(): { showHPBars: boolean; showStressBars: boolean } {
    const { showHPBars = true, showStressBars = true } = this.store.getState().tokenSettings ?? {};
    return { showHPBars, showStressBars };
  }

  /** Shows one bar's +/- buttons beside it and its click-to-edit overlay on top of it. */
  private bindResourceBar(
    hit: ResourceBarHitArea, minusBtn: ControlButton, plusBtn: ControlButton, barTop: number,
    value: ResourceValue, resourceLabel: string, onDelta: (delta: number) => void, onCommit: (next: ResourceValue) => void,
  ): void {
    const buttonSize = 10;
    const buttonOffset = this.barWidth / 2 + buttonSize / 2 + barDimensions.token.gap;
    const barCenterY = barTop + this.barHeight / 2;
    for (const [button, delta] of [[minusBtn, -1], [plusBtn, 1]] as const) {
      button.visible = true;
      this.drawButtonState(button, false);
      button.position.set(Math.sign(delta) * buttonOffset, barCenterY);
      button.on('pointerdown', (e) => {
        e.stopPropagation();
        onDelta(delta);
      });
    }
    this.bindBarEditor(hit, barTop, value, resourceLabel, onCommit);
  }

  private hideResourceBar(hit: ResourceBarHitArea, minusBtn: ControlButton, plusBtn: ControlButton): void {
    minusBtn.visible = false;
    plusBtn.visible = false;
    hit.hide();
  }

  /** Writes the update to the store and re-lays out controls from the fresh token. */
  private setTokenValue(updates: TokenUpdates): void {
    if (!this.currentTokenId) return;
    this.store.getState().updateToken(this.currentTokenId, updates);
    const updatedToken = this.store.getState().objects.tokens[this.currentTokenId] as Character | undefined;
    if (updatedToken) {
      this.updateButtons(updatedToken);
    }
  }
  
  /**
   * Handle resize started events - hide controls
   */
  private onResizeStarted = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizingTokenIds = e.detail.tokenIds;
    
    // Only hide controls if this token is being resized
    if (this.currentTokenId && resizingTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringResize = true;
      this.container.visible = false;
    }
  };
  
  /**
   * Handle resize ended events - show controls if they should be visible
   */
  private onResizeEnded = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizedTokenIds = e.detail.tokenIds;
    
    // Only restore controls if this token was being resized
    if (this.currentTokenId && resizedTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringResize = false;
      // Restore visibility if not hidden by other operations
      if (!this.isHiddenDuringRotation) {
        this.container.visible = true;
      }
    }
  };
  
  /**
   * Handle rotation started events - hide controls
   */
  private onRotationStarted = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const rotatingTokenIds = e.detail.tokenIds;
    
    // Only hide controls if this token is being rotated
    if (this.currentTokenId && rotatingTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringRotation = true;
      this.container.visible = false;
    }
  };
  
  /**
   * Handle rotation ended events - show controls if they should be visible
   */
  private onRotationEnded = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const rotatedTokenIds = e.detail.tokenIds;
    
    // Only restore controls if this token was being rotated
    if (this.currentTokenId && rotatedTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringRotation = false;
      // Restore visibility if not hidden by other operations
      if (!this.isHiddenDuringResize) {
        this.container.visible = true;
      }
    }
  };
  
  public getContainer(): Container {
    return this.container;
  }

  public destroy(): void {
    // Mark as destroyed to prevent async operations
    this.isDestroyed = true;
    
    // Remove resize event listeners
    window.removeEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.removeEventListener('atlas-token-resize-ended', this.onResizeEnded);
    
    // Remove rotation event listeners
    window.removeEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.removeEventListener('atlas-token-rotation-ended', this.onRotationEnded);
    
    this.editor?.close();

    // Remove all listeners
    this.buttons.forEach(btn => {
      btn.removeAllListeners();
    });
    
    // Clear texture cache
    this.iconTextureCache.clear();
    
    // Destroy graphics
    destroyTree(this.container);
  }
}
