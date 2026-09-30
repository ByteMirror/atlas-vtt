import { Container, Graphics, RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SightMeshes } from '../SightMeshes';
import { computeSight } from '../../../../vision/sight';
import type { WallSegment } from '../../../../types/wallTypes';
import type { VisionCone } from '../../../../vision/visionCone';
import { createTestRenderer, readRgba } from './gpuTestUtils';

describe('SightMeshes', () => {
  it('draws sight crisp at the wall, soft past its corner, nothing behind it', async () => {
    const renderer = await createTestRenderer(256);
    const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 128, y: 40 }, p2: { x: 128, y: 120 } };
    const sight = computeSight([{ tokenId: 't', origin: { x: 60, y: 80 }, range: 400, darkvision: 0 }], [wall]);
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    try {
      meshes.draw(sight, 20);
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      const px = readRgba(renderer, target);
      const red = (x: number, y: number): number => px[(y * 256 + x) * 4]!;
      expect(red(90, 80)).toBe(255);
      expect(red(200, 80)).toBe(0);
      // The wedge fans out from the wall's upper corner (128, 40) along the shadow edge (68, -40) and opens
      // 14.2 degrees towards the lit side: at x = 160 it runs from the edge at y = 21.2 to y = 8.4.
      expect(red(160, 24)).toBe(0);
      expect(red(160, 20)).toBeGreaterThan(0);
      expect(red(160, 20)).toBeLessThan(red(160, 15));
      expect(red(160, 15)).toBeGreaterThan(100);
      expect(red(160, 15)).toBeLessThan(160);
      expect(red(160, 15)).toBeLessThan(red(160, 10));
      expect(red(160, 10)).toBeLessThan(255);
      expect(red(160, 6)).toBe(255);
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });

  it('draws a cone with hard edges from the token, never where the full polygon draws nothing', async () => {
    const renderer = await createTestRenderer(256);
    const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 100 }, p2: { x: 200, y: 200 } };
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    const render = (cone?: VisionCone): Uint8ClampedArray => {
      meshes.draw(computeSight([{ tokenId: 't', origin: { x: 128, y: 128 }, range: 400, darkvision: 0, ...(cone && { cone }) }], [wall]), 20);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      return readRgba(renderer, target);
    };
    try {
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      const full = render();
      // Facing down with a half turn: the cone's edges run along y = 128, the fan's own first vertex angle.
      const down = render({ facing: Math.PI / 2, angle: Math.PI });
      const red = (px: Uint8ClampedArray, x: number, y: number): number => px[(y * 256 + x) * 4]!;
      expect(red(down, 128, 200)).toBe(255);
      expect(red(down, 40, 131)).toBe(255);
      expect(red(down, 180, 131)).toBe(255);
      expect(red(down, 128, 60)).toBe(0);
      expect(red(down, 40, 124)).toBe(0);
      const right = render({ facing: 0, angle: Math.PI / 2 });
      expect(red(right, 180, 128)).toBe(255);
      expect(red(right, 180, 172)).toBe(255);
      expect(red(right, 180, 184)).toBe(0);
      expect(red(right, 60, 128)).toBe(0);
      expect(red(right, 240, 150)).toBe(0);
      for (const cone of [{ facing: 0.4, angle: 2.2 }, { facing: -2.5, angle: 4 }, { facing: Math.PI, angle: 1 }]) {
        const px = render(cone);
        let outside = 0;
        for (let i = 0; i < px.length; i += 4) if (full[i] === 0 && px[i]! > 0) outside++;
        expect(outside).toBe(0);
      }
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });

  it('puts darkvision in green, combines tokens with max, and draws nothing when everything is seen', async () => {
    const renderer = await createTestRenderer(256);
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    const render = (): Uint8ClampedArray => {
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      return readRgba(renderer, target);
    };
    try {
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      const sources = [
        { tokenId: 'a', origin: { x: 60, y: 128 }, range: 60, darkvision: 0 },
        { tokenId: 'b', origin: { x: 100, y: 128 }, range: 60, darkvision: 30 },
      ];
      meshes.draw(computeSight(sources, []), 20);
      const px = render();
      const at = (x: number, y: number, channel: number): number => px[(y * 256 + x) * 4 + channel]!;
      expect(at(100, 128, 0)).toBe(255);
      expect(at(100, 128, 1)).toBe(255);
      expect(at(40, 128, 0)).toBe(255);
      expect(at(40, 128, 1)).toBe(0);
      expect(at(155, 128, 0)).toBe(255);
      expect(at(180, 128, 0)).toBe(0);
      expect(meshes.view.children).toHaveLength(3);

      meshes.draw(computeSight([], []), 20);
      expect(meshes.view.children).toHaveLength(0);
      const cleared = render();
      expect(cleared[(128 * 256 + 100) * 4]).toBe(0);
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });
});
