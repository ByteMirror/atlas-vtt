/**
 * The face of a wall takes its light from the floor in front of it. Tiles end at the capsule, so
 * a pixel on the capsule's edge climbs the wall field (`climbFromWall`) until it is a band away
 * from every centre line: the gradient is taken anew at every step, so the path bends out of
 * inside corners instead of sliding along one wall into another's shadow. Each step stays inside
 * the ball the conservative field proves free of centre lines, so the end lies on the pixel's
 * side of every wall however the gradient points. Requires `fieldGlsl('uField')`.
 */
export const WALL_PUSH_GLSL = `
/** Distance to the nearest wall centre line as the field stores it (bilinear, not conservative). */
float wallDistance(vec2 w) { return uFieldDistance(w) + uFieldParams.x; }

vec2 wallNormal(vec2 w) {
  vec2 h = vec2(uFieldRect.z / float(textureSize(uField, 0).x), 0.0);
  vec2 g = vec2(uFieldDistance(w + h.xy) - uFieldDistance(w - h.xy), uFieldDistance(w + h.yx) - uFieldDistance(w - h.yx));
  float len = length(g);
  return len > 1e-4 ? g / len : vec2(0.0);
}

vec2 climbFromWall(vec2 w, float band) {
  vec2 p = w;
  for (int i = 0; i < 6; i++) {
    float c = uFieldDistance(p);
    if (c >= band) break;
    vec2 n = wallNormal(p);
    float step = min(c - 0.01, band - c + 0.05);
    if (step <= 0.0 || n == vec2(0.0)) break;
    p += n * step;
  }
  return p;
}`;
