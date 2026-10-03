import { afterEach, describe, expect, it, vi } from 'vitest';
import { borrowStage, canShowDice, releaseStagePool, releaseStagePools } from '../../../src/app/dice3d/stagePool';

/** The canvases the document contexts were made on; `failGpu` makes the next context fail. */
const gpuCanvases: HTMLCanvasElement[] = [];
let failGpu = false;

vi.mock('../../../src/app/dice3d/DiceGpu', () => ({
  DiceGpu: class {
    constructor(canvas: HTMLCanvasElement) {
      if (failGpu) throw new Error('No WebGL');
      gpuCanvases.push(canvas);
    }
    dispose(): void {}
  },
}));

vi.mock('../../../src/app/dice3d/DiceRenderer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/app/dice3d/DiceRenderer')>(),
  DiceRenderer: class {
    reset(): void {}
  },
}));

describe('stagePool without WebGL', () => {
  afterEach(() => {
    releaseStagePools();
    gpuCanvases.length = 0;
    failGpu = false;
  });

  it('shows rolls as cards in a document whose context could not be made, and only there', () => {
    const popout = document.implementation.createHTMLDocument('popout');
    failGpu = true;
    expect(canShowDice(document)).toBe(true);
    borrowStage(document);
    expect(canShowDice(document)).toBe(false);
    expect(canShowDice(popout)).toBe(true);
  });

  it('shows rolls as cards while the context is lost, and dice again once it comes back', () => {
    borrowStage(document);
    expect(canShowDice(document)).toBe(true);
    const [gpuCanvas] = gpuCanvases;
    gpuCanvas!.dispatchEvent(new Event('webglcontextlost'));
    expect(canShowDice(document)).toBe(false);
    gpuCanvas!.dispatchEvent(new Event('webglcontextrestored'));
    expect(canShowDice(document)).toBe(true);
  });

  it('tries again in a window whose dice were given back', () => {
    failGpu = true;
    borrowStage(document);
    releaseStagePool(document);
    expect(canShowDice(document)).toBe(true);
  });
});
