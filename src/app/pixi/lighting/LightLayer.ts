import { Buffer, BufferUsage, Container, Geometry, Mesh, Rectangle, type Filter, type Shader } from 'pixi.js';
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
  type LightUniforms,
} from './lightShaders';

const UNIT_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const QUAD_INDICES = new Uint32Array([0, 1, 2, 1, 3, 2]);

/**
 * One light in its own layer: the falloff quad writes colour, the shadow quads of its walls
 * add up their occlusion in alpha, and the layer filter adds colour × (1 − occlusion) to the
 * lighting layer. The layer covers the light's glow only (`boundsArea`), so each light costs
 * a pass the size of its own reach.
 */
export class LightLayer {
  readonly view = new Container({ label: 'light' });
  private readonly uniforms: LightUniforms = createLightUniforms();
  private readonly lightShader: Shader;
  private readonly shadowShader: Shader;
  private readonly lightGeometry: Geometry;
  private readonly filter: Filter = createLightLayerFilter();
  private shadowGeometry: Geometry | null = null;
  private shadowMesh: Mesh<Geometry, Shader> | null = null;

  constructor() {
    this.lightShader = createLightShader(this.uniforms);
    this.shadowShader = createShadowShader(this.uniforms);
    this.lightGeometry = new Geometry({
      attributes: { aPosition: { buffer: new Buffer({ data: UNIT_QUAD, usage: BufferUsage.VERTEX }), format: 'float32x2' } },
      indexBuffer: new Buffer({ data: QUAD_INDICES, usage: BufferUsage.INDEX }),
    });
    const lightMesh = new Mesh({ geometry: this.lightGeometry, shader: this.lightShader });
    lightMesh.blendMode = 'add';
    this.view.addChild(lightMesh);
    this.view.filters = [this.filter];
    this.view.eventMode = 'none';
  }

  /** Moves and restyles the light; `casters` rebuilds its shadows, null keeps them. */
  update(frame: LightFrame, casters: readonly WallSegment[] | null): void {
    this.uniforms.set(frame);
    const reach = frame.dim * LIGHT_EDGE;
    this.view.boundsArea = new Rectangle(frame.x - reach, frame.y - reach, reach * 2, reach * 2);
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
    this.filter.destroy();
  }
}
