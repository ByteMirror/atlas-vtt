/** One sRGB channel (0..1) in linear light; the shaders' `toLinear` does the same on the GPU. */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
