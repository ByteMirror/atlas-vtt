import { setIcon, type App } from 'obsidian';
import { DiceEngine } from './engine/DiceEngine';
import { createDiceSettings } from './engine/diceSettings';
import { loadDicePack } from './dicePack';

const SETTLED_DICE_LINGER_MS = 1500;

/**
 * The 3D dice table over a game master's map. A roll puts the requested dice on
 * the table; the game master throws them (drag a die, or Throw for all of them)
 * and the roll resolves once every die has a reading. Dice can be thrown one at
 * a time, so each die's latest reading is kept by its place on the table.
 *
 * The engine is built on the first roll and kept until the map closes: building
 * it decodes every face sheet of the pack.
 */
export class PhysicalDiceTable {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly label: HTMLElement;
  private readonly status: HTMLElement;
  private readonly rerollButton: HTMLButtonElement;
  private readonly throwButton: HTMLButtonElement;
  private engine: DiceEngine | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private statusTimer: number | null = null;
  private clearTimer: number | null = null;
  private pending: {
    readings: Array<number | null>;
    resolve: (faces: number[] | null) => void;
  } | null = null;

  constructor(private readonly app: App, host: HTMLElement, private readonly pluginDir: string | undefined) {
    this.root = host.createDiv('atlas-physical-dice');
    this.root.hide();
    this.stage = this.root.createDiv('atlas-physical-dice__stage');

    this.bar = this.root.createDiv('atlas-physical-dice__bar');
    const icon = this.bar.createSpan('atlas-physical-dice__icon');
    setIcon(icon, 'dices');
    const text = this.bar.createDiv('atlas-physical-dice__text');
    this.label = text.createDiv('atlas-physical-dice__formula');
    this.status = text.createDiv('atlas-physical-dice__status');

    this.rerollButton = this.bar.createEl('button', { cls: 'atlas-physical-dice__reroll', text: 'Reroll caught' });
    this.rerollButton.hide();
    this.rerollButton.addEventListener('click', () => this.engine?.rerollCaughtDice());

    this.throwButton = this.bar.createEl('button', { cls: 'mod-cta atlas-physical-dice__throw', text: 'Throw' });
    this.throwButton.addEventListener('click', () => void this.throwAll());

    const cancel = this.bar.createEl('button', {
      cls: 'atlas-physical-dice__cancel',
      attr: { 'aria-label': 'Cancel roll' },
    });
    setIcon(cancel, 'x');
    cancel.addEventListener('click', () => this.finish(null));
  }

  /**
   * Puts `types` (`['d20', 'd6']`) on the table and resolves with the face each
   * came up on, in the same order, or null when the roll is cancelled.
   */
  async roll(types: string[], formula: string): Promise<number[] | null> {
    this.finish(null);
    const engine = await this.ensureEngine();

    this.root.show();
    this.layout();
    engine.isViewActive = true;
    engine.clearAllDice();
    for (const type of types) engine.createSingleDice(type);

    this.label.setText(formula);
    this.throwButton.disabled = false;
    this.startStatus();

    return new Promise((resolve) => {
      this.pending = { readings: types.map(() => null), resolve };
      this.showProgress();
    });
  }

  /** Cancels a roll in progress and removes the table. */
  destroy(): void {
    this.finish(null);
    if (this.clearTimer !== null) window.clearTimeout(this.clearTimer);
    this.resizeObserver?.disconnect();
    this.engine?.destroy();
    this.engine = null;
    this.root.remove();
  }

  private async ensureEngine(): Promise<DiceEngine> {
    if (this.engine) return this.engine;

    const engine = new DiceEngine(this.stage, createDiceSettings());
    engine.onRollComplete = () => this.takeReadings();
    this.engine = engine;

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.root);

    const loaded = await loadDicePack(this.app, this.pluginDir);
    if (loaded) {
      engine.setPack(loaded.pack);
      engine.setPackTextures(loaded.textures, loaded.normals);
      engine.rebuildDice();
    }
    return engine;
  }

  private layout(): void {
    const rect = this.root.getBoundingClientRect();
    if (this.engine && rect.width > 0 && rect.height > 0) this.engine.updateSize(rect.width, rect.height);
  }

  private async throwAll(): Promise<void> {
    if (!this.engine || this.engine.rollInProgress) return;
    this.throwButton.disabled = true;
    try {
      // A button throw resolves here rather than through onRollComplete.
      await this.engine.roll();
      this.takeReadings();
    } catch {
      // No dice left to throw: nothing to read.
    } finally {
      this.throwButton.disabled = false;
    }
  }

  /** Files the dice that just settled under their place on the table. */
  private takeReadings(): void {
    const rolled = this.engine?.takeLastRoll();
    const pending = this.pending;
    if (!rolled || !pending) return;

    rolled.forEach((die, i) => {
      const index = die.index ?? i;
      if (index < pending.readings.length) pending.readings[index] = die.value;
    });

    if (pending.readings.every((value) => value !== null)) {
      this.finish(pending.readings as number[]);
    } else {
      this.showProgress();
    }
  }

  private showProgress(): void {
    const readings = this.pending?.readings ?? [];
    const read = readings.filter((value) => value !== null).length;
    this.status.setText(read === 0
      ? 'Drag a die to throw it, or throw them all'
      : `${read} of ${readings.length} dice read. Throw the rest`);
  }

  private startStatus(): void {
    this.stopStatus();
    this.statusTimer = window.setInterval(() => {
      const caught = this.engine?.getDiceStatus().filter((die) => die.status === 'caught').length ?? 0;
      this.rerollButton.toggle(caught > 0);
      if (caught > 0) this.rerollButton.setText(`Reroll ${caught} caught`);
    }, 300);
  }

  private stopStatus(): void {
    if (this.statusTimer !== null) window.clearInterval(this.statusTimer);
    this.statusTimer = null;
    this.rerollButton.hide();
  }

  private finish(faces: number[] | null): void {
    const pending = this.pending;
    this.pending = null;
    this.stopStatus();
    if (this.clearTimer !== null) window.clearTimeout(this.clearTimer);
    this.clearTimer = null;

    if (faces) {
      // Leave the settled dice on the table a moment, beside the result toast.
      this.throwButton.disabled = true;
      this.status.setText('Rolled');
      this.clearTimer = window.setTimeout(() => {
        this.clearTimer = null;
        if (!this.pending) this.clearTable();
      }, SETTLED_DICE_LINGER_MS);
    } else {
      this.clearTable();
    }
    pending?.resolve(faces);
  }

  private clearTable(): void {
    if (this.engine) {
      this.engine.clearAllDice();
      this.engine.isViewActive = false;
    }
    this.root.hide();
  }
}
