import { SoundEffectService } from './SoundEffectService';
import { getDiceCrit } from '../tools/diceCrit';
import type { DiceRollResult } from '../tools/DiceTool';

/**
 * Plays the result sound for every dice roll, driven by the same
 * `atlas-dice-rolled` event that raises the toast.
 */
export class DiceToastObserver {
    private soundEffectService: SoundEffectService;

    constructor(soundEffectService: SoundEffectService) {
        this.soundEffectService = soundEffectService;
        document.addEventListener('atlas-dice-rolled', this.handleDiceRolled);
    }

    private handleDiceRolled = (event: Event): void => {
        const result = (event as CustomEvent<DiceRollResult>).detail;
        this.soundEffectService.playDiceResult(getDiceCrit(result));
    };

    destroy(): void {
        document.removeEventListener('atlas-dice-rolled', this.handleDiceRolled);
    }
}
