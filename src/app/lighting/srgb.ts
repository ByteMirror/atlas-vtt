/** One sRGB channel (0..1) in linear light; the shaders' `toLinear` does the same on the GPU. */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** A `#rrggbb` colour in linear light, scaled by `level`. */
export function linearColor(hex: string, level = 1): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [srgbToLinear(((value >> 16) & 0xff) / 255) * level, srgbToLinear(((value >> 8) & 0xff) / 255) * level, srgbToLinear((value & 0xff) / 255) * level];
}
