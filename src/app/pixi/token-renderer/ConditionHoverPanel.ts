import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';

/**
 * PIXI-based hover panel that appears to the right of a token,
 * listing each active condition with a colored dot and its name.
 */
export class ConditionHoverPanel {
  readonly container = new Container();
  private bg = new Graphics();
  private rows: Container[] = [];
  private static readonly ROW_HEIGHT = 22;
  private static readonly PADDING = 8;
  private static readonly DOT_RADIUS = 5;
  private static readonly MIN_WIDTH = 100;

  constructor() {
    this.container.addChild(this.bg);
    this.container.visible = false;
    this.container.eventMode = 'none';
  }

  /** Show the panel with the resolved condition data positioned to the right of the token. */
  show(
    activeConditionIds: string[],
    conditionDefs: ConditionDefinition[],
    tokenRadius: number,
  ): void {
    this.clearRows();

    const active = activeConditionIds
      .map(id => conditionDefs.find(d => d.id === id))
      .filter((d): d is ConditionDefinition => d !== undefined);

    if (active.length === 0) {
      this.container.visible = false;
      return;
    }

    const pad = ConditionHoverPanel.PADDING;
    const rowH = ConditionHoverPanel.ROW_HEIGHT;
    const dotR = ConditionHoverPanel.DOT_RADIUS;
    const isDark = document.body.classList.contains('theme-dark');
    const textColor = isDark ? '#e0e0e0' : '#1a1a1a';

    const style = new TextStyle({
      fontSize: 13,
      fill: textColor,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });

    let maxTextWidth = ConditionHoverPanel.MIN_WIDTH;
    const textObjects: Text[] = [];
    for (const cond of active) {
      const t = new Text({ text: cond.name, style });
      textObjects.push(t);
      if (t.width > maxTextWidth) maxTextWidth = t.width;
    }

    const panelWidth = pad + dotR * 2 + pad + maxTextWidth + pad;
    const panelHeight = pad + active.length * rowH + pad;

    const bgColor = isDark ? 0x1e1e1e : 0xf5f5f5;
    const borderColor = isDark ? 0x444444 : 0xcccccc;
    this.bg.clear();
    this.bg
      .roundRect(0, 0, panelWidth, panelHeight, 8)
      .fill({ color: bgColor, alpha: 0.95 })
      .stroke({ width: 1, color: borderColor, alpha: 0.5 });

    for (let i = 0; i < active.length; i++) {
      const cond = active[i];
      const label = textObjects[i];
      if (!cond || !label) continue;

      const row = new Container();
      const y = pad + i * rowH;

      const dot = new Graphics();
      const color = parseInt(cond.color.replace('#', ''), 16);
      dot.circle(0, 0, dotR).fill({ color });
      dot.position.set(pad + dotR, y + rowH / 2);
      row.addChild(dot);

      label.position.set(pad + dotR * 2 + pad, y + (rowH - label.height) / 2);
      row.addChild(label);

      row.eventMode = 'none';
      this.container.addChild(row);
      this.rows.push(row);
    }

    this.container.position.set(tokenRadius + 8, -panelHeight / 2);
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
  }

  private clearRows(): void {
    for (const row of this.rows) row.destroy({ children: true });
    this.rows = [];
    this.bg.clear();
  }

  destroy(): void {
    this.clearRows();
    this.bg.destroy();
    this.container.destroy();
  }
}
