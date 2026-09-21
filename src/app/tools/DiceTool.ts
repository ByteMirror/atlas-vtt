import { EventEmitter } from 'events';

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
  
  constructor(eventBus: EventEmitter) {
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

  public rollDice(formula: string, source?: DiceRollResult['source']): DiceRollResult {
    const result = this.parseAndRoll(formula);
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

  private parseAndRoll(formula: string): DiceRollResult {
    const id = `roll_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const timestamp = Date.now();
    const rolls: DiceRollResult['rolls'] = [];
    let modifiers = 0;
    
    // Parse dice formula (e.g., "2d6+3", "1d20-2", "3d8")
    const diceRegex = /(\d+)?d(\d+)/gi;
    const modifierRegex = /([+-]\s*\d+)/g;
    
    // Extract and roll dice
    let match;
    while ((match = diceRegex.exec(formula)) !== null) {
      const count = parseInt(match[1] || '1');
      const sides = parseInt(match[2] || '6');
      
      for (let i = 0; i < count; i++) {
        const value = Math.floor(Math.random() * sides) + 1;
        rolls.push({
          die: `d${sides}`,
          value,
          max: sides
        });
      }
    }
    
    // Extract modifiers
    const modifierMatches = formula.match(modifierRegex);
    if (modifierMatches) {
      modifierMatches.forEach(mod => {
        modifiers += parseInt(mod.replace(/\s/g, ''));
      });
    }
    
    // Calculate total
    const diceTotal = rolls.reduce((sum, roll) => sum + roll.value, 0);
    const total = diceTotal + modifiers;
    
    return {
      id,
      timestamp,
      formula,
      rolls,
      modifiers,
      total,
      player: 'Player' // TODO: Get actual player name from session
    };
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
