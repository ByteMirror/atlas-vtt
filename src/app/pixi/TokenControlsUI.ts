import { Container, Graphics, Texture, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Character } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { colors, barDimensions } from '../styles/designTokens';
import { toError } from '../utils/errors';
import type { TokenGestureEventDetail } from '../types/atlasWindowEvents';
import { openValueEditor, type ResourceValue } from './tokenValueEditor';

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

  // Transparent hit areas over the bars; click opens the inline value editor
  private hpHit: Graphics;
  private stressHit: Graphics;
  private closeEditor: (() => void) | null = null;

  // Colors from design tokens
  private readonly HP_COLOR = colors.health.healthy;
  private readonly STRESS_COLOR = colors.stress.fill;
  private readonly DANGER_COLOR = colors.health.critical;

  // Token reference for positioning using design tokens
  private tokenSize: number = 70;
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
    
    this.hpHit = this.createBarHitArea();
    this.stressHit = this.createBarHitArea();
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
  
  private createBarHitArea(): Graphics {
    const hit = new Graphics();
    hit.eventMode = 'static';
    hit.cursor = 'text';
    hit.visible = false;
    return hit;
  }

  /** Draws the hit rectangle over a bar whose top edge sits at `barTop`. */
  private layoutBarHitArea(hit: Graphics, barTop: number): void {
    hit.clear();
    hit.rect(-this.barWidth / 2, barTop, this.barWidth, this.barHeight).fill({ color: 0xffffff, alpha: 0 });
    hit.visible = true;
  }

  private openEditor(barCenterY: number, value: ResourceValue, onCommit: (next: ResourceValue) => void): void {
    this.closeEditor?.();
    const global = this.container.toGlobal({ x: 0, y: barCenterY });
    this.closeEditor = openValueEditor({
      anchorEl: this.viewport.options.events.domElement,
      screenX: global.x,
      screenY: global.y,
      value,
      onCommit: (next) => {
        this.closeEditor = null;
        onCommit(next);
      },
    });
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
  
  public show(tokenId: string, worldX: number, worldY: number, tokenSize: number): void {
    const state = this.store.getState();
    const token = state.objects.tokens[tokenId] as Character | undefined;
    
    if (token?.hp === undefined && token?.stress === undefined) {
      this.hide();
      return;
    }
    
    this.currentTokenId = tokenId;
    this.tokenSize = tokenSize;
    
    // Position container at token position
    this.container.position.set(worldX, worldY);
    
    // Update scale before updating buttons to ensure consistent positioning
    this.updateScale();
    
    // Update button visibility and handlers
    this.updateButtons(token);
    
    // Make container visible (unless hidden during resize or rotation)
    this.container.visible = !this.isHiddenDuringResize && !this.isHiddenDuringRotation;
  }
  
  public hide(): void {
    this.currentTokenId = null;
    this.container.visible = false;
    this.closeEditor?.();
    this.closeEditor = null;
    this.hpHit.visible = false;
    this.stressHit.visible = false;
    
    // Remove all click handlers
    this.hpMinusBtn.removeAllListeners('pointerdown');
    this.hpPlusBtn.removeAllListeners('pointerdown');
    this.stressMinusBtn.removeAllListeners('pointerdown');
    this.stressPlusBtn.removeAllListeners('pointerdown');
  }
  
  public updatePosition(worldX: number, worldY: number, tokenSize: number): void {
    if (!this.isVisible) return;
    
    this.tokenSize = tokenSize;
    this.container.position.set(worldX, worldY);
    this.updateScale();
  }
  
  private get isVisible(): boolean {
    return this.container.visible;
  }
  
  private updateScale(): void {
    // Get grid size from store
    const gridSize = this.store.getState().grid?.size || 70;
    
    // Calculate UI scale to match TokenUIRenderer
    const baseUISize = 70;
    const uiScale = gridSize / baseUISize;
    
    // Apply scale to container
    this.container.scale.set(uiScale);
  }
  
  private updateButtons(token: Character): void {
    // Clear existing handlers
    this.hpMinusBtn.removeAllListeners('pointerdown');
    this.hpPlusBtn.removeAllListeners('pointerdown');
    this.stressMinusBtn.removeAllListeners('pointerdown');
    this.stressPlusBtn.removeAllListeners('pointerdown');
    this.hpHit.removeAllListeners('pointerdown');
    this.stressHit.removeAllListeners('pointerdown');
    
    // Use design tokens (this.barWidth / this.barHeight) — not hardcoded values
    const barWidth = this.barWidth;
    const barHeight = this.barHeight;
    const buttonSize = 10;
    const gap = barDimensions.token.gap;
    const baseGap = 2;
    
    // Calculate token radius in UI units
    const gridSize = this.store.getState().grid?.size || 70;
    const uiScale = gridSize / 70;
    const tokenRadiusInUIUnits = (this.tokenSize / 2) / uiScale;
    
    // Match TokenUIRenderer positioning - currentY is top of bar, not center
    let currentY = tokenRadiusInUIUnits + baseGap; // Top of first bar
    
    // HP buttons
    if (token.hp && typeof token.hp === 'object' && typeof token.hp.max === 'number') {
      this.hpMinusBtn.visible = true;
      this.hpPlusBtn.visible = true;
      
      // Redraw buttons to ensure they display correctly
      this.drawButtonState(this.hpMinusBtn, false);
      this.drawButtonState(this.hpPlusBtn, false);
      
      // Position beside the bar — gap matches the vertical inter-bar gap
      const buttonOffset = barWidth / 2 + buttonSize / 2 + gap;
      const barTop = currentY;
      const barCenterY = barTop + barHeight / 2; // Center of the bar
      this.hpMinusBtn.position.set(-buttonOffset, barCenterY);
      this.hpPlusBtn.position.set(buttonOffset, barCenterY);
      
      // Add click handlers
      this.hpMinusBtn.on('pointerdown', (e) => {
        e.stopPropagation();
        this.updateTokenHP(token, -1);
      });
      this.hpPlusBtn.on('pointerdown', (e) => {
        e.stopPropagation();
        this.updateTokenHP(token, 1);
      });

      const hp = token.hp;
      this.layoutBarHitArea(this.hpHit, barTop);
      this.hpHit.on('pointerdown', (e) => {
        e.preventDefault(); // Keep the canvas's default focus from closing the editor.
        e.stopPropagation();
        this.openEditor(barCenterY, hp, (next) => this.setTokenValue({ hp: { ...hp, ...next } }));
      });
      
      currentY += barHeight + gap;
    } else {
      this.hpMinusBtn.visible = false;
      this.hpPlusBtn.visible = false;
      this.hpHit.visible = false;
    }
    
    // Stress buttons — mirror TokenUIRenderer's hasStress logic
    const tokenSettings = this.store.getState().tokenSettings || { showStressBars: true };
    const hasStress = token.stress !== undefined && tokenSettings.showStressBars;
    if (hasStress && typeof token.stress === 'number' && typeof token.maxStress === 'number') {
      this.stressMinusBtn.visible = true;
      this.stressPlusBtn.visible = true;
      
      // Redraw buttons to ensure they display correctly
      this.drawButtonState(this.stressMinusBtn, false);
      this.drawButtonState(this.stressPlusBtn, false);
      
      // Position beside the bar — gap matches the vertical inter-bar gap
      const buttonOffset = barWidth / 2 + buttonSize / 2 + gap;
      const barTop = currentY;
      const barCenterY = barTop + barHeight / 2; // Center of the bar
      this.stressMinusBtn.position.set(-buttonOffset, barCenterY);
      this.stressPlusBtn.position.set(buttonOffset, barCenterY);
      
      // Add click handlers
      this.stressMinusBtn.on('pointerdown', (e) => {
        e.stopPropagation();
        this.updateTokenStress(token, -1);
      });
      this.stressPlusBtn.on('pointerdown', (e) => {
        e.stopPropagation();
        this.updateTokenStress(token, 1);
      });

      const stress = { current: token.stress, max: token.maxStress };
      this.layoutBarHitArea(this.stressHit, barTop);
      this.stressHit.on('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openEditor(barCenterY, stress, (next) => this.setTokenValue({ stress: next.current, maxStress: next.max }));
      });
    } else {
      this.stressMinusBtn.visible = false;
      this.stressPlusBtn.visible = false;
      this.stressHit.visible = false;
    }
  }
  
  private updateTokenHP(token: Character, delta: number): void {
    if (!this.currentTokenId || !token.hp || typeof token.hp !== 'object') return;
    
    const currentHP = token.hp.current;
    const maxHP = token.hp.max;
    const newHP = Math.max(0, Math.min(maxHP, currentHP + delta));
    
    this.setTokenValue({ hp: { ...token.hp, current: newHP } });
  }
  
  private updateTokenStress(token: Character, delta: number): void {
    if (!this.currentTokenId || typeof token.stress !== 'number' || typeof token.maxStress !== 'number') return;
    
    const currentStress = token.stress;
    const maxStress = token.maxStress;
    const newStress = Math.max(0, Math.min(maxStress, currentStress + delta));
    
    this.setTokenValue({ stress: newStress });
  }

  /** Writes the update to the store and re-lays out controls from the fresh token. */
  private setTokenValue(updates: Parameters<ViewAtlasState['updateToken']>[1]): void {
    if (!this.currentTokenId) return;
    this.store.getState().updateToken(this.currentTokenId, updates);
    const updatedToken = this.store.getState().objects.tokens[this.currentTokenId] as Character | undefined;
    if (updatedToken) {
      this.updateButtons(updatedToken);
      this.updateScale();
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
    
    this.closeEditor?.();
    this.closeEditor = null;

    // Remove all listeners
    this.buttons.forEach(btn => {
      btn.removeAllListeners();
    });
    
    // Clear texture cache
    this.iconTextureCache.clear();
    
    // Destroy graphics
    this.container.destroy({ children: true });
  }
}
