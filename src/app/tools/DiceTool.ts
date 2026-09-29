import { EventEmitter } from 'events';
import type { DiceMode, SettingsService } from '../services/SettingsService';
import type { PhysicalDiceTable } from '../physical-dice/PhysicalDiceTable';
import { readTableDice, tableDiceFor } from '../physical-dice/physicalDiceValues';
import { buildRollResult, parseDiceFormula, rollRandomDie } from './diceFormula';

export interface DiceRollResult {
  id: string;
  timestamp: number;
  formula: string;
  rolls: Array<{
    die: string; // e.g., "d20", "d6"
    value: number;
    max: number;
  }>;
  modifiers: number;
  total: number;
  player?: string;
  source?: {
    type: 'toolbar' | 'statblock';
    /** Let the roll follow its token's or statblock's current artwork. */
    tokenId?: string;
    statblockPath?: string;
    tokenName?: string;
    tokenImagePath?: string;
    abilityName?: string;
  };
}

export interface DiceToolState {
  isTrayOpen: boolean;
  rollHistory: DiceRollResult[];
  activeFormula: string;
  quickDice: string[]; // Quick access dice buttons
}

export class DiceTool {
  public state: DiceToolState;
  private eventBus: EventEmitter;
  private physicalTable: PhysicalDiceTable | null = null;

  constructor(eventBus: EventEmitter, private readonly settings?: SettingsService) {
    this.eventBus = eventBus;
    this.state = {
      isTrayOpen: false,
      rollHistory: [],
      activeFormula: '',
      quickDice: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
    };
  }

  public toggleTray(): void {
    this.state.isTrayOpen = !this.state.isTrayOpen;
    this.eventBus.emit('dice-tray-toggled', this.state.isTrayOpen);
  }

  /** Rolls with Atlas' random numbers, whatever the dice mode. */
  public rollDice(formula: string, source?: DiceRollResult['source']): DiceRollResult {
    const parsed = parseDiceFormula(formula);
    const result = buildRollResult(formula, parsed, parsed.sides.map(rollRandomDie));
    return this.publish(result, source);
  }

  /**
   * Rolls the way the game master chose: with random numbers, or on the physical
   * dice table, where the roll waits for the dice to be thrown. Resolves with
   * null when a physical roll is cancelled.
   */
  public async requestRoll(formula: string, source?: DiceRollResult['source']): Promise<DiceRollResult | null> {
    const table = this.physicalTable;
    if (this.getMode() !== 'physical' || !table) return this.rollDice(formula, source);

    const parsed = parseDiceFormula(formula);
    const plan = parsed.sides.map(tableDiceFor);
    const types = plan.flatMap((dice) => dice ?? []);
    if (types.length === 0) return this.rollDice(formula, source);

    const faces = await table.roll(types, formula);
    if (!faces) return null;

    // Dice the table has no model for (a d3, a d7) still get random numbers.
    let next = 0;
    const values = parsed.sides.map((sides, i) => {
      const dice = plan[i];
      if (!dice) return rollRandomDie(sides);
      const read = readTableDice(sides, faces.slice(next, next + dice.length));
      next += dice.length;
      return read;
    });
    return this.publish(buildRollResult(formula, parsed, values), source);
  }

  public getMode(): DiceMode {
    return this.settings?.getDiceMode() ?? 'rng';
  }

  public setMode(mode: DiceMode): void {
    this.settings?.setDiceMode(mode);
  }

  /** Physical dice are only thrown on a game master's map, which provides the table. */
  public attachPhysicalTable(table: PhysicalDiceTable): void {
    this.physicalTable?.destroy();
    this.physicalTable = table;
  }

  public hasPhysicalTable(): boolean {
    return this.physicalTable !== null;
  }

  public destroy(): void {
    this.physicalTable?.destroy();
    this.physicalTable = null;
  }

  private publish(result: DiceRollResult, source?: DiceRollResult['source']): DiceRollResult {
    if (source) {
      result.source = source;
    }

    // Add to history
    this.state.rollHistory.unshift(result);

    // Keep only last 50 rolls
    if (this.state.rollHistory.length > 50) {
      this.state.rollHistory = this.state.rollHistory.slice(0, 50);
    }

    document.dispatchEvent(new CustomEvent('atlas-dice-rolled', { detail: result }));

    return result;
  }

  public clearHistory(): void {
    this.state.rollHistory = [];
    this.eventBus.emit('dice-history-cleared');
    document.dispatchEvent(new CustomEvent('atlas-dice-history-cleared'));
  }

  public setActiveFormula(formula: string): void {
    this.state.activeFormula = formula;
  }

  public getQuickDice(): string[] {
    return this.state.quickDice;
  }

  public addQuickDie(die: string): void {
    if (!this.state.quickDice.includes(die)) {
      this.state.quickDice.push(die);
    }
  }

  public removeQuickDie(die: string): void {
    this.state.quickDice = this.state.quickDice.filter(d => d !== die);
  }

  // Get current state
  public getState(): DiceToolState {
    return { ...this.state };
  }
}
