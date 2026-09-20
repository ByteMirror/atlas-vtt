import { FederatedPointerEvent, Graphics, Text, TextStyle } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { EventEmitter } from 'events';
import { getObsidianAccentColor, cssColorToHexNumber } from "./utils/colorUtils";
import type { GridSystem } from "../grid/GridSystem";
import { axialDistance, createHexLayout, isHexGridType, pixelToAxial } from '../grid/hexGeometry';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { RangeBand } from '../types/collectionSettingsTypes';

interface PersistentMeasurement {
  graphics: Graphics;
  pill: Graphics;
  text: Text;
}

export class MeasureRenderer {
  private viewport: Viewport;
  private eventBus: EventEmitter;
  private store: StoreApi<ViewAtlasState>;
  private gridSystem: GridSystem;
  
  private measureGraphics: Graphics;
  private measureText: Text;
  private measurePill: Graphics; // Background pill for text
  /** Provider for user-defined abstract range bands from collection settings. */
  public rangeBandsProvider: (() => RangeBand[]) | null = null;
  /** Provider for collection-level grid defaults (measurement mode, unit type, unit distance). */
  public gridDefaultsProvider: (() => { measurementMode: string; unitType: string; unitDistance: number } | undefined) | null = null;

  private isDrawing: boolean = false;
  private startPoint: { x: number; y: number } | null = null;
  private endPoint: { x: number; y: number } | null = null;
  private measureShape: 'line' | 'cone' | 'circle' | 'sphere' = 'line';
  private persistMeasurements: boolean = false;
  private persistentMeasurements: PersistentMeasurement[] = [];
  
  private pointerDownHandler: (e: FederatedPointerEvent) => void;
  private pointerMoveHandler: (e: FederatedPointerEvent) => void;
  private pointerUpHandler: (e: FederatedPointerEvent) => void;
  private rightClickDownPos: { x: number; y: number } | null = null;
  
  private _unsubscribeFromToolChanges?: () => void;
  private _viewportScaleHandler?: () => void;
  private _measureShapeChangedHandler?: (shape: 'line' | 'cone' | 'circle' | 'sphere') => void;
  private _measurePersistenceChangedHandler?: (persist: boolean) => void;
  private baseTextSize: number = 16;

  constructor(
    viewport: Viewport,
    eventBus: EventEmitter,
    store: StoreApi<ViewAtlasState>,
    gridSystem: GridSystem
  ) {
    this.viewport = viewport;
    this.eventBus = eventBus;
    this.store = store;
    this.gridSystem = gridSystem;
    
    // Create graphics for drawing measurements
    this.measureGraphics = new Graphics();
    this.measureGraphics.eventMode = 'none';
    this.measureGraphics.interactiveChildren = false;
    this.viewport.addChild(this.measureGraphics);
    
    // Create graphics for text pill background
    this.measurePill = new Graphics();
    this.measurePill.eventMode = 'none';
    this.viewport.addChild(this.measurePill);
    
    // Create text for displaying measurement value
    const textStyle = new TextStyle({
      fontSize: this.baseTextSize,
      fill: 0xffffff, // White text
      fontWeight: 'normal' // Normal weight like HP bars
    });
    this.measureText = new Text({ text: '', style: textStyle });
    this.measureText.eventMode = 'none';
    this.measureText.anchor.set(0.5);
    this.viewport.addChild(this.measureText);
    
    // Setup viewport scale listener
    this.setupViewportScaleListener();
    
    // Bind handlers
    this.pointerDownHandler = this.handlePointerDown.bind(this);
    this.pointerMoveHandler = this.handlePointerMove.bind(this);
    this.pointerUpHandler = this.handlePointerUp.bind(this);
    
    // Subscribe to tool changes
    this._unsubscribeFromToolChanges = this.store.subscribe((state: ViewAtlasState) => {
      const tool = state.activeTool;
      if (tool === 'measure' || tool === 'measure-circle' || tool === 'measure-cone') {
        this.enableMeasureTool();
        // Update shape based on tool
        if (tool === 'measure') {
          this.measureShape = 'line';
        } else if (tool === 'measure-circle') {
          this.measureShape = 'circle';
        } else if (tool === 'measure-cone') {
          this.measureShape = 'cone';
        }
      } else {
        this.disableMeasureTool();
      }
    });

    // Initialize once on construction
    const initialTool = this.store.getState().activeTool;
    if (initialTool === 'measure' || initialTool === 'measure-circle' || initialTool === 'measure-cone') {
      this.enableMeasureTool();
    }
    
    // Listen for measure shape changes
    this._measureShapeChangedHandler = (shape: 'line' | 'cone' | 'circle' | 'sphere') => {
      this.measureShape = shape;
      // Clear any existing measurement when shape changes
      this.clearMeasurement();
    };
    this.eventBus.on('measure-shape-changed', this._measureShapeChangedHandler);
    
    // Listen for persistence changes
    this._measurePersistenceChangedHandler = (persist: boolean) => {
      this.persistMeasurements = persist;
      // If turning off persistence, clear all persistent measurements
      if (!persist) {
        this.clearAllPersistentMeasurements();
      }
    };
    this.eventBus.on('measure-persistence-changed', this._measurePersistenceChangedHandler);
  }
  
