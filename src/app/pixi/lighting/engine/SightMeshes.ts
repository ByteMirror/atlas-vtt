import { Buffer, BufferImageSource, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Shader } from 'pixi.js';
import type { Point } from '../../../types/visionTypes';
import type { Sight } from '../../../vision/sight';
import { sightWedges, type SightWedge } from '../../../vision/sightWedges';
import type { Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { DISC_SHARE_GLSL, GLSL_VERSION } from './glsl';
import { createShader } from './gpu';

/** Wedges a fragment tests at most; more corners than this per token stay hard. */
const MAX_WEDGES = 256;

const vertex = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  vWorld = aPosition;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}`;

// Inside the polygon; each wedge (corner a, edge e, side, angle phi) fades sight from 0 on the
// shadow edge to 1 at its inner side, following the viewer's round footprint. Only ever lowers.
const fragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform sampler2D uWedges;
uniform int uWedgeCount;
uniform vec4 uChannel;
out vec4 finalColor;
${DISC_SHARE_GLSL}
void main() {
  float seen = 1.0;
  for (int i = 0; i < ${MAX_WEDGES}; i++) {
    if (i >= uWedgeCount) break;
    vec4 ae = texelFetch(uWedges, ivec2(i, 0), 0);
    vec2 sp = texelFetch(uWedges, ivec2(i, 1), 0).xy;
    vec2 v = vWorld - ae.xy;
    float theta = atan(sp.x * (ae.z * v.y - ae.w * v.x), dot(ae.zw, v));
    if (theta >= 0.0 && theta < sp.y) seen *= discShare(2.0 * theta / sp.y - 1.0);
  }
  finalColor = uChannel * seen;
}`;

type Channel = readonly [number, number, number, number];

const RED: Channel = [1, 0, 0, 0];
const GREEN: Channel = [0, 1, 0, 0];

/** A sight mesh with the GPU objects it owns besides the mesh itself. */
interface SightMesh {
  mesh: Mesh<Geometry, Shader>;
  wedges: BufferImageSource;
}

/**
 * What vision tokens see, drawn into the lighting layer (so each render, including the player
 * window's own camera, draws it with its camera): red = in sight, green = darkvision.
 * Tokens combine with `max`. A visibility polygon is star-shaped around its origin, so a
 * triangle fan from the origin covers it exactly.
 */
export class SightMeshes {
  readonly view = new Container({ label: 'sight' });
  private meshes: SightMesh[] = [];

  draw(sight: Sight, radius: number): void {
    this.clear();
    if (sight.all) return;
    sight.polygons.forEach((polygon, i) => this.add(polygon, sight.origins[i]!, radius, RED));
    sight.darkvision.forEach((polygon, i) => this.add(polygon, sight.darkvisionOrigins[i]!, radius, GREEN));
  }

  private add(polygon: Polygon, origin: Point, radius: number, channel: Channel): void {
    if (polygon.length < 3) return;
    const wedges = sightWedges(origin, polygon, radius).slice(0, MAX_WEDGES);
    const wedgeSource = wedgeTexture(wedges);
    const uniforms = new UniformGroup({
      uWedgeCount: { value: wedges.length, type: 'i32' },
      uChannel: { value: new Float32Array(channel), type: 'vec4<f32>' },
    });
    const shader = createShader(vertex, fragment, 'atlas-sight', { sightUniforms: uniforms, uWedges: wedgeSource });
    const mesh = new Mesh({ geometry: fanGeometry(origin, polygon), shader });
    mesh.blendMode = 'max';
    this.view.addChild(mesh);
    this.meshes.push({ mesh, wedges: wedgeSource });
  }

  private clear(): void {
    this.view.removeChildren();
    for (const { mesh, wedges } of this.meshes) {
      mesh.geometry.destroy(true);
      mesh.shader?.destroy();
      wedges.destroy();
      mesh.destroy();
    }
    this.meshes = [];
  }

  destroy(): void {
    this.clear();
    destroyTree(this.view);
  }
}

/** Two rows of `rgba32float` texels, one column per wedge: corner and edge, then side and angle. */
function wedgeTexture(wedges: readonly SightWedge[]): BufferImageSource {
  const count = Math.max(1, wedges.length);
  const data = new Float32Array(count * 2 * 4);
  wedges.forEach((w, i) => {
    data.set([w.a.x, w.a.y, w.e.x, w.e.y], i * 4);
    data.set([w.side, w.phi, 0, 0], (count + i) * 4);
  });
  // Premultiplying on upload is invalid for float data and leaves the texture empty.
  return new BufferImageSource({
    resource: data,
    width: count,
    height: 2,
    format: 'rgba32float',
    scaleMode: 'nearest',
    alphaMode: 'no-premultiply-alpha',
  });
}

function fanGeometry(origin: Point, polygon: Polygon): Geometry {
  const positions = new Float32Array([origin.x, origin.y, ...polygon.flatMap((p) => [p.x, p.y])]);
  const indices: number[] = [];
  for (let i = 1; i <= polygon.length; i++) indices.push(0, i, (i % polygon.length) + 1);
  return new Geometry({
    attributes: { aPosition: { buffer: new Buffer({ data: positions, usage: BufferUsage.VERTEX }), format: 'float32x2' } },
    indexBuffer: new Buffer({ data: new Uint32Array(indices), usage: BufferUsage.INDEX }),
  });
}
