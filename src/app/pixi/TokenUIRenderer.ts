import type { AtlasSettings } from '../services/SettingsService';
import { Container, Graphics, Text, TextStyle, Texture, FillGradient } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Character, BaseToken } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { colors, barDimensions, getHealthColor, lightenColor, darkenColor } from '../styles/designTokens';
import { ConditionDotsRenderer } from './token-renderer/ConditionDotsRenderer';
import { ConditionHoverPanel } from './token-renderer/ConditionHoverPanel';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';

/**
 * Text is drawn at scale 0.333 and the viewport zooms to at most 5x, so a
 * resolution of 3 keeps glyphs crisp on HiDPI screens without rasterising
 * every nameplate at eight times its size.
 */
const TEXT_RESOLUTION = 3;

/**
 * Metallic bar gradients depend only on the base colour, so one FillGradient
 * (and its backing texture) is shared by every token bar of that colour.
 */
const barGradientCache = new Map<number, FillGradient>();

function getBarGradient(baseColor: number): FillGradient {
  let gradient = barGradientCache.get(baseColor);
  if (!gradient) {
    gradient = new FillGradient({
      type: 'linear',
      colorStops: [
        { offset: 0, color: lightenColor(baseColor, 0.5) },
        { offset: 0.15, color: lightenColor(baseColor, 0.25) },
        { offset: 0.4, color: baseColor },
        { offset: 0.6, color: darkenColor(baseColor, 0.1) },
        { offset: 0.85, color: darkenColor(baseColor, 0.2) },
        { offset: 1, color: lightenColor(baseColor, 0.15) },
      ],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    });
    barGradientCache.set(baseColor, gradient);
  }
  return gradient;
}

export class TokenUIRenderer {
  private barTextureCache: Map<string, Texture> = new Map();

  private container: Container;
  private hpBar: Graphics;
  private hpFill: Graphics;
  private hpText: Text;
  private stressBar: Graphics;
  private stressFill: Graphics;
  private stressText: Text;
  private difficultyBadge: Container;
  private difficultyText: Text;
  private defeatedOverlay: Graphics;
  private themeObserver: MutationObserver | null = null;
  private editThemeObserver: MutationObserver | null = null;
  private currentToken: (BaseToken & Partial<Character>) | null = null;
  private currentTokenSize: number = 0;
  private isHovered: boolean = false;
  private isSelected: boolean = false;
  private fadeAnimation: number | null = null;
  private store: StoreApi<ViewAtlasState> | undefined;
  private lastUpdateData: string = ''; // Cache for checking if update is needed
  private isHiddenDuringResize: boolean = false;
  private isHiddenDuringRotation: boolean = false;
  
  // Name badge elements
  private nameBadge: Graphics;
  private nameText: Text;
  
  // Inline editing state
  private isEditingName: boolean = false;
  private editInput: HTMLInputElement | null = null;
  private originalName: string = '';
  private editCursor: Graphics;
  private cursorBlinkInterval: number | null = null;

  private viewport: Viewport | undefined;

  // Condition UI
  private conditionDots: ConditionDotsRenderer;
  private conditionPanel: ConditionHoverPanel;
  public conditionDefsProvider: (() => ConditionDefinition[]) | null = null;
  