  private setupViewportScaleListener(): void {
    // Update text scale whenever viewport scale changes
    this._viewportScaleHandler = () => {
      this.updateTextScale();
    };
    
    // Listen to viewport scale changes
    this.viewport.on('zoomed', this._viewportScaleHandler);
    this.viewport.on('moved', this._viewportScaleHandler);
  }
  
  private updateTextScale(): void {
    if (!this.measureText.visible) return;
    
    // Get current viewport scale
    const viewportScale = this.viewport.scale.x; // x and y should be the same
    
    // Calculate dynamic font size
    // As we zoom out (scale < 1), make text bigger
    // As we zoom in (scale > 1), make text smaller
    // This keeps the text roughly the same screen size
    const scaleFactor = 1 / viewportScale;
    const fontSize = Math.max(12, Math.min(32, this.baseTextSize * scaleFactor));
    
    // Update text style
    this.measureText.style.fontSize = fontSize;
    
    // Redraw pill if text is visible
    if (this.startPoint && this.endPoint) {
      this.updatePillAndText();
    }
  }
  
  private enableMeasureTool(): void {
    this.viewport.on('pointerdown', this.pointerDownHandler);
    this.viewport.on('pointermove', this.pointerMoveHandler);
    this.viewport.on('pointerup', this.pointerUpHandler);
    this.viewport.on('pointerupoutside', this.pointerUpHandler);
  }
  
  private disableMeasureTool(): void {
    this.viewport.off('pointerdown', this.pointerDownHandler);
    this.viewport.off('pointermove', this.pointerMoveHandler);
    this.viewport.off('pointerup', this.pointerUpHandler);
    this.viewport.off('pointerupoutside', this.pointerUpHandler);
    this.clearMeasurement();
  }
  
  private handlePointerDown(e: FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    if (tool !== 'measure' && tool !== 'measure-circle' && tool !== 'measure-cone') return;
    
    // Check which button was pressed
    if (e.button === 2) {
      // Right click - allow panning
      this.rightClickDownPos = { x: e.global.x, y: e.global.y };
      // Don't stop propagation for right click - let viewport handle panning
      return;
    }
    
    // Left click - measure tool
    if (e.button === 0) {
      e.stopPropagation();
      
      const worldPos = this.viewport.toWorld(e.global);
      // Snap to grid center
      const snappedPos = this.gridSystem.snapToCellCenter(worldPos.x, worldPos.y);
      
      this.startPoint = snappedPos;
      this.endPoint = snappedPos;
      this.isDrawing = true;
      
      this.updateMeasurement();
    }
  }
  
  private handlePointerMove(e: FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    if (tool !== 'measure' && tool !== 'measure-circle' && tool !== 'measure-cone') return;
    
    // If right-clicking (panning), don't interfere
    if (this.rightClickDownPos) {
      return;
    }
    
    // Only handle measurement if we're actually drawing
    if (!this.isDrawing) return;
    
    e.stopPropagation();
    
    const worldPos = this.viewport.toWorld(e.global);
    // Snap to grid center
    const snappedPos = this.gridSystem.snapToCellCenter(worldPos.x, worldPos.y);
    
    this.endPoint = snappedPos;
    this.updateMeasurement();
  }
  
