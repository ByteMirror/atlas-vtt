import { Container, Text } from 'pixi.js';
import { barDimensions } from '../styles/designTokens';
import type { ResourceValue } from './tokenValueEditor';

/** Separate current and maximum numbers, centred in their clickable half of the bar. */
export class ResourceBarLabel extends Container {
  private currentText: Text;
  private maximumText: Text;

  constructor() {
    super();
    this.currentText = this.createNumber('resource-current', -barDimensions.token.width / 4);
    this.createNumber('resource-separator', 0).text = '/';
    this.maximumText = this.createNumber('resource-max', barDimensions.token.width / 4);
  }

  setValue(value: ResourceValue): void {
    this.currentText.text = String(value.current);
    this.maximumText.text = String(value.max);
  }

  private createNumber(label: string, x: number): Text {
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
    text.anchor.set(0.5);
    text.scale.set(0.333);
    text.position.x = x;
    this.addChild(text);
    return text;
  }
}
