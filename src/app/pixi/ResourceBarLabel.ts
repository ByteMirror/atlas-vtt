import { Container, Text } from 'pixi.js';
import type { ResourceValue } from './tokenValueEditor';

/** Horizontal distance from the bar centre to the near edge of each number, in bar pixels. */
export const RESOURCE_NUMBER_GAP = 1.5;

/** Current and maximum numbers hugging a central slash, each in its own clickable half of the bar. */
export class ResourceBarLabel extends Container {
  private currentText: Text;
  private maximumText: Text;

  constructor() {
    super();
    this.currentText = this.createNumber('resource-current', 1, -RESOURCE_NUMBER_GAP);
    this.createNumber('resource-separator', 0.5, 0).text = '/';
    this.maximumText = this.createNumber('resource-max', 0, RESOURCE_NUMBER_GAP);
  }

  setValue(value: ResourceValue): void {
    this.currentText.text = String(value.current);
    this.maximumText.text = String(value.max);
  }

  /** Rasterisation resolution of the numbers; set only when it changes, since each change re-rasterises. */
  setResolution(resolution: number): void {
    for (const text of this.children) {
      if (text instanceof Text && text.resolution !== resolution) text.resolution = resolution;
    }
  }

  private createNumber(label: string, anchorX: number, x: number): Text {
    const text = new Text({
      label,
      text: '',
      resolution: 3,
      style: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
        fontSize: 18,
        fill: 0xffffff,
        fontWeight: '600',
        stroke: { color: 0x000000, width: 2 },
      },
    });
    text.anchor.set(anchorX, 0.5);
    text.scale.set(0.333);
    text.position.x = x;
    this.addChild(text);
    return text;
  }
}