  private handlePointerUp(e: FederatedPointerEvent): void {
    const tool = this.store.getState().activeTool;
    if (tool !== 'measure' && tool !== 'measure-circle' && tool !== 'measure-cone') return;
    
    // Clear right-click state
    if (this.rightClickDownPos) {
      this.rightClickDownPos = null;
      return;
    }
    
    // Only handle if we were measuring
    if (!this.isDrawing) return;
    
    e.stopPropagation();
    
    this.isDrawing = false;
    
    // Handle persistence
    if (this.persistMeasurements) {
      // Create persistent copies of the current measurement
      this.createPersistentMeasurement();
      // Clear the active measurement graphics
      this.clearMeasurement();
    } else {
      // Clear after a delay if not persisting
      window.setTimeout(() => {
        if (!this.isDrawing) {
          this.clearMeasurement();
        }
      }, 2000); // Clear after 2 seconds
    }
  }
  
  private updateMeasurement(): void {
    if (!this.startPoint || !this.endPoint) return;
    
    this.measureGraphics.clear();
    
    // Get accent color from Obsidian theme
    const accent = getObsidianAccentColor();
    const accentHex = cssColorToHexNumber(accent);
    
    // Calculate distance for radius
    const dx = this.endPoint.x - this.startPoint.x;
    const dy = this.endPoint.y - this.startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    switch (this.measureShape) {
      case 'line':
        this.drawLine(accentHex);
        break;
      case 'circle':
      case 'sphere':
        this.drawCircle(accentHex, distance);
        break;
      case 'cone':
        this.drawCone(accentHex, distance, dx, dy);
        break;
    }
    
    // Draw start point for all shapes
    const pointRadius = 8;
    this.measureGraphics.circle(this.startPoint.x, this.startPoint.y, pointRadius + 3);
    this.measureGraphics.fill({ color: 0x000000, alpha: 0.3 });
    this.measureGraphics.circle(this.startPoint.x, this.startPoint.y, pointRadius);
    this.measureGraphics.fill({ color: accentHex, alpha: 0.9 });
    this.measureGraphics.circle(this.startPoint.x, this.startPoint.y, pointRadius - 1);
    this.measureGraphics.stroke({ width: 2, color: accentHex, alpha: 1 });
    
    // Calculate distance based on measurement type
    // Prefer collection-level grid defaults; fall back to per-map state
    const collectionDefaults = this.gridDefaultsProvider?.();
    let measurementType: string;
    if (collectionDefaults) {
      measurementType = collectionDefaults.measurementMode;
    } else {
      const rawType = this.store.getState().grid?.measurementType || 'abstract';
      measurementType = (rawType as string) === 'daggerheart' ? 'abstract' : rawType;
    }
    const measurementText = this.calculateMeasurement(this.startPoint, this.endPoint, measurementType);
    
    // Update text
    this.measureText.text = measurementText;
    
    // Text is already white from the style definition
    
    this.measureText.visible = true;
    this.measurePill.visible = true;
    
    // Update pill and text for current zoom level
    this.updatePillAndText();
  }
  
  private drawLine(color: number): void {
    if (!this.startPoint || !this.endPoint) return;
    this.drawLineOnGraphics(this.measureGraphics, color, this.startPoint, this.endPoint);
  }
  
  private drawCircle(color: number, radius: number): void {
    if (!this.startPoint) return;
    this.drawCircleOnGraphics(this.measureGraphics, color, radius, this.startPoint);
  }
  
  private drawCone(color: number, distance: number, dx: number, dy: number): void {
    if (!this.startPoint) return;
    this.drawConeOnGraphics(this.measureGraphics, color, distance, dx, dy, this.startPoint);
  }
  
