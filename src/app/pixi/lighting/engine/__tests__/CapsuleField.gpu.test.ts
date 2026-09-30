import { Buffer, Container, Mesh, Shader } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { distToSeg, type Seg } from '../../../../lighting/segments';
import { FIELD_MAX, fieldMargin } from '../../../../lighting/lightingConstants';
import { FULLSCREEN_VERTEX, fieldGlsl, GLSL_VERSION } from '../glsl';
import { createQuad, createTarget, HIGHP, quadGeometry, renderInto } from '../gpu';
import { createTestRenderer, readFloats } from './gpuTestUtils';

describe('CapsuleField', () => {
  it('stores the exact distance to the nearest wall at texel centres, clamped', async () => {
    const renderer = await createTestRenderer(64);
    const first: Seg = [40, 40, 200, 60];
    const last: Seg = [200, 60, 120, 220];
    const walls: Seg[] = [first, last];
    const field = new CapsuleField(renderer, [0, 0, 256, 256], 2, 3);
    try {
      field.build(walls);
      const texels = readFloats(renderer, field.texture);
      const width = field.texture.source.pixelWidth;
      let nearestIsNotLast = 0;
      for (const [i, j] of [[10, 10], [60, 30], [100, 100], [127, 127], [5, 120]] as const) {
        const x = (i + 0.5) * 2;
        const y = (j + 0.5) * 2;
        const expected = Math.min(FIELD_MAX, ...walls.map((w) => distToSeg(x, y, w)));
        const lastWall = Math.min(FIELD_MAX, distToSeg(x, y, last));
        if (lastWall - expected > 1) nearestIsNotLast++;
        expect(texels[(j * width + i) * 4]).toBeCloseTo(expected, 0);
      }
      // Overwrite blending would keep the last wall drawn; these probes must tell it from min.
      expect(nearestIsNotLast).toBeGreaterThan(0);
    } finally {
      field.destroy();
      renderer.destroy();
    }
  });

  it('is empty (all FIELD_MAX) without walls', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 64, 64], 2, 3);
    try {
      field.build([]);
      const texels = readFloats(renderer, field.texture);
      expect(Array.from(texels).filter((_, i) => i % 4 === 0).every((v) => v === FIELD_MAX)).toBe(true);
    } finally {
      field.destroy();
      renderer.destroy();
    }
  });

  it('frees each build\'s segment buffer when the next build replaces it and on destroy', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 64, 64], 2, 3);
    const original = Buffer.prototype.destroy;
    const destroyed: (number | undefined)[] = [];
    const destroy = vi.spyOn(Buffer.prototype, 'destroy').mockImplementation(function (this: Buffer): void {
      destroyed.push(this.data[0]);
      original.call(this);
    });
    // Segment buffers are told apart from PIXI's own by their distinctive first coordinate.
    const segmentBuffers = (): (number | undefined)[] => destroyed.filter((first) => first === 11.5 || first === 13.5);
    try {
      field.build([[11.5, 10, 50, 10]]);
      expect(segmentBuffers()).toEqual([]);
      field.build([[13.5, 10, 50, 10], [10, 30, 50, 30]]);
      expect(segmentBuffers()).toEqual([11.5]);
      field.destroy();
      expect(segmentBuffers()).toEqual([11.5, 13.5]);
    } finally {
      destroy.mockRestore();
      renderer.destroy();
    }
  });

  it('reads conservatively through fieldGlsl, inside, in the edge band and outside the rect', async () => {
    const renderer = await createTestRenderer(64);
    const texel = 2;
    const wall: Seg = [40, 40, 200, 60];
    const field = new CapsuleField(renderer, [0, 0, 256, 256], texel, 3);
    const points: [number, number][] = [[100, 150], [0.5, 100], [255.5, 40], [-30, 100], [300, 300], [128, -40]];
    const literal = points.map(([x, y]) => `vec2(${x.toFixed(2)}, ${y.toFixed(2)})`).join(', ');
    const target = createTarget(points.length, 1, 'r16float', 'nearest');
    const shader = Shader.from({
      gl: {
        vertex: FULLSCREEN_VERTEX,
        fragment: `${GLSL_VERSION}
in vec2 vUv;
out vec4 finalColor;
${fieldGlsl('uField')}
void main() {
  vec2 pts[${points.length}] = vec2[${points.length}](${literal});
  finalColor = vec4(uFieldDistance(pts[int(gl_FragCoord.x)]), 0.0, 0.0, 1.0);
}`,
        name: 'atlas-field-read-test',
        preferredFragmentPrecision: HIGHP,
      },
      resources: field.resources(),
    });
    const quad = createQuad();
    const geometry = quadGeometry(quad);
    const mesh = new Mesh({ geometry, shader });
    const scene = new Container();
    scene.addChild(mesh);
    try {
      field.build([wall]);
      renderInto(renderer, scene, target, [0, 0, 0, 0]);
      const read = readFloats(renderer, target);
      points.forEach(([x, y], i) => {
        const truth = Math.min(FIELD_MAX, distToSeg(x, y, wall));
        const sampled = read[i * 4];
        // The margin pays for interpolation, so the read never exceeds the true distance (half-float slack 0.1).
        expect(sampled).toBeLessThanOrEqual(truth + 0.1);
        // Inside the rect it is also tight; outside, the distance to the rect is deliberately taken off.
        if (x >= 0 && x <= 256 && y >= 0 && y <= 256) expect(sampled).toBeGreaterThanOrEqual(truth - fieldMargin(texel) - 2 * texel - 0.1);
      });
    } finally {
      scene.destroy({ children: true });
      geometry.destroy();
      quad.vertices.destroy();
      quad.indices.destroy();
      shader.destroy();
      target.destroy(true);
      field.destroy();
      renderer.destroy();
    }
  });
});
