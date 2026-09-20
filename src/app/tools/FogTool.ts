import { EventEmitter } from 'events';

export type FogToolMode = 'brush' | 'lasso' | 'rectangle';

export interface FogSettings {
  brushSize: number;
  mode: FogToolMode;
}

/**
 * Handles fog specific interactions such as painting, erasing and clearing the entire fog on the map.
 * It only keeps local state and notifies other parts of the application via the shared event bus.
 */
export class FogTool {
  private settings: FogSettings;
  private eventBus: EventEmitter;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.settings = {
      brushSize: 50,
      mode: 'brush',
    };
  }

  /**
   * Update the active brush size used for painting / erasing fog.
   */
  public setBrushSize(size: number): void {
    if (this.settings.brushSize === size) return;
    this.settings.brushSize = size;
    this.eventBus.emit('fog-brush-size-changed', size);
  }

  /**
   * Switch between brush, lasso, and rectangle fog modes.
   */
  public setMode(mode: FogToolMode): void {
    if (this.settings.mode === mode) return;
    this.settings.mode = mode;
    this.eventBus.emit('fog-mode-changed', mode);
  }

  /**
   * Clear all fog on the canvas.
   */
  public clearAll(): void {
    this.eventBus.emit('fog-clear-all');
  }

  /**
   * Current configuration for the fog tool.
   */
  public getSettings(): FogSettings {
    return { ...this.settings };
  }
} 