  private updatePillAndText(): void {
    if (!this.startPoint || !this.endPoint || !this.measureText.text) return;
    
    // Get current viewport scale
    const viewportScale = this.viewport.scale.x;
    const scaleFactor = 1 / viewportScale;
    
    // Position at midpoint
    const midX = (this.startPoint.x + this.endPoint.x) / 2;
    const midY = (this.startPoint.y + this.endPoint.y) / 2;
    const offset = 30 * scaleFactor; // Slightly more offset for the pill
    
    // Update text position
    this.measureText.position.set(midX, midY - offset);
    
    // Get text bounds for pill sizing
    const textBounds = this.measureText.getLocalBounds();
    const textScale = this.measureText.scale.x; // Get current text scale
    const scaledTextWidth = textBounds.width * textScale;
    const scaledTextHeight = textBounds.height * textScale;
    
    // Pill dimensions - similar to HP bars
    const padding = 8 * scaleFactor; // Scale padding with zoom
    const pillWidth = scaledTextWidth + padding * 2;
    const pillHeight = Math.max(20 * scaleFactor, scaledTextHeight + 4 * scaleFactor); // Minimum height
    const pillRadius = pillHeight / 2;
    
    // Get theme colors
    const isDarkMode = document.body.classList.contains('theme-dark');
    const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3; // Same as HP bars
    const strokeColor = isDarkMode ? 0xffffff : 0x000000;
    
    // Draw pill background
    this.measurePill.clear();
    
    // Center the pill around the text position
    const pillX = midX - pillWidth / 2;
    const pillY = midY - offset - pillHeight / 2;
    
    // Background
    this.measurePill.roundRect(pillX, pillY, pillWidth, pillHeight, pillRadius)
      .fill({ color: bgColor, alpha: 0.95 });
    
    // Subtle border
    this.measurePill.roundRect(pillX, pillY, pillWidth, pillHeight, pillRadius)
      .stroke({ width: 0.5 * scaleFactor, color: strokeColor, alpha: isDarkMode ? 0.4 : 0.3 });
  }
  
  private calculateMeasurement(start: { x: number; y: number }, end: { x: number; y: number }, measurementType: string): string {
    const gridOptions = this.gridSystem.getOptions();
    const gridSize = gridOptions.size;
    const gridType = gridOptions.type;
    
    let gridDistance: number;
    
    if (isHexGridType(gridType)) {
      const layout = createHexLayout(gridType, gridSize, gridOptions.offsetX ?? 0, gridOptions.offsetY ?? 0);
      gridDistance = axialDistance(pixelToAxial(layout, start), pixelToAxial(layout, end));
    } else {
      // Chebyshev distance (D&D 5e style) - diagonal movement counts as 1
      const dx = Math.abs(end.x - start.x) / gridSize;
      const dy = Math.abs(end.y - start.y) / gridSize;
      gridDistance = Math.max(dx, dy);
    }
    
    // Convert to appropriate measurement
    if (measurementType === 'abstract') {
      return this.getAbstractRange(gridDistance);
    }

    // Metric mode: multiply grid distance by unitDistance and label with unitType
    const collectionDefaults = this.gridDefaultsProvider?.();
    const grid = this.store.getState().grid;
    const unitDistance = collectionDefaults?.unitDistance ?? grid?.unitDistance ?? 5;
    const unitType = collectionDefaults?.unitType ?? grid?.unitType ?? 'feet';
    const label = unitType === 'units' ? 'u' : unitType === 'meters' ? 'm' : 'ft';
    const distance = Math.round(gridDistance * unitDistance);
    return `${distance}${label}`;
  }

  /** Map grid distance to the best-matching abstract range band from collection settings. */
  private getAbstractRange(gridDistance: number): string {
    const grids = Math.round(gridDistance);
    const bands = this.rangeBandsProvider?.() ?? [];

    if (bands.length === 0) {
      // Fallback when no bands are defined
      return `${grids} sq`;
    }

    // Bands are sorted by maxSquares ascending. Walk through until
    // we find the first band whose threshold encompasses the distance.
    for (const band of bands) {
      if (grids <= band.maxSquares) return band.name;
    }
    // Beyond all thresholds → use the last band name
    return bands[bands.length - 1]!.name;
  }
  
  private clearMeasurement(): void {
    this.measureGraphics.clear();
    this.measurePill.clear();
    this.measureText.visible = false;
    this.measurePill.visible = false;
    this.startPoint = null;
    this.endPoint = null;
    this.rightClickDownPos = null;
  }
  
