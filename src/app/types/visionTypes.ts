export interface Point {
  x: number;
  y: number;
}

export interface VisionSource {
  id: string;
  x: number;
  y: number;
  innerRadius: number;
  outerRadius: number;  // If no dim ring, same as innerRadius
}

export interface VisionPolygon {
  sourceId: string;
  vertices: Point[];    // Ordered polygon vertices
  innerRadius: number;
  outerRadius: number;
  origin: Point;        // Source position (for ring clipping)
  intensity: number;    // 0–1+ brightness multiplier (animated for torch/magic)
}

export interface VisionResult {
  polygons: VisionPolygon[];
  dirty: boolean;
}
