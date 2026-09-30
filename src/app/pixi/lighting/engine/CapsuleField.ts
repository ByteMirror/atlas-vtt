import { Buffer, BufferUsage, Container, Geometry, Mesh, Shader, UniformGroup, type Renderer, type RenderTexture, type TextureSource } from 'pixi.js';
import { FIELD_MAX, fieldMargin } from '../../../lighting/lightingConstants';
import type { Seg } from '../../../lighting/segments';
import { GLSL_VERSION } from './glsl';
import { createQuad, createTarget, HIGHP, quadGeometry, renderInto, type Quad, type Rect } from './gpu';

const vertex = `${GLSL_VERSION}
in vec2 aPosition;
in vec4 aSegment;
uniform vec4 uBuildRect;
uniform float uMax;
out vec2 vWorld;
flat out vec4 vSegment;
void main() {
  vec2 lo = min(aSegment.xy, aSegment.zw) - uMax;
  vec2 hi = max(aSegment.xy, aSegment.zw) + uMax;
  vWorld = mix(lo, hi, aPosition);
  vSegment = aSegment;
  gl_Position = vec4((vWorld - uBuildRect.xy) / uBuildRect.zw * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragment = `${GLSL_VERSION}
in vec2 vWorld;
flat in vec4 vSegment;
uniform float uMax;
out vec4 finalColor;
void main() {
  vec2 ab = vSegment.zw - vSegment.xy;
  vec2 ap = vWorld - vSegment.xy;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  finalColor = vec4(min(length(ap - ab * t), uMax), 0.0, 0.0, 1.0);
}`;

/**
 * Distance to the nearest wall centre line over a world rectangle (`r16float`), exact at
 * texel centres: each wall is an instanced quad reaching `FIELD_MAX` around it, `min`-blended.
 * Shaders read it through `fieldGlsl(name)` with this field's `resources()`.
 */
export class CapsuleField {
  readonly texture: RenderTexture;
  readonly uniforms: UniformGroup;
  private readonly quad: Quad = createQuad();
  private readonly buildUniforms = new UniformGroup({
    uBuildRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uMax: { value: FIELD_MAX, type: 'f32' },
  });
  private readonly shader: Shader;
  private readonly mesh: Mesh<Geometry, Shader>;
  // `min` blending applies only to a mesh below the render root, so the mesh is drawn from here.
  private readonly scene = new Container();
  private readonly empty = new Container();
  private readonly initialGeometry: Geometry;
  private built: { geometry: Geometry; segments: Buffer } | null = null;

  constructor(private readonly renderer: Renderer, rect: Rect, readonly texel: number, wallRadius: number, readonly name = 'uField') {
    this.texture = createTarget(rect[2] / texel, rect[3] / texel, 'r16float');
    const covered = [rect[0], rect[1], this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
    this.buildUniforms.uniforms.uBuildRect.set(covered);
    this.uniforms = new UniformGroup({
      [`${name}Rect`]: { value: new Float32Array(covered), type: 'vec4<f32>' },
      [`${name}Params`]: { value: new Float32Array([fieldMargin(texel), wallRadius]), type: 'vec2<f32>' },
    });
    this.shader = Shader.from({
      gl: { vertex, fragment, name: 'atlas-capsule-field', preferredFragmentPrecision: HIGHP },
      resources: { fieldBuild: this.buildUniforms },
    });
    this.initialGeometry = quadGeometry(this.quad);
    this.mesh = new Mesh({ geometry: this.initialGeometry, shader: this.shader });
    this.mesh.blendMode = 'min';
    this.scene.addChild(this.mesh);
  }

  build(segments: readonly Seg[]): void {
    const clear: [number, number, number, number] = [FIELD_MAX, 0, 0, 1];
    if (segments.length === 0) {
      renderInto(this.renderer, this.empty, this.texture, clear);
      return;
    }
    const buffer = new Buffer({ data: new Float32Array(segments.flat()), usage: BufferUsage.VERTEX });
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.quad.vertices, format: 'float32x2' },
        aSegment: { buffer, format: 'float32x4', instance: true },
      },
      indexBuffer: this.quad.indices,
      instanceCount: segments.length,
    });
    this.mesh.geometry = geometry;
    renderInto(this.renderer, this.scene, this.texture, clear);
    this.releaseBuilt();
    this.built = { geometry, segments: buffer };
  }

  /** The quad buffers are shared with every geometry, so only the segment buffer goes with its geometry. */
  private releaseBuilt(): void {
    this.built?.geometry.destroy();
    this.built?.segments.destroy();
    this.built = null;
  }

  resources(): Record<string, UniformGroup | TextureSource> {
    return { [this.name]: this.texture.source, [`${this.name}Uniforms`]: this.uniforms };
  }

  destroy(): void {
    this.scene.destroy({ children: true });
    this.empty.destroy();
    this.releaseBuilt();
    this.initialGeometry.destroy();
    this.quad.vertices.destroy();
    this.quad.indices.destroy();
    this.shader.destroy();
    this.texture.destroy(true);
  }
}