  private createPersistentMeasurement(): void {
    if (!this.startPoint || !this.endPoint || !this.measureText.text) return;
    
    // Create new graphics objects for the persistent measurement
    const persistGraphics = new Graphics();
    const persistPill = new Graphics();
    const persistText = new Text({ 
      text: this.measureText.text, 
      style: this.measureText.style.clone() 
    });
    
    // Copy the current measurement graphics
    persistGraphics.clear();
    const accent = getObsidianAccentColor();
    const accentHex = cssColorToHexNumber(accent);
    
    // Redraw the measurement shape
    const dx = this.endPoint.x - this.startPoint.x;
    const dy = this.endPoint.y - this.startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    switch (this.measureShape) {
      case 'line':
        this.drawLineOnGraphics(persistGraphics, accentHex, this.startPoint, this.endPoint);
        break;
      case 'circle':
      case 'sphere':
        this.drawCircleOnGraphics(persistGraphics, accentHex, distance, this.startPoint);
        break;
      case 'cone':
        this.drawConeOnGraphics(persistGraphics, accentHex, distance, dx, dy, this.startPoint);
        break;
    }
    
    // Draw start point
    const pointRadius = 8;
    persistGraphics.circle(this.startPoint.x, this.startPoint.y, pointRadius + 3);
    persistGraphics.fill({ color: 0x000000, alpha: 0.3 });
    persistGraphics.circle(this.startPoint.x, this.startPoint.y, pointRadius);
    persistGraphics.fill({ color: accentHex, alpha: 0.9 });
    persistGraphics.circle(this.startPoint.x, this.startPoint.y, pointRadius - 1);
    persistGraphics.stroke({ width: 2, color: accentHex, alpha: 1 });
    
    // Copy the pill and text
    this.drawPillOnGraphics(persistPill, persistText, this.startPoint, this.endPoint);
    
    // Set text properties
    persistText.anchor.set(0.5);
    persistText.visible = true;
    
    // Add to viewport
    this.viewport.addChild(persistGraphics);
    this.viewport.addChild(persistPill);
    this.viewport.addChild(persistText);
    
    // Store the persistent measurement
    this.persistentMeasurements.push({
      graphics: persistGraphics,
      pill: persistPill,
      text: persistText
    });
  }
  
  private drawLineOnGraphics(graphics: Graphics, color: number, start: { x: number; y: number }, end: { x: number; y: number }): void {
    // Outer shadow
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke({ width: 6, color: 0x000000, alpha: 0.3 });
    
    // Main line
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke({ width: 4, color: color, alpha: 0.8 });
    
    // Inner highlight
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke({ width: 2, color: color, alpha: 1 });
    
    // Draw end point
    const pointRadius = 8;
    graphics.circle(end.x, end.y, pointRadius + 3);
    graphics.fill({ color: 0x000000, alpha: 0.3 });
    graphics.circle(end.x, end.y, pointRadius);
    graphics.fill({ color: color, alpha: 0.9 });
    graphics.circle(end.x, end.y, pointRadius - 1);
    graphics.stroke({ width: 2, color: color, alpha: 1 });
  }
  
  private drawCircleOnGraphics(graphics: Graphics, color: number, radius: number, center: { x: number; y: number }): void {
    // Fill with transparent color
    graphics.circle(center.x, center.y, radius);
    graphics.fill({ color: color, alpha: 0.1 });
    
    // Draw outline
    graphics.circle(center.x, center.y, radius);
    graphics.stroke({ width: 3, color: color, alpha: 0.8 });
    
    // Inner stroke for highlight
    graphics.circle(center.x, center.y, radius - 1);
    graphics.stroke({ width: 1.5, color: color, alpha: 1 });
  }
  
