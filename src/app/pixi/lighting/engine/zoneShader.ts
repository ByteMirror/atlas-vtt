import { MAX_ZONE_CORNERS } from '../../../lighting/lightZones';
import { GLSL_VERSION, TRACE_GLSL, fieldGlsl } from './glsl';

/**
 * One ambient zone over the rectangle around it (`lightMapVertex`), written premultiplied, so
 * zones drawn in their order lie over each other as the rule has them: `uZoneLight` (the zone's
 * ambient light in linear light) times its share, and the share in alpha. Inside the polygon
 * (`uPoints`, `uCount` corners) the share is 1: there the rule counts the zone. Past the outline
 * it falls to 0 over `uSoft` world pixels, where the nearest point of the outline is in plain
 * view: the trace stops at walls, so the soft edge never lies behind one, and passes a doorway.
 *
 * Like a light's tile, that ends at a wall's capsule: a zone drawn on its room's walls must not
 * lie on their far half, nor on a texel the composite reads there. The composite gives a wall's
 * face the ambient light of the floor in front of it. A second draw (`uOnWalls`) fills the
 * capsules alone, with the zones darker than the scene: there a zone has no soft edge and lies
 * up to `uWallReach` past its outline, so the wall a dark zone ends at is dark through and through.
 */
export const zoneFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec2 uPoints[${MAX_ZONE_CORNERS}];
uniform int uCount;
uniform float uSoft;
uniform float uOnWalls;
uniform float uWallReach;
uniform vec3 uZoneLight;
out vec4 finalColor;
${fieldGlsl('uField')}
float clearance(vec2 w) { return uFieldClearance(w); }
${TRACE_GLSL}
void main() {
  bool onWall = clearance(vWorld) <= 0.0;
  if (onWall != (uOnWalls > 0.5)) discard;
  bool inside = false;
  float best = 1e20;
  vec2 nearest = vWorld;
  for (int i = 0; i < ${MAX_ZONE_CORNERS}; i++) {
    if (i >= uCount) break;
    vec2 a = uPoints[i];
    vec2 b = uPoints[i + 1 == uCount ? 0 : i + 1];
    if ((a.y > vWorld.y) != (b.y > vWorld.y) && vWorld.x < (b.x - a.x) * (vWorld.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    vec2 ab = b - a;
    vec2 q = a + ab * clamp(dot(vWorld - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = distance(vWorld, q);
    if (d < best) {
      best = d;
      nearest = q;
    }
  }
  float share = 1.0;
  if (onWall) {
    if (!inside && best >= uWallReach) discard;
  } else if (!inside) {
    if (best >= uSoft || !reaches(vWorld, nearest)) discard;
    float u = 1.0 - best / uSoft;
    share = u * u * (3.0 - 2.0 * u);
  }
  finalColor = vec4(uZoneLight * share, share);
}`;
