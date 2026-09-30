import { Buffer, BufferUsage, Container, Geometry, Mesh, Point, type Matrix, type Shader } from 'pixi.js';
import type { WallSegment } from '../../types/wallTypes';
import { destroyTree } from '../utils/destroyTree';
import { buildShadowQuads } from './shadowGeometry';
import {
  LIGHT_EDGE,
  createLightLayerFilter,
  createLightShader,
  createLightUniforms,
  createShadowShader,
  type LightFrame,
  type LightLayerFilter,
  type LightUniforms,
} from './lightShaders';

const QUAD_INDICES = new Uint32Array([0, 1, 2, 1, 3, 2]);

/**
 * One light in its own layer: the falloff quad writes colour, the shadow quads of its walls
 * add up their occlusion in alpha, and the layer filter adds colour × (1 − occlusion) to the
 * lighting layer. The layer covers the light's glow only (the quad's bounds), so each light costs
 * a pass the size of its own reach (the quad's bounds).
 */
export class LightLayer {
  readonly view = new Container({ label: 'light' });
  private readonly uniforms: LightUniforms = createLightUniforms();
  private readonly lightShader: Shader;
  private readonly shadowShader: Shader;
  private readonly lightGeometry: Geometry;
  /** Corners of the light's glow in world pixels. PIXI takes a filter's area from its children's
   * vertex bounds, so the quad must hold its real extent, not one the shader scales out. */
  private readonly quad = new Float32Array(8);
  private readonly quadBuffer = new Buffer({ data: this.quad, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
  private readonly layerFilter: LightLayerFilter = createLightLayerFilter();
  private readonly centre = new Point();
  private shadowGeometry: Geometry | null = null;
  private shadowMesh: Mesh<Geometry, Shader> | null = null;

  constructor() {
    this.lightShader = createLightShader(this.uniforms);
    this.shadowShader = createShadowShader(this.uniforms);
    this.lightGeometry = new Geometry({
      attributes: { aPosition: { buffer: this.quadBuffer, format: 'float32x2' } },
      indexBuffer: new Buffer({ data: QUAD_INDICES, usage: BufferUsage.INDEX }),
    });
    const lightMesh = new Mesh({ geometry: this.lightGeometry, shader: this.lightShader });
    lightMesh.blendMode = 'add';
    this.view.addChild(lightMesh);
    this.view.filters = [this.layerFilter.filter];
    this.view.eventMode = 'none';
  }

  /** Shadow edges blur `pixels` wide on screen, across the light's rays; `worldToScreen` is the camera of the frame being rendered. */
  setEdge(pixels: number, worldToScreen: Matrix): void {
    const light = worldToScreen.apply(this.centre);
    this.layerFilter.setEdge(pixels, light.x, light.y);
  }

  /** Moves and restyles the light; `casters` rebuilds its shadows, null keeps them. */
  update(frame: LightFrame, casters: readonly WallSegment[] | null): void {
    this.uniforms.set(frame);
    this.centre.set(frame.x, frame.y);
    const reach = frame.dim * LIGHT_EDGE;
    const [left, top, right, bottom] = [frame.x - reach, frame.y - reach, frame.x + reach, frame.y + reach];
    this.quad.set([left, top, right, top, left, bottom, right, bottom]);
    this.quadBuffer.update();
    if (casters) this.setCasters(casters);
  }

  private setCasters(casters: readonly WallSegment[]): void {
    this.clearShadows();
    if (casters.length === 0) return;
    const quads = buildShadowQuads(casters);
    const vertex = (data: Float32Array): Buffer => new Buffer({ data, usage: BufferUsage.VERTEX });
    this.shadowGeometry = new Geometry({
      attributes: {
        aPosition: { buffer: vertex(quads.positions), format: 'float32x2' },
        aSegment: { buffer: vertex(quads.segments), format: 'float32x4' },
        aCorner: { buffer: vertex(quads.corners), format: 'float32x2' },
      },
      indexBuffer: new Buffer({ data: quads.indices, usage: BufferUsage.INDEX }),
    });
    this.shadowMesh = new Mesh({ geometry: this.shadowGeometry, shader: this.shadowShader });
    this.shadowMesh.blendMode = 'add';
    this.view.addChild(this.shadowMesh);
  }

  private clearShadows(): void {
    this.shadowMesh?.destroy();
    this.shadowMesh = null;
    this.shadowGeometry?.destroy(true);
    this.shadowGeometry = null;
  }

  /**
   * Frees geometry, shaders and filter. The GL programs stay: `Shader.from` shares them
   * through PIXI's program cache (see `LaserBeam.destroy`).
   */
  destroy(): void {
    this.clearShadows();
    destroyTree(this.view);
    this.lightGeometry.destroy(true);
    this.lightShader.destroy();
    this.shadowShader.destroy();
    this.layerFilter.filter.destroy();
  }
}