  private drawConeOnGraphics(graphics: Graphics, color: number, distance: number, dx: number, dy: number, start: { x: number; y: number }): void {
    // Default cone angle is 90 degrees (45 degrees on each side)
    const coneAngle = 90 * Math.PI / 180;
    const halfAngle = coneAngle / 2;
    
    // Calculate the angle of the line
    const baseAngle = Math.atan2(dy, dx);
    
    // Calculate the two edge points of the cone
    const leftAngle = baseAngle - halfAngle;
    const rightAngle = baseAngle + halfAngle;
    
    const leftX = start.x + distance * Math.cos(leftAngle);
    const leftY = start.y + distance * Math.sin(leftAngle);
    const rightX = start.x + distance * Math.cos(rightAngle);
    const rightY = start.y + distance * Math.sin(rightAngle);
    
    // Draw the cone shape
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(leftX, leftY);
    graphics.arc(
      start.x, 
      start.y, 
      distance, 
      leftAngle, 
      rightAngle, 
      false
    );
    graphics.lineTo(start.x, start.y);
    graphics.fill({ color: color, alpha: 0.1 });
    
    // Draw the outline
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(leftX, leftY);
    graphics.stroke({ width: 3, color: color, alpha: 0.8 });
    
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(rightX, rightY);
    graphics.stroke({ width: 3, color: color, alpha: 0.8 });
    
    // Draw the arc
    graphics.arc(
      start.x, 
      start.y, 
      distance, 
      leftAngle, 
      rightAngle, 
      false
    );
    graphics.stroke({ width: 3, color: color, alpha: 0.8 });
  }
  
  private drawPillOnGraphics(pill: Graphics, text: Text, start: { x: number; y: number }, end: { x: number; y: number }): void {
    // Get current viewport scale
    const viewportScale = this.viewport.scale.x;
    const scaleFactor = 1 / viewportScale;
    
    // Position at midpoint
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const offset = 30 * scaleFactor;
    
    // Update text position
    text.position.set(midX, midY - offset);
    
    // Get text bounds for pill sizing
    const textBounds = text.getLocalBounds();
    const textScale = text.scale.x;
    const scaledTextWidth = textBounds.width * textScale;
    const scaledTextHeight = textBounds.height * textScale;
    
    // Pill dimensions
    const padding = 8 * scaleFactor;
    const pillWidth = scaledTextWidth + padding * 2;
    const pillHeight = Math.max(20 * scaleFactor, scaledTextHeight + 4 * scaleFactor);
    const pillRadius = pillHeight / 2;
    
    // Get theme colors
    const isDarkMode = document.body.classList.contains('theme-dark');
    const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
    const strokeColor = isDarkMode ? 0xffffff : 0x000000;
    
    // Draw pill background
    pill.clear();
    
    // Center the pill around the text position
    const pillX = midX - pillWidth / 2;
    const pillY = midY - offset - pillHeight / 2;
    
    // Background
    pill.roundRect(pillX, pillY, pillWidth, pillHeight, pillRadius)
      .fill({ color: bgColor, alpha: 0.95 });
    
    // Subtle border
    pill.roundRect(pillX, pillY, pillWidth, pillHeight, pillRadius)
      .stroke({ width: 0.5 * scaleFactor, color: strokeColor, alpha: isDarkMode ? 0.4 : 0.3 });
  }
  
  private clearAllPersistentMeasurements(): void {
    // Remove all persistent measurements from viewport
    for (const measurement of this.persistentMeasurements) {
      if (measurement.graphics.parent) {
        this.viewport.removeChild(measurement.graphics);
      }
      if (measurement.pill.parent) {
        this.viewport.removeChild(measurement.pill);
      }
      if (measurement.text.parent) {
        this.viewport.removeChild(measurement.text);
      }
      
      // Destroy the graphics objects
      measurement.graphics.destroy();
      measurement.pill.destroy();
      measurement.text.destroy();
    }
    
    // Clear the array
    this.persistentMeasurements = [];
  }
  
  public destroy(): void {
    this._unsubscribeFromToolChanges?.();
    
    // Remove viewport scale listener
    if (this._viewportScaleHandler) {
      this.viewport.off('zoomed', this._viewportScaleHandler);
      this.viewport.off('moved', this._viewportScaleHandler);
    }
    
    // Remove event listeners
    if (this._measureShapeChangedHandler) {
      this.eventBus.off('measure-shape-changed', this._measureShapeChangedHandler);
    }
    if (this._measurePersistenceChangedHandler) {
      this.eventBus.off('measure-persistence-changed', this._measurePersistenceChangedHandler);
    }
    
    // Clear all persistent measurements
    this.clearAllPersistentMeasurements();
    
    this.disableMeasureTool();
    this.measureGraphics.destroy();
    this.measurePill.destroy();
    this.measureText.destroy();
  }
}
