import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene, type Scene } from './sceneLightingHarness';

describe('the lighting engine reports new sight', () => {
  let scene: Scene | null = null;
  afterEach(() => {
    scene?.dispose();
    scene = null;
  });

  it('when a vision token moves, with the new sight already in place', async () => {
    const origins: number[] = [];
    const onSightChange = vi.fn(() => {
      if (scene) origins.push(scene.host.currentSight().regions[0]!.origin.x);
    });
    scene = await createScene({ enabled: true, onSightChange });
    expect(onSightChange).toHaveBeenCalled();
    onSightChange.mockClear();

    scene.moveToken(140, 128);
    scene.moveToken(180, 128);

    expect(onSightChange).toHaveBeenCalledTimes(2);
    expect(origins).toEqual([140, 180]);
  });

  it('not for a change that only alters the look, and not while lighting is off', async () => {
    const onSightChange = vi.fn();
    scene = await createScene({ enabled: true, onSightChange });
    onSightChange.mockClear();

    scene.setLighting({ ambientColor: '#3366cc' });
    expect(onSightChange).not.toHaveBeenCalled();

    scene.switchLighting(false);
    scene.moveToken(60, 128);
    expect(onSightChange).not.toHaveBeenCalled();

    scene.switchLighting(true);
    expect(onSightChange).toHaveBeenCalledTimes(1);
  });
});
