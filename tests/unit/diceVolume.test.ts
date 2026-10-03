import { afterEach, describe, expect, it, vi } from 'vitest';
import { masterLevel, setDiceVolume } from '../../src/app/dice3d/audio/diceSamples';
import { DiceToastObserver } from '../../src/app/services/DiceToastObserver';
import { SettingsService } from '../../src/app/services/SettingsService';
import { SoundEffectService } from '../../src/app/services/SoundEffectService';
import { playDiceReveal } from '../../src/app/audio/diceRevealSound';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';

vi.mock('../../src/app/audio/diceRevealSound', () => ({
  playDiceReveal: vi.fn(async () => undefined),
  disposeDiceRevealSound: vi.fn(),
}));

afterEach(() => {
  setDiceVolume(1);
  vi.restoreAllMocks();
});

describe('dice volume', () => {
  it('is full by default, kept between 0 and 1, and full again when the file holds nonsense', async () => {
    const read = vi.fn(async () => JSON.stringify({ diceVolume: 'loud' }));
    const settings = new SettingsService({ vault: { adapter: { exists: async () => true, read, write: async () => undefined } } } as never);
    await settings.initialize();
    expect(settings.getDiceVolume()).toBe(1);
    settings.setDiceVolume(0.35);
    expect(settings.getDiceVolume()).toBe(0.35);
    settings.setDiceVolume(4);
    expect(settings.getDiceVolume()).toBe(1);
    settings.setDiceVolume(-1);
    expect(settings.getDiceVolume()).toBe(0);
  });

  it('scales the level every 3D roll fades in to', () => {
    const full = masterLevel();
    setDiceVolume(0.5);
    expect(masterLevel()).toBeCloseTo(full / 2);
    setDiceVolume(0);
    expect(masterLevel()).toBe(0);
  });

  it('plays the result card sound at the dice volume, and not at all at 0', () => {
    let volume = 0.4;
    const playDiceResult = vi.fn();
    const observer = new DiceToastObserver(
      { playDiceResult } as unknown as SoundEffectService,
      { getDiceDisplay: () => 'card', getDiceVolume: () => volume },
    );
    const roll = (): void => {
      document.dispatchEvent(new CustomEvent<Partial<DiceRollResult>>('atlas-dice-rolled', { detail: { rolls: [], crit: null } }));
    };
    try {
      roll();
      expect(playDiceResult).toHaveBeenLastCalledWith(null, 0.4);
      volume = 0;
      roll();
      expect(playDiceResult).toHaveBeenLastCalledWith(null, 0);
    } finally {
      observer.destroy();
    }
  });

  it('scales the result card sound by the dice volume and stays silent at 0', () => {
    const sounds = new SoundEffectService();
    try {
      sounds.playDiceResult('high', 0.5);
      expect(playDiceReveal).toHaveBeenLastCalledWith('high', sounds.getVolume() * 0.5);
      vi.mocked(playDiceReveal).mockClear();
      sounds.playDiceResult('high', 0);
      expect(playDiceReveal).not.toHaveBeenCalled();
    } finally {
      sounds.destroy();
    }
  });
});
