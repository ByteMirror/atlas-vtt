import type { LightStyle } from '../../types/wallTypes';

/**
 * Light animation matching Foundry VTT's blitzTorch pattern:
 *
 * - AR(1) random walk on alpha (intensity) AND ratio (bright/dim boundary)
 * - Time-gated major updates at random intervals
 * - Micro-drift between gates for 60fps smoothness
 * - Per-light persistent state
 *
 * Foundry animates three properties:
 *   alpha   → overall brightness (we map to intensityMul)
 *   ratio   → bright/dim boundary position (we map to ratioMul)
 *   translateXY → slight position jitter (not implemented yet)
 *
 * Reference: BlitzKraig/fvtt-CommunityLighting blitzTorch source code
 */

interface LightAnimState {
  alpha: number;
  ratio: number;
  animTime: number;
  flipped: boolean;
}

const states = new Map<string, LightAnimState>();

function getState(id: string): LightAnimState {
  let s = states.get(id);
  if (!s) {
    s = { alpha: 1.0, ratio: 1.0, animTime: 0, flipped: false };
    states.set(id, s);
  }
  return s;
}

/** Gaussian random via Box-Muller. */
function gaussRand(): number {
  return Math.sqrt(-2 * Math.log(Math.random() || 1e-10)) * Math.cos(Math.PI * 2 * Math.random());
}

/**
 * AR(1): next = φ·current + (1-φ)·center + noise·σ
 * Matches Foundry's PointSource._ar1
 */
function ar1(current: number, center: number, sigma: number, phi: number, min: number, max: number): number {
  const next = phi * current + (1 - phi) * center + gaussRand() * sigma;
  return Math.max(min, Math.min(max, next));
}

/** Remove animation state for a specific light (call when light is deleted). */
export function clearLightAnimState(lightId: string): void {
  states.delete(lightId);
}

/** Remove all animation state (call on map unload / renderer destroy). */
export function clearAllLightAnimState(): void {
  states.clear();
}

export function computeLightAnimation(
  lightId: string,
  style: LightStyle | undefined,
  timeMs: number,
): { radiusMul: number; intensityMul: number } {
  if (!style || style === 'steady') return { radiusMul: 1, intensityMul: 1 };

  const state = getState(lightId);
  const t = timeMs;

  if (style === 'torch') return torchStep(state, t);
  if (style === 'magic') return magicStep(state, t);
  return { radiusMul: 1, intensityMul: 1 };
}

/**
 * Torch: Foundry blitzTorch pattern.
 *
 * Major AR(1) updates at random intervals.
 * Between updates, tiny micro-drift (±0.001) on both alpha and ratio.
 * Alpha center=0.9, ratio center=1.0.
 */
function torchStep(state: LightAnimState, t: number): { radiusMul: number; intensityMul: number } {
  const speed = 5;
  const intensity = 5;
  // Foundry formula: targetMS = (0.5 + rand/2) * (10 - speed) * 16
  const targetMS = (0.5 + Math.random() * 0.5) * (10 - speed) * 16;

  if ((t - state.animTime) < targetMS) {
    // Micro-drift between major updates (Foundry's alteredValue)
    const micro = Math.random() * 0.001;
    if (state.flipped) {
      state.alpha -= micro;
      state.ratio -= micro * 0.5;
    } else {
      state.alpha += micro;
      state.ratio += micro * 0.5;
    }
    // Gentle clamp
    state.alpha = Math.max(0.65, Math.min(1.1, state.alpha));
    state.ratio = Math.max(0.85, Math.min(1.15, state.ratio));
  } else {
    // Major update
    state.animTime = t;
    state.flipped = !state.flipped;

    // AR(1) on alpha: smooth walk around 0.9, σ scaled by intensity
    // Foundry: sigma = 0.005 * intensity, center = 0.9
    state.alpha = ar1(state.alpha, 0.9, 0.005 * intensity, 0.95, 0.65, 1.1);

    // AR(1) on ratio: smooth walk around 1.0
    // Foundry: sigma = 0.002 * intensity / ratioDamper, center = bright/dim
    state.ratio = ar1(state.ratio, 1.0, 0.002 * intensity, 0.95, 0.85, 1.15);
  }

  return {
    radiusMul: state.ratio,
    intensityMul: state.alpha,
  };
}

/**
 * Magic: very smooth, slow drift. Higher φ, lower σ.
 */
function magicStep(state: LightAnimState, t: number): { radiusMul: number; intensityMul: number } {
  const speed = 3;
  const intensity = 3;
  const targetMS = (0.5 + Math.random() * 0.5) * (10 - speed) * 16;

  if ((t - state.animTime) < targetMS) {
    const micro = Math.random() * 0.0005;
    if (state.flipped) {
      state.alpha -= micro;
      state.ratio -= micro * 0.3;
    } else {
      state.alpha += micro;
      state.ratio += micro * 0.3;
    }
    state.alpha = Math.max(0.8, Math.min(1.05, state.alpha));
    state.ratio = Math.max(0.92, Math.min(1.08, state.ratio));
  } else {
    state.animTime = t;
    state.flipped = !state.flipped;
    state.alpha = ar1(state.alpha, 0.95, 0.003 * intensity, 0.97, 0.8, 1.05);
    state.ratio = ar1(state.ratio, 1.0, 0.001 * intensity, 0.97, 0.92, 1.08);
  }

  return {
    radiusMul: state.ratio,
    intensityMul: state.alpha,
  };
}
