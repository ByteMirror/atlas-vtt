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

  private setupEventListeners(): void {
    // Mouse events for dice interactions
    const handleKeyPress = (e: KeyboardEvent) => {
      // Quick roll shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'd':
            e.preventDefault();
            this.toggleTray();
            break;
          case 'r':
            e.preventDefault();
            this.rollDice('d20'); // Quick d20 roll
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    (this as any).handleKeyPress = handleKeyPress;
  }

  private cleanupEventListeners(): void {
    if ((this as any).handleKeyPress) {
      document.removeEventListener('keydown', (this as any).handleKeyPress);
    }
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

  // Dice animation helpers
  public getRollAnimation(die: string, finalValue: number): any {
    // This will be used by the UI to determine animation parameters
    const sides = parseInt(die.substring(1));
    const rotations = 2 + Math.random() * 3; // 2-5 full rotations
    const duration = 1000 + Math.random() * 500; // 1-1.5 seconds
    
    return {
      die,
      sides,
      finalValue,
      rotations,
      duration,
      // Face mappings for 3D dice
      faceRotations: this.getDieFaceRotations(sides, finalValue)
    };
  }

  private getDieFaceRotations(sides: number, value: number): { x: number; y: number; z: number } {
    // Return the rotation needed to show the correct face
    // This will vary based on die type (d4, d6, d8, etc.)
    switch (sides) {
      case 4:
        return this.getD4Rotation(value);
      case 6:
        return this.getD6Rotation(value);
      case 8:
        return this.getD8Rotation(value);
      case 10:
        return this.getD10Rotation(value);
      case 12:
        return this.getD12Rotation(value);
      case 20:
        return this.getD20Rotation(value);
      case 100:
        return this.getD100Rotation(value);
      default:
        return { x: 0, y: 0, z: 0 };
    }
  }

  private getD6Rotation(value: number): { x: number; y: number; z: number } {
    // Standard d6 face orientations
    const rotations: Record<number, { x: number; y: number; z: number }> = {
      1: { x: 0, y: 0, z: 0 },
      2: { x: 0, y: 90, z: 0 },
      3: { x: -90, y: 0, z: 0 },
      4: { x: 90, y: 0, z: 0 },
      5: { x: 0, y: -90, z: 0 },
      6: { x: 180, y: 0, z: 0 }
    };
    return rotations[value] || { x: 0, y: 0, z: 0 };
  }

  private getD4Rotation(value: number): { x: number; y: number; z: number } {
    // D4 has triangular faces
    const rotations: Record<number, { x: number; y: number; z: number }> = {
      1: { x: 0, y: 0, z: 0 },
      2: { x: 109.47, y: 0, z: 0 },
      3: { x: 109.47, y: 120, z: 0 },
      4: { x: 109.47, y: 240, z: 0 }
    };
    return rotations[value] || { x: 0, y: 0, z: 0 };
  }

  private getD8Rotation(value: number): { x: number; y: number; z: number } {
    // D8 octahedron rotations
    const rotations: Record<number, { x: number; y: number; z: number }> = {
      1: { x: 0, y: 0, z: 0 },
      2: { x: 0, y: 90, z: 0 },
      3: { x: 0, y: 180, z: 0 },
      4: { x: 0, y: 270, z: 0 },
      5: { x: 109.47, y: 0, z: 0 },
      6: { x: 109.47, y: 90, z: 0 },
      7: { x: 109.47, y: 180, z: 0 },
      8: { x: 109.47, y: 270, z: 0 }
    };
    return rotations[value] || { x: 0, y: 0, z: 0 };
  }

  private getD10Rotation(value: number): { x: number; y: number; z: number } {
    // D10 pentagonal trapezohedron
    const baseAngle = 360 / 10;
    return {
      x: value > 5 ? 180 : 0,
      y: ((value - 1) % 5) * baseAngle,
      z: 0
    };
  }

  private getD12Rotation(value: number): { x: number; y: number; z: number } {
    // D12 dodecahedron - complex geometry
    // Simplified version for now
    return {
      x: Math.floor((value - 1) / 4) * 72,
      y: ((value - 1) % 4) * 90,
      z: 0
    };
  }

  private getD20Rotation(value: number): { x: number; y: number; z: number } {
    // D20 icosahedron - most complex
    // This is a simplified mapping
    const layer = Math.floor((value - 1) / 5);
    const position = (value - 1) % 5;
    
    return {
      x: layer * 63.43, // Golden angle
      y: position * 72,
      z: 0
    };
  }

  private getD100Rotation(value: number): { x: number; y: number; z: number } {
    // D100 is typically two D10s
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    
    return {
      x: tens * 36,
      y: ones * 36,
      z: 0
    };
  }
}