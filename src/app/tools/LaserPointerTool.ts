import { EventEmitter } from 'events';

export interface LaserPointerSettings {
  color: string;
  size: number;
  fadeTime: number;
}

/**
 * Pure settings holder for the laser pointer tool.
 * Rendering and input handling live in LaserPointerRenderer.
 */
export class LaserPointerTool {
  private settings: LaserPointerSettings;
  private eventBus: EventEmitter;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.settings = {
      color: '#FF0000',
      size: 10,
      fadeTime: 800,
    };
  }

  public setColor(color: string): void {
    if (this.settings.color === color) return;
    this.settings.color = color;
    this.eventBus.emit('laser-pointer-settings-changed', this.getSettings());
  }

  public setSize(size: number): void {
    if (this.settings.size === size) return;
    this.settings.size = size;
    this.eventBus.emit('laser-pointer-settings-changed', this.getSettings());
  }

  public setFadeTime(fadeTime: number): void {
    if (this.settings.fadeTime === fadeTime) return;
    this.settings.fadeTime = fadeTime;
    this.eventBus.emit('laser-pointer-settings-changed', this.getSettings());
  }

  public getSettings(): LaserPointerSettings {
    return { ...this.settings };
  }
}