  constructor(store?: StoreApi<ViewAtlasState>, viewId?: string, viewport?: Viewport) {
    this.store = store;
    this.viewport = viewport;

    // Condition dots and hover panel
    this.conditionDots = new ConditionDotsRenderer();
    this.conditionPanel = new ConditionHoverPanel();

    this.container = new Container();
    this.container.sortableChildren = true; // Needed for condition dots to render above bars
    this.container.zIndex = 10; // UI is above token and ring
    // Don't set eventMode on container - let it propagate naturally
    
    // Create HP bar
    this.hpBar = new Graphics();
    this.hpBar.zIndex = 10; // HP bar above status badges
    this.hpFill = new Graphics();
    this.hpFill.zIndex = 11; // HP fill above bar background
    this.hpText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
        fontSize: 18, // Base font size for 70px token
        fill: 0xffffff,
        fontWeight: '600',
        stroke: { color: 0x000000, width: 2 }
      })
    });
    this.hpText.scale.set(0.333); // Will be adjusted dynamically based on token size
    this.hpText.resolution = TEXT_RESOLUTION;
    this.hpText.zIndex = 12; // Text on top of HP bar
    this.hpText.alpha = 0; // Start with text hidden
    
    // Create stress bar
    this.stressBar = new Graphics();
    this.stressBar.zIndex = 10; // Stress bar above status badges
    this.stressFill = new Graphics();
    this.stressFill.zIndex = 11; // Stress fill above bar background
    // Event mode not set - let events propagate naturally
    // this.stressFill also doesn't need eventMode set
    this.stressText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
        fontSize: 18, // Base font size for 70px token
        fill: 0xffffff,
        fontWeight: '600',
        stroke: { color: 0x000000, width: 2 }
      })
    });
    this.stressText.scale.set(0.333); // Will be adjusted dynamically based on token size
    this.stressText.resolution = TEXT_RESOLUTION;
    this.stressText.zIndex = 12; // Text on top of stress bar
    this.stressText.alpha = 0; // Start with text hidden
    // Event mode not set - let events propagate naturally
    
    // Create difficulty badge
    this.difficultyBadge = new Container();
    this.difficultyBadge.zIndex = 5; // Not used anymore but keeping for compatibility
    // Event mode not set - let events propagate naturally
    this.difficultyText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Arial',
        fontSize: 10,
        fill: 0xffffff,
        fontWeight: 'bold'
      }),
      resolution: TEXT_RESOLUTION,
    });
    // Event mode not set - let events propagate naturally
    
    // Create defeated overlay
    this.defeatedOverlay = new Graphics();
    this.defeatedOverlay.zIndex = 30; // Defeated overlay on top of everything
    // Event mode not set - let events propagate naturally
    
    // Create name badge elements
    this.nameBadge = new Graphics();
    this.nameBadge.zIndex = 1; // Name badge at very bottom
    this.nameBadge.eventMode = 'static'; // Make it interactive
    this.nameBadge.cursor = 'text'; // Show text cursor on hover
    
    this.nameText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
        fontSize: 24, // Base font size for 70px token
        fill: 0xffffff,
        fontWeight: '600'
        // No stroke for cleaner look in the badge.
      })
    });
    this.nameText.scale.set(0.333); // Will be adjusted dynamically based on token size
    this.nameText.resolution = TEXT_RESOLUTION;
    this.nameText.zIndex = 2; // Name text above name badge background
    
    // Add click handler to name badge
    this.nameBadge.on('pointerdown', (e) => {
      e.stopPropagation(); // Prevent token dragging
      this.startNameEdit();
    });
    
    // Create edit cursor (initially hidden)
    this.editCursor = new Graphics();
    this.editCursor.zIndex = 3; // Above name text
    this.editCursor.visible = false;
    
    // Add all elements to container in the correct order (no sorting needed)
    this.container.addChild(this.nameBadge); // z: 1 - name badge at bottom
    this.container.addChild(this.nameText); // z: 2 - name text
    this.container.addChild(this.editCursor); // z: 3 - edit cursor
    this.container.addChild(this.hpBar); // z: 10
    this.container.addChild(this.hpFill); // z: 11  
    this.container.addChild(this.hpText); // z: 12
    this.container.addChild(this.stressBar); // z: 10
    this.container.addChild(this.stressFill); // z: 11
    this.container.addChild(this.stressText); // z: 12
    this.container.addChild(this.difficultyBadge); // z: 20
    this.container.addChild(this.difficultyText); // z: 21
    this.container.addChild(this.defeatedOverlay); // z: 30 - on top
    this.conditionDots.container.zIndex = 25; // Above HP bars (12) and nameplate (2)
    this.container.addChild(this.conditionDots.container); // Condition dots between nameplate and HP bar
    this.conditionPanel.container.zIndex = 26;
    this.container.addChild(this.conditionPanel.container); // Hover panel to the right
    
    // Initially visible
    this.container.visible = true;
    this.container.alpha = 1;
    
    
    // Set up theme observer
    this.setupThemeObserver();
    
    // Set up viewport zoom listeners for UI scaling updates
    this.setupViewportListeners();
  }
  
  private setupViewportListeners(): void {
    // Listen for viewport zoom events to update UI scaling
    if (this.viewport) {
      // Listen for viewport resize events to update dynamic sizing
      this.viewport.on('resize', this.handleViewportResize);
    }
    
    // Listen for window resize events for responsive design
    window.addEventListener('resize', this.handleWindowResize);
    
    // Listen for token resize events to hide/show UI elements
    window.addEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.addEventListener('atlas-token-resize-ended', this.onResizeEnded);
    
    // Listen for token rotation events to hide/show UI elements
    window.addEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.addEventListener('atlas-token-rotation-ended', this.onRotationEnded);
  }
  
  private handleViewportResize = (): void => {
    // Viewport dimensions changed - update dynamic sizing
    if (this.currentToken && this.currentTokenSize > 0) {
      this.lastUpdateData = ''; // Clear cache to force update
      this.update(this.currentToken, this.currentTokenSize);
    }
  };
  
  private handleWindowResize = (): void => {
    // Window dimensions changed - update responsive design
    // Throttle window resize events to avoid performance issues
    if (this.resizeTimeout) {
      window.clearTimeout(this.resizeTimeout);
    }
    
    this.resizeTimeout = window.setTimeout(() => {
      if (this.currentToken && this.currentTokenSize > 0) {
        this.lastUpdateData = ''; // Clear cache to force update
        this.update(this.currentToken, this.currentTokenSize);
      }
    }, 100) as any; // 100ms throttle
  };
  
  private resizeTimeout: number | null = null;
  
  /**
   * Handle resize started events - hide UI elements except resize handles
   */
  private onResizeStarted = (e: Event): void => {
    const customEvent = e as CustomEvent;
    const resizingTokenIds = customEvent.detail?.tokenIds || [];
    
    // Only hide UI if this token is being resized
    if (this.currentToken && resizingTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringResize = true;
      
      // Hide HP/stress bars and status badges during resize
      this.hpBar.visible = false;
      this.hpFill.visible = false;
      this.hpText.visible = false;
      this.stressBar.visible = false;
      this.stressFill.visible = false;
      this.stressText.visible = false;
      this.nameBadge.visible = false;
      this.nameText.visible = false;
    }
  };

  /**
   * Handle resize ended events - show UI elements again
   */
  private onResizeEnded = (e: Event): void => {
    const customEvent = e as CustomEvent;
    const resizedTokenIds = customEvent.detail?.tokenIds || [];
    
    // Only restore UI if this token was being resized
    if (this.currentToken && resizedTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringResize = false;
      
      // Force a re-render to show UI elements with correct visibility
      if (this.currentTokenSize > 0) {
        this.lastUpdateData = ''; // Clear cache to force update
        this.update(this.currentToken, this.currentTokenSize);
      }
    }
  };
  
  /**
   * Handle rotation started events - hide UI elements except rotation handles
   */
  private onRotationStarted = (e: Event): void => {
    const customEvent = e as CustomEvent;
    const rotatingTokenIds = customEvent.detail?.tokenIds || [];
    
    // Only hide UI if this token is being rotated
    if (this.currentToken && rotatingTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringRotation = true;
      
      // Hide HP/stress bars and status badges during rotation
      this.hpBar.visible = false;
      this.hpFill.visible = false;
      this.hpText.visible = false;
      this.stressBar.visible = false;
      this.stressFill.visible = false;
      this.stressText.visible = false;
      this.defeatedOverlay.visible = false;
      this.nameBadge.visible = false;
      this.nameText.visible = false;
    }
  };
  
  /**
   * Handle rotation ended events - show UI elements again
   */
  private onRotationEnded = (e: Event): void => {
    const customEvent = e as CustomEvent;
    const rotatedTokenIds = customEvent.detail?.tokenIds || [];
    
    // Only restore UI if this token was being rotated
    if (this.currentToken && rotatedTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringRotation = false;
      
      // Force a re-render to show UI elements with correct visibility
      if (this.currentTokenSize > 0) {
        this.lastUpdateData = ''; // Clear cache to force update
        this.update(this.currentToken, this.currentTokenSize);
      }
    }
  };
  
  private setupThemeObserver(): void {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    // Observe changes to the body class for theme switches
    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Theme changed, force update to redraw with new colors
          if (this.currentToken && this.currentTokenSize > 0) {
            // Clear the cache to force redraw
            this.lastUpdateData = '';
            this.update(this.currentToken, this.currentTokenSize);
          }
        }
      }
    });
    
    // Start observing
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  
  public update(token: BaseToken & Partial<Character>, spriteWidth: number, logicalCells: number = 1, gridPxPerCell?: number, playerSettings?: Pick<AtlasSettings['localPlayerView'], 'showTokenHP' | 'showTokenStress' | 'showTokenNameplates'>): void {
    // Get grid size - from parameter or store
    const gridPx = gridPxPerCell || this.store?.getState().grid?.size || 70;
    
    // Get token settings from store
    const tokenSettings = playerSettings ? {
      showHPBars: playerSettings.showTokenHP,
      showStressBars: playerSettings.showTokenStress,
      showNameplates: playerSettings.showTokenNameplates,
    } : this.store?.getState().tokenSettings || {
      showNameplates: false,
      showHPBars: true,
      showStressBars: true,
      tokenRingSize: 1
    };
    
    // Quick change detection without JSON stringify
    const hpString = token.hp === undefined ? 'no-hp' : (typeof token.hp === 'object' ? `${token.hp.current}/${token.hp.max}` : String(token.hp));
    const stressString = token.stress === undefined ? 'no-stress' : (typeof token.stress === 'object' ? `${token.stress.current}/${token.stress.max}` : String(token.stress));
    const showNameplate = playerSettings ? playerSettings.showTokenNameplates : tokenSettings.showNameplates || (token as any).showNameplate === true;
    const conditionsKey = (token as any).conditions?.join(',') ?? '';
    const updateKey = `${hpString}_${stressString}_${spriteWidth}_${gridPx}_${this.isHovered}_${this.isSelected}_${token.name || ''}_${showNameplate}_${(token as any).statblockName || ''}_${tokenSettings.showHPBars}_${tokenSettings.showStressBars}_${conditionsKey}`;
    
    // Skip update if nothing has changed
    if (this.lastUpdateData === updateKey) {
      return;
    }
    
    this.lastUpdateData = updateKey;
    
    
    // Clear previous graphics
    this.hpBar.clear();
    this.hpFill.clear();
    this.stressBar.clear();
    this.stressFill.clear();
    this.difficultyBadge.removeChildren();
    this.defeatedOverlay.clear();
    this.nameBadge.clear();
    this.nameText.text = '';
    
    // Check if we have any data to display
    // Only show HP/stress bars if token has a statblock assigned AND the setting is enabled
    const hasStatblock = !!(token.statblockPath || (token as any).statblock);
    const hasHP = hasStatblock && token.hp !== undefined && tokenSettings.showHPBars;
    const hasStress = hasStatblock && token.stress !== undefined && tokenSettings.showStressBars;
    // showNameplate is already calculated above for change detection

    const hasConditions = ((token as any).conditions?.length ?? 0) > 0;

    if (!hasHP && !hasStress && !showNameplate && !hasConditions) {
      this.container.visible = false;
      return;
    }
    
    this.container.visible = true;
    
    // Calculate UI scale relative to grid size only (not token size)
    // UI elements should maintain consistent size regardless of token size
    const baseUISize = 70; // Base size when grid is 70px
    const baseScale = gridPx / baseUISize; // Base scale from grid size only
    const uiScale = baseScale; // Only use grid scale, not token scale
    
    // Set container scale to match grid proportions only
    this.container.scale.set(uiScale);
    
    // Use design tokens for consistent sizing
    const barWidth = barDimensions.token.width;
    const barHeight = barDimensions.token.height;
    const barRadius = barDimensions.token.radius;
    const gap = barDimensions.token.gap;
    
    // Convert token radius to UI units and position bars below token
    const tokenRadiusInUIUnits = (spriteWidth / 2) / uiScale;
    const baseGap = 2; // Gap between token and first bar
    let currentY = tokenRadiusInUIUnits + baseGap; // Start below token
    
    // HP Bar
    if (hasHP) {
      const hp = typeof token.hp === 'number' 
        ? { current: token.hp, max: 100 } 
        : token.hp;
      
      
      const hpPercentage = hp ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0;
      const isDefeated = hp ? hp.current <= 0 : false;
      
      // Bar styling - layered approach for proper pill shape
      const borderThickness = 0.75;  // Very thin outer border
      const pillRadius = barHeight / 2;  // True pill shape
      const innerPadding = borderThickness / 2;  // No gap - content sits at stroke's inner edge
      
      // Layer 1: Thin gray outer stroke
      this.hpBar.roundRect(-barWidth/2, currentY, barWidth, barHeight, pillRadius)
        .stroke({ width: borderThickness, color: 0x888888, alpha: 1 });
      
      // Layer 2: Dark inner background
      const innerX = -barWidth/2 + innerPadding;
      const innerY = currentY + innerPadding;
      const innerWidth = barWidth - innerPadding * 2;
      const innerHeight = barHeight - innerPadding * 2;
      const innerRadius = innerHeight / 2;  // True pill for inner
      
      this.hpBar.roundRect(innerX, innerY, innerWidth, innerHeight, innerRadius)
        .fill({ color: 0x1a1a1a, alpha: 1 });
      
      // Layer 3: Tick marks on the dark background (every 10%)
      const tickSpacing = innerWidth / 10;
      for (let i = 1; i < 10; i++) {
        const tickX = innerX + (tickSpacing * i);
        this.hpBar.moveTo(tickX, innerY + 1);
        this.hpBar.lineTo(tickX, innerY + innerHeight - 1);
        this.hpBar.stroke({ width: 0.5, color: 0x333333, alpha: 0.5 });
      }
      
      // Layer 4: Colored HP fill with metallic/energy gradient (slightly inset)
      const baseColor = getHealthColor(hpPercentage);
      const fillPadding = 1;  // Inset from dark background to look contained
      const fillX = innerX + fillPadding;
      const fillY = innerY + fillPadding;
      const fillableWidth = innerWidth - fillPadding * 2;
      const fillHeight = innerHeight - fillPadding * 2;
      const fillRadius = fillHeight / 2;
      const fillWidth = fillableWidth * (hpPercentage / 100);
      
      if (fillWidth > 0) {
        const fillGradient = getBarGradient(baseColor);
        
        this.hpFill.roundRect(fillX, fillY, fillWidth, fillHeight, fillRadius)
          .fill(fillGradient);
      }
      
      // Text
      this.hpText.text = hp ? `${hp.current}/${hp.max}` : '0/0';
      this.hpText.anchor.set(0.5, 0.5);
      this.hpText.position.set(0, currentY + barHeight/2);
      this.hpText.scale.set(0.333); // Fixed text scale
      
      // Defeated overlay - just darken the HP bar, no X icon
      if (isDefeated) {
        this.defeatedOverlay.roundRect(-barWidth/2, currentY, barWidth, barHeight, barRadius)
          .fill({ color: 0x000000, alpha: 0.4 });
      }
      
      currentY += barHeight + gap;
    }
    
    // Stress Bar
    if (hasStress && token.stress !== undefined) {
      // Handle both number and object format for stress
      const stressValue = typeof token.stress === 'number' ? token.stress : token.stress.current;
      const maxStress = typeof token.stress === 'object' ? token.stress.max : (token.maxStress || 10);
      const stressPercentage = Math.max(0, Math.min(100, (stressValue / maxStress) * 100));
      
      // Bar styling - layered approach for proper pill shape
      const borderThickness = 0.75;  // Very thin outer border
      const pillRadius = barHeight / 2;  // True pill shape
      const innerPadding = borderThickness / 2;  // No gap - content sits at stroke's inner edge
      
      // Layer 1: Thin gray outer stroke
      this.stressBar.roundRect(-barWidth/2, currentY, barWidth, barHeight, pillRadius)
        .stroke({ width: borderThickness, color: 0x888888, alpha: 1 });
      
      // Layer 2: Dark inner background
      const innerX = -barWidth/2 + innerPadding;
      const innerY = currentY + innerPadding;
      const innerWidth = barWidth - innerPadding * 2;
      const innerHeight = barHeight - innerPadding * 2;
      const innerRadius = innerHeight / 2;  // True pill for inner
      
      this.stressBar.roundRect(innerX, innerY, innerWidth, innerHeight, innerRadius)
        .fill({ color: 0x1a1a1a, alpha: 1 });
      
      // Layer 3: Tick marks on the dark background (every 10%)
      const tickSpacing = innerWidth / 10;
      for (let i = 1; i < 10; i++) {
        const tickX = innerX + (tickSpacing * i);
        this.stressBar.moveTo(tickX, innerY + 1);
        this.stressBar.lineTo(tickX, innerY + innerHeight - 1);
        this.stressBar.stroke({ width: 0.5, color: 0x333333, alpha: 0.5 });
      }
      
      // Layer 4: Colored stress fill with metallic/energy gradient (slightly inset)
      const baseStressColor = colors.stress.fill;
      const fillPadding = 1;  // Inset from dark background to look contained
      const fillX = innerX + fillPadding;
      const fillY = innerY + fillPadding;
      const fillableWidth = innerWidth - fillPadding * 2;
      const fillHeight = innerHeight - fillPadding * 2;
      const fillRadius = fillHeight / 2;
      const fillWidth = fillableWidth * (stressPercentage / 100);
      
      if (fillWidth > 0) {
        const fillGradient = getBarGradient(baseStressColor);
        
        this.stressFill.roundRect(fillX, fillY, fillWidth, fillHeight, fillRadius)
          .fill(fillGradient);
      }
      
      // Text
      this.stressText.text = `${stressValue}/${maxStress}`;
      this.stressText.anchor.set(0.5, 0.5);
      this.stressText.position.set(0, currentY + barHeight/2);
      this.stressText.scale.set(0.333); // Fixed text scale
    }
    
    // Store current token data for theme updates
    this.currentToken = token;
    this.currentTokenSize = spriteWidth; // Store the sprite width for later use
    
    // Name badge - only show if showNameplate is true AND there's a meaningful name
    // Determine displayName first to decide whether to show the nameplate
    let displayName: string | null = null;
    if (token.name) {
      // Token has a custom name (overrides statblock name)
      displayName = token.name;
    } else if (hasStatblock && (token as any).statblockName) {
      // Token has a statblock and we loaded the statblock name
      displayName = (token as any).statblockName;
    } else if (hasStatblock) {
      // Token has a statblock but no name was loaded - show placeholder
      displayName = 'Unknown Creature';
    }
    // If no statblock and no name, displayName stays null - don't show nameplate

    // Only show nameplate if enabled AND we have a name to display
    if (showNameplate && displayName) {
      // Get theme colors
      const isDarkMode = document.body.classList.contains('theme-dark');
      const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
      const strokeColor = isDarkMode ? 0xffffff : 0x000000;
      
      this.nameText.text = displayName;
      // In PIXI v8, text updates automatically when setting the text property
      const textBounds = this.nameText.getLocalBounds();
      
      this.nameText.alpha = 0.85;
      
      // Badge dimensions - use fixed sizes  
      const scaledTextScale = 0.333; // Fixed text scale
      const scaledWidth = textBounds.width * scaledTextScale;
      const padding = 6; // Fixed padding
      const badgeWidth = Math.max(scaledWidth + padding * 2, 40); // Fixed min width
      const badgeHeight = 14; // Fixed height
      const badgeRadius = badgeHeight / 2;
      
      // Position the name badge so its bottom edge aligns with the token's bottom edge
      // Token radius in UI units (same as calculated above)
      const tokenBottomY = tokenRadiusInUIUnits;
      // Position name badge so its bottom edge is at the token's bottom edge
      const nameY = tokenBottomY - badgeHeight/2;
      
      // Draw rounded rectangle background
      this.nameBadge.clear();
      this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
        .fill({ color: bgColor, alpha: 1 }); // Fully opaque background
      
      // Add border — softened so it doesn't overpower the nameplate
      this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
        .stroke({ width: 0.5, color: strokeColor, alpha: isDarkMode ? 0.4 : 0.3 });
      
      // Position text in center of badge
      this.nameText.anchor.set(0.5, 0.5);
      this.nameText.position.set(0, nameY);
      this.nameText.scale.set(0.333); // Fixed text scale
    }
    
    // Hide unused elements (but respect resize and rotation hidden state)
    const isHidden = this.isHiddenDuringResize || this.isHiddenDuringRotation;
    this.hpBar.visible = hasHP && !isHidden;
    this.hpFill.visible = hasHP && !isHidden;
    this.hpText.visible = hasHP && !isHidden;
    this.stressBar.visible = hasStress && !isHidden;
    this.stressFill.visible = hasStress && !isHidden;
    this.stressText.visible = hasStress && !isHidden;
    this.difficultyBadge.visible = false; // Never show difficulty badge
    // Check if token is defeated (matches TokenRenderer logic)
    const hp = token.hp;
    const isDefeated = hasHP && hp !== undefined && (
      (typeof hp === 'object' && hp.current <= 0) ||
      (typeof hp === 'number' && hp <= 0)
    );
    this.defeatedOverlay.visible = isDefeated && !isHidden;
    const hasDisplayName = showNameplate && !!displayName;
    this.nameBadge.visible = hasDisplayName && !isHidden; // Only show if enabled, has name, and not hidden
    this.nameText.visible = hasDisplayName && !isHidden; // Only show if enabled, has name, and not hidden
    
    // Condition dots — horizontal row between nameplate and HP bar
    const conditionDefs = this.conditionDefsProvider?.() ?? [];
    const conditionY = tokenRadiusInUIUnits + baseGap / 2;
    this.conditionDots.update((token as any).conditions ?? [], conditionDefs, conditionY);

  }
  
  public getContainer(): Container {
    return this.container;
  }
  
  public setVisibility(visible: boolean): void {
    this.container.visible = visible;
  }
  
  public setHoverState(hovered: boolean, modifierKeyDown = false): void {
    this.isHovered = hovered;
    this.updateTextVisibility();

    // Condition UI: show panel on hover only when CMD/Ctrl is NOT held
    // (CMD+hover is reserved for statblock preview)
    const conditions = (this.currentToken as any)?.conditions ?? [];
    const conditionDefs = this.conditionDefsProvider?.() ?? [];

    // Dots always stay visible when conditions exist
    this.conditionDots.setVisible(conditions.length > 0);

    const showPanel = hovered && !modifierKeyDown && conditions.length > 0;
    if (showPanel) {
      const uiScale = this.container.scale.x || 1;
      const tokenRadius = (this.currentTokenSize / 2) / uiScale;
      this.conditionPanel.show(conditions, conditionDefs, tokenRadius);
    } else {
      this.conditionPanel.hide();
    }
  }
  
  public setSelectionState(selected: boolean): void {
    if (this.isSelected === selected) return;
    this.isSelected = selected;
    this.updateTextVisibility();
  }
  
  private updateTextVisibility(): void {
    const shouldShowText = this.isHovered || this.isSelected;
    const targetAlpha = shouldShowText ? 1 : 0;
    
    // Cancel any existing animation
    if (this.fadeAnimation !== null) {
      window.cancelAnimationFrame(this.fadeAnimation);
      this.fadeAnimation = null;
    }
    
    // Animate the text alpha
    const animate = () => {
      const currentAlpha = this.hpText.alpha;
      const diff = targetAlpha - currentAlpha;
      
      // If we're close enough, just set the final value
      if (Math.abs(diff) < 0.05) {
        this.hpText.alpha = targetAlpha;
        this.stressText.alpha = targetAlpha;
        this.fadeAnimation = null;
        return;
      }
      
      // Smooth animation with easing
      const step = diff * 0.15; // Adjust this value to control animation speed
      this.hpText.alpha = currentAlpha + step;
      this.stressText.alpha = currentAlpha + step;
      
      // Continue animation
      this.fadeAnimation = window.requestAnimationFrame(animate);
    };
    
    animate();
  }
  
  
  private setupTokenRing(): void {
    // Token ring setup functionality would go here
    // This method is not currently implemented
  }
  
  destroy(): void {
    // End any active editing
    this.endNameEdit();
    
    // Cancel any pending animation
    if (this.fadeAnimation !== null) {
      window.cancelAnimationFrame(this.fadeAnimation);
      this.fadeAnimation = null;
    }
    
    // Clean up theme observers
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    if (this.editThemeObserver) {
      this.editThemeObserver.disconnect();
      this.editThemeObserver = null;
    }
    
    // Clean up viewport listeners
    if (this.viewport) {
      this.viewport.off('resize', this.handleViewportResize);
    }
    
    // Clean up window listeners
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.removeEventListener('atlas-token-resize-ended', this.onResizeEnded);
    window.removeEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.removeEventListener('atlas-token-rotation-ended', this.onRotationEnded);
    
    // Clean up resize timeout
    if (this.resizeTimeout) {
      window.clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    
    // Clean up condition renderers
    this.conditionDots.destroy();
    this.conditionPanel.destroy();

    // Clear references
    this.currentToken = null;
    this.currentTokenSize = 0;

    for (const texture of this.barTextureCache.values()) {
      if (texture && !texture.destroyed) {
        texture.destroy(true);
      }
    }
    this.barTextureCache.clear();

    // Destroy container and children
    this.container.destroy({ children: true });
  }
  
  /**
   * Start inline editing of the token name
   */
  public startNameEdit(): void {
    if (this.isEditingName || !this.currentToken || !this.store) return;
    
    // Only allow editing if nameplate is visible
    const shouldShowNameplate = (this.currentToken as any).showNameplate === true;
    if (!shouldShowNameplate) return;
    
    this.isEditingName = true;
    this.originalName = this.currentToken.name || '';
    
    // Keep the PIXI text visible
    this.nameText.visible = true;
    
    // Create a hidden HTML input to capture keyboard events
    const input = document.body.createEl('input');
    input.type = 'text';
    input.value = this.originalName || '';
    input.className = 'atlas-offscreen-input';
    input.setAttribute('tabindex', '-1');
    
    // Add the hidden input to capture keyboard events
    this.editInput = input;
    
    // Focus the hidden input to capture keyboard events
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    
    // Monitor for theme changes during editing
    if (typeof MutationObserver !== 'undefined') {
      if (this.editThemeObserver) {
        this.editThemeObserver.disconnect();
      }

      this.editThemeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && 
              (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
            // Theme or CSS variables might have changed, update colors
            window.setTimeout(updateNameBadgeAndCursor, 0);
          }
        });
      });
      
      // Observe changes to document root and body for theme changes
      this.editThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
      this.editThemeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
    
    // Function to get Obsidian's accent color
    const getAccentColor = () => {
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-h');
      const accentS = getComputedStyle(document.documentElement).getPropertyValue('--accent-s');
      const accentL = getComputedStyle(document.documentElement).getPropertyValue('--accent-l');
      
      let hexColor = 0x6366f1; // Default purple if CSS vars not available
      if (accentColor && accentS && accentL) {
        // Create HSL color string and convert to hex
        const hsl = `hsl(${accentColor}, ${accentS}, ${accentL})`;
        const tempDiv = document.body.createDiv();
        tempDiv.style.color = hsl;
        const computedColor = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);
        
        // Parse rgb() to hex
        const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          hexColor = (r << 16) | (g << 8) | b;
        }
      }
      return hexColor;
    };
    
    // Function to update both badge size and cursor position
    const updateNameBadgeAndCursor = () => {
      // Get theme colors (same as normal badge)
      const isDarkMode = document.body.classList.contains('theme-dark');
      const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
      const strokeColor = isDarkMode ? 0xffffff : 0x000000;
      
      // Get current text bounds
      const textBounds = this.nameText.getLocalBounds();
      
      // Badge dimensions (same as normal badge) - use fixed sizes
      const scaledTextScale = 0.333; // Fixed text scale
      const scaledTextWidth = textBounds.width * scaledTextScale;
      const padding = 6; // Fixed padding
      const badgeWidth = Math.max(scaledTextWidth + padding * 2, 40); // Fixed min width
      const badgeHeight = 14; // Fixed height
      const badgeRadius = badgeHeight / 2;
      
      // Get current name badge position
      const nameY = this.nameText.position.y;
      
      // Redraw the name badge with new size and editing glow
      this.nameBadge.clear();
      this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
        .fill({ color: bgColor, alpha: 1 }); // Fully opaque background
      
      // Add accent color stroke during editing
      if (this.isEditingName) {
        const accentColor = getAccentColor();
        
        // Single accent-colored stroke for editing highlight
        this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
          .stroke({ width: 1.5, color: accentColor, alpha: 0.8 });
      } else {
        // Normal subtle border when not editing
        this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
          .stroke({ width: 0.5, color: strokeColor, alpha: isDarkMode ? 0.4 : 0.3 });
      }
      
      // Update cursor position based on actual cursor position in the input
      const textHeight = textBounds.height * scaledTextScale;
      
      // Calculate cursor position based on text cursor position
      const cursorPosition = this.editInput ? this.editInput.selectionStart || 0 : 0;
      const textBeforeCursor = this.nameText.text.substring(0, cursorPosition);
      
      // Create temporary text to measure width up to cursor
      const tempText = new Text({
        text: textBeforeCursor,
        style: this.nameText.style
      });
      // Use the scaledTextScale already defined above
      const textWidthToCursor = tempText.getLocalBounds().width * scaledTextScale;
      
      // Calculate cursor position
      const cursorX = this.nameText.x - (textBounds.width * scaledTextScale) / 2 + textWidthToCursor;
      const cursorY = this.nameText.y;
      
      // Clean up temporary text
      tempText.destroy();
      
      // Get cursor color using the accent color function
      const cursorColor = getAccentColor();
      
      // Draw cursor as rounded rectangle for proper rounded corners
      this.editCursor.clear();
      const cursorHeight = Math.max(textHeight, 12); // Fixed minimum cursor height
      const cursorWidth = 1.5; // Fixed width
      
      // Draw a rounded rectangle for the cursor
      this.editCursor.roundRect(
        cursorX - cursorWidth/2, 
        cursorY - cursorHeight/2, 
        cursorWidth, 
        cursorHeight, 
        cursorWidth/2 // Radius = half width for fully rounded ends
      ).fill({ color: cursorColor, alpha: 1 });
      
    };
    
    // Show and position cursor
    this.editCursor.visible = true;
    this.editCursor.alpha = 1; // Ensure it starts visible
    updateNameBadgeAndCursor();
    
    // Start blinking cursor
    let cursorVisible = true;
    this.cursorBlinkInterval = window.setInterval(() => {
      cursorVisible = !cursorVisible;
      this.editCursor.alpha = cursorVisible ? 1 : 0;
    }, 500) as unknown as number;
    
    // Event handlers will be defined and attached later
    
    // Handle saving
    const saveEdit = () => {
      if (!this.isEditingName || !this.editInput || !this.currentToken || !this.store) return;
      
      const newName = this.editInput.value.trim();
      
      // Only update if name changed
      if (newName !== this.originalName) {
        // Only characters can have names updated - use type assertion since we know this is a character
        const updates = { name: newName === '' ? undefined : newName } as any;
        this.store?.getState().updateToken(this.currentToken.id, updates);
        
        // Force a re-render of this UI by clearing the cache
        this.lastUpdateData = '';
        
        // Update our local reference
        if (this.currentToken) {
          this.currentToken = { ...this.currentToken, name: newName };
        }
      }
      
      this.endNameEdit();
      
      // Force update to show the new name
      if (this.currentToken && this.currentTokenSize > 0) {
        this.update(this.currentToken, this.currentTokenSize);
      }
    };
    
    // Handle canceling
    const cancelEdit = () => {
      this.endNameEdit();
    };
    
    // Event handlers - be more careful about event handling
    const keydownHandler = (e: KeyboardEvent) => {
      // Only handle events if we're actually editing
      if (!this.isEditingName) return;
      
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        // Allow arrow keys and home/end for navigation - update cursor position after the event
        window.setTimeout(() => {
          updateNameBadgeAndCursor();
        }, 0);
      }
    };
    
    const blurHandler = () => {
      // Small delay to handle click events
      window.setTimeout(() => {
        if (this.isEditingName) {
          saveEdit();
        }
      }, 100);
    };
    
    const clickHandler = () => {
      updateNameBadgeAndCursor();
    };
    
    const keyupHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        updateNameBadgeAndCursor();
      }
    };
    
    const inputHandler = () => {
      const displayText = input.value || 'Click to name';
      this.nameText.text = displayText;
      // Set text opacity based on whether it's a placeholder (same as normal)
      this.nameText.alpha = input.value ? 0.6 : 0.3;
      // Update both badge size and cursor position after text change
      updateNameBadgeAndCursor();
    };
    
    input.addEventListener('keydown', keydownHandler);
    input.addEventListener('blur', blurHandler);
    input.addEventListener('click', clickHandler);
    input.addEventListener('keyup', keyupHandler);
    input.addEventListener('input', inputHandler);
    
    // Store handlers for cleanup
    (input as any).cleanupHandlers = () => {
      input.removeEventListener('keydown', keydownHandler);
      input.removeEventListener('blur', blurHandler);
      input.removeEventListener('click', clickHandler);
      input.removeEventListener('keyup', keyupHandler);
      input.removeEventListener('input', inputHandler);
    };
  }
  
  /**
   * End inline editing of the token name
   */
  private endNameEdit(): void {
    if (!this.isEditingName) return;
    
    this.isEditingName = false;
    
    // Hide cursor
    this.editCursor.visible = false;
    
    // Stop cursor blinking
    if (this.cursorBlinkInterval !== null) {
      window.clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = null;
    }
    
    // Remove input element with proper cleanup
    if (this.editInput) {
      // Clean up event handlers
      if ((this.editInput as any).cleanupHandlers) {
        (this.editInput as any).cleanupHandlers();
      }
      
      // Remove from DOM
      this.editInput.remove();
      this.editInput = null;
    }
    
    // Stop editing observer only; keep base theme observer active
    if (this.editThemeObserver) {
      this.editThemeObserver.disconnect();
      this.editThemeObserver = null;
    }
    
    // Redraw the name badge without glow effect
    if (this.currentToken && this.currentTokenSize > 0) {
      // Force update to remove glow effect
      this.lastUpdateData = '';
      this.update(this.currentToken, this.currentTokenSize);
    }
    
    // Name text is already visible, no need to show it again
  }
}
