/**
 * Wall faces take light and sight from their own side. The wall field's distance grows away
 * from the nearest centre line on the pixel's side, so its gradient points to where the floor
 * in front of the wall lies. `pushFromWall` walks that way by sphere tracing the conservative
 * field, with steps shortened by `margin`: every point on the way, the end included, stays at
 * least `margin` from every centre line, so what is read there lies on the pixel's side of every
 * wall however the gradient points. Requires `fieldGlsl('uField')`.
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

/** How far from w along n (up to \`want\`) the path stays at least \`margin\` from every centre line. */
float pushFromWall(vec2 w, vec2 n, float want, float margin) {
  float s = 0.0;
  for (int i = 0; i < 8; i++) {
    float step = uFieldDistance(w + n * s) - margin;
    if (step <= 0.0) break;
    s = min(s + step, want);
    if (s >= want) break;
  }
  return s;
}`;
