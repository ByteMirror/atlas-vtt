import type { LightAnimation } from '../../types/lightingTypes';

/** How a light deviates from its settings at one moment. */
export interface FlickerSample {
  intensity: number;
  /** Multiplies the light's radii. */
  radiusScale: number;
  /** Offset of the flame in world pixels, so its shadows sway. */
  jitterX: number;
  jitterY: number;
}

const STEADY: FlickerSample = { intensity: 1, radiusScale: 1, jitterX: 0, jitterY: 0 };

/** A random walk channel: its range and how much of the previous value each step keeps. */
interface Channel { min: number; max: number; keep: number }

interface WalkProfile {
  /** Milliseconds between random steps; samples in between are interpolated. */
  step: number;
  intensity: Channel;
  radius: Channel;
  jitter: number;
}

const WALKS: Partial<Record<LightAnimation, WalkProfile>> = {
  torch: { step: 60, intensity: { min: 0.85, max: 1.1, keep: 0.85 }, radius: { min: 0.97, max: 1.03, keep: 0.9 }, jitter: 1.5 },
  candle: { step: 45, intensity: { min: 0.8, max: 1.05, keep: 0.7 }, radius: { min: 0.98, max: 1.02, keep: 0.8 }, jitter: 0.8 },
  magic: { step: 120, intensity: { min: 1, max: 1, keep: 1 }, radius: { min: 0.96, max: 1.04, keep: 0.95 }, jitter: 0 },
};

/** Four random walks in [-1, 1]: intensity, radius, jitter x and y. */
interface WalkState {
  stepIndex: number;
  previous: number[];
  current: number[];
}

/**
 * Organic light animation. Torches and candles follow autoregressive random walks
 * (the AR(1) flicker Foundry VTT uses), stepped at a fixed rate and interpolated in
 * between, so they stay smooth at any frame rate; pulse and magic lights breathe.
 * State is per instance and per light id; `forget` drops a removed light.
 */
export class LightFlicker {
  private readonly walks = new Map<string, WalkState>();

  constructor(private readonly random: () => number = Math.random) {}

  sample(id: string, animation: LightAnimation, timeMs: number): FlickerSample {
    if (animation === 'none') return STEADY;
    if (animation === 'pulse') {
      return { intensity: 1 + 0.15 * Math.sin((timeMs * 2 * Math.PI) / 2000), radiusScale: 1, jitterX: 0, jitterY: 0 };
    }
    const profile = WALKS[animation]!;
    const [intensity, radius, jx, jy] = this.walk(id, profile, timeMs);
    const breathing = animation === 'magic' ? 1 + 0.1 * Math.sin(timeMs / 700) + 0.05 * Math.sin(timeMs / 230) : channelValue(profile.intensity, intensity!);
    return {
      intensity: breathing,
      radiusScale: channelValue(profile.radius, radius!),
      jitterX: jx! * profile.jitter,
      jitterY: jy! * profile.jitter,
    };
  }

  forget(id: string): void {
    this.walks.delete(id);
  }

  private walk(id: string, profile: WalkProfile, timeMs: number): number[] {
    const stepIndex = Math.floor(timeMs / profile.step);
    let state = this.walks.get(id);
    if (!state) {
      state = { stepIndex, previous: [0, 0, 0, 0], current: [0, 0, 0, 0] };
      this.walks.set(id, state);
    }
    const keeps = [profile.intensity.keep, profile.radius.keep, profile.radius.keep, profile.radius.keep];
    // A long pause (hidden tab) restarts the walk instead of replaying every missed step.
    if (stepIndex - state.stepIndex > 50) state.stepIndex = stepIndex - 1;
    while (state.stepIndex < stepIndex) {
      state.previous = state.current;
      state.current = state.current.map((value, i) => {
        const keep = keeps[i]!;
        return Math.max(-1, Math.min(1, value * keep + (1 - keep) * (this.random() * 2 - 1) * 3));
      });
      state.stepIndex++;
    }
    const t = (timeMs % profile.step) / profile.step;
    const eased = t * t * (3 - 2 * t);
    return state.current.map((value, i) => state!.previous[i]! + (value - state!.previous[i]!) * eased);
  }
}

function channelValue(channel: Channel, walk: number): number {
  return channel.min + ((walk + 1) / 2) * (channel.max - channel.min);
}
