import { defaultFilterVert } from 'pixi.js';
import { capsuleFieldFragment, capsuleFieldVertex } from './capsuleFieldShader';
import { cascadeFragment, cascadeVertex, emissionFragment, resolveFragment } from './cascadeShaders';
import { compositeFragment } from './compositeShader';
import { darknessFragment, darknessVertex, pierceFragment, pierceVertex } from './darknessShader';
import { lightMapFragment, lightMapVertex } from './lightMapShader';
import { limitedFragment, limitedVertex } from './limitedShader';
import { sightFragment, sightVertex } from './sightShader';
import { tileFragment, tileVertex } from './tileShader';
import { tileSmoothFragment } from './tileSmoothShader';
import { zoneFragment } from './zoneShader';

export interface EngineShaderSource {
  readonly name: string;
  readonly vertex: string;
  readonly fragment: string;
}

/**
 * Every program the lighting engine draws with. Passes create their shaders from these entries
 * (`createShader`), so the rules the unit tests hold the sources to, and the check that they
 * compile on the device (`verifyEngineShaders`), cover all of them.
 */
export const ENGINE_SHADERS = {
  capsuleField: { name: 'atlas-capsule-field', vertex: capsuleFieldVertex, fragment: capsuleFieldFragment },
  tile: { name: 'atlas-visibility-tile', vertex: tileVertex, fragment: tileFragment },
  tileSmooth: { name: 'atlas-visibility-tile-smooth', vertex: tileVertex, fragment: tileSmoothFragment },
  tileLimited: { name: 'atlas-visibility-tile-limited', vertex: limitedVertex, fragment: limitedFragment },
  lightMap: { name: 'atlas-light-map', vertex: lightMapVertex, fragment: lightMapFragment },
  darkness: { name: 'atlas-darkness', vertex: darknessVertex, fragment: darknessFragment },
  pierce: { name: 'atlas-darkness-pierce', vertex: pierceVertex, fragment: pierceFragment },
  zone: { name: 'atlas-ambient-zone', vertex: lightMapVertex, fragment: zoneFragment },
  bounceEmission: { name: 'atlas-bounce-emission', vertex: cascadeVertex, fragment: emissionFragment },
  bounceCascade: { name: 'atlas-bounce-cascade', vertex: cascadeVertex, fragment: cascadeFragment },
  bounceResolve: { name: 'atlas-bounce-resolve', vertex: cascadeVertex, fragment: resolveFragment },
  sight: { name: 'atlas-sight', vertex: sightVertex, fragment: sightFragment },
  composite: { name: 'atlas-lighting-composite', vertex: defaultFilterVert, fragment: compositeFragment },
} as const satisfies Record<string, EngineShaderSource>;
