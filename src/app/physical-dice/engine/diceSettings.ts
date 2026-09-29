/**
 * Settings the vendored dice engine reads. Taken from the Physical Dice plugin
 * (github.com/evolJoaoBento/obsidian-physical-dice); Atlas keeps them at their
 * defaults. Every engine gets its own copy (`createDiceSettings`), because the
 * engine writes to it.
 */
export interface DiceSettings {
    // Dice configuration
    diceType: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20'; // Legacy - will be removed
    diceSize: number;

    // Multi-dice counts (how many of each type)
    diceCounts: {
        d4: number;
        d6: number;
        d8: number;
        d10: number;
        d100: number;
        d12: number;
        d20: number;
    };

    // Shadow settings
    enableShadows: boolean;

    // Lighting settings
    ambientLightIntensity: number;
    ambientLightColor: string;
    directionalLightIntensity: number;
    directionalLightColor: string;
    directionalLightPositionX: number;
    directionalLightPositionY: number;
    directionalLightPositionZ: number;

    // Animation settings
    enableResultAnimation: boolean;

    // Motion detection settings
    motionThreshold: number;

    // Face detection settings
    faceDetectionTolerance: number;

    // Highlight settings
    highlightCompletedDice: boolean;
    completedDiceHighlightColor: string;

    // Face calibration mapping
    /**
     * Folder under the plugin's dice/ directory holding one atlas per die type,
     * named `<type>_Numbers.png`. Copy the folder, edit the images, pick it
     * here - that is the whole of making a custom set.
     */
    texturePack: string;

    faceMapping: { [faceIndex: number]: number };

}

export const DEFAULT_SETTINGS: DiceSettings = {
    // Dice defaults
    diceType: 'd20', // Legacy - will be removed
    diceSize: 0.8,

    // Multi-dice counts defaults (start with no dice)
    diceCounts: {
        d4: 0,
        d6: 0,
        d8: 0,
        d10: 0,
        d100: 0,
        d12: 0,
        d20: 0
    },

    // Shadow defaults
    enableShadows: true,

    // Lighting defaults
    // Ambient near 1 flattens everything it touches: with no gradient across a
    // face the chamfer stops reading and the dice go back to looking like tiles.
    // Keep the fill low and let the key light do the shaping.
    ambientLightIntensity: 0.45,
    ambientLightColor: '#ffffff',
    // three stopped treating light intensity as a plain multiplier: a
    // directional light is divided by PI now, so these read far dimmer than the
    // numbers suggest. Both were picked against the rendered die, not the scale.
    directionalLightIntensity: 2.8,
    directionalLightColor: '#ffffff',
    directionalLightPositionX: 0,
    directionalLightPositionY: 35,
    directionalLightPositionZ: 0,

    // Animation defaults
    enableResultAnimation: true,

    // Motion detection defaults
    motionThreshold: 2.0,

    // Face detection defaults
    faceDetectionTolerance: 0.3,

    // Highlight defaults
    // Off by default: the highlight is an emissive wash over the whole die, so
    // a settled die stops showing its own colour while it is on.
    highlightCompletedDice: false,
    completedDiceHighlightColor: '#00ff00',

    // Face mapping defaults (1:1 mapping initially)
    texturePack: 'Texture-Pack-Default',

    faceMapping: {
        0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10,
        10: 11, 11: 12, 12: 13, 13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19, 19: 20
    },

};

export function createDiceSettings(): DiceSettings {
    return structuredClone(DEFAULT_SETTINGS);
}
