export type WallType = 'solid' | 'door' | 'secret-door';

export interface WallSegment {
  id: string;
  kind: 'wall';
  type: WallType;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  direction?: 'left' | 'right';   // Light pass-through side (undefined = blocks both sides)
  closed?: boolean;               // Doors/secret doors: true = blocks vision (default true)
  chainId?: string;               // Groups segments from same draw action
}

/** Input for creating a wall (without auto-generated id/kind) */
export type WallInput = Omit<WallSegment, 'id' | 'kind'>;

export type LightStyle = 'torch' | 'magic' | 'steady';

export interface LightSource {
  id: string;
  kind: 'light';
  x: number;
  y: number;
  innerRadius: number;   // Bright/full visibility radius (world pixels)
  outerRadius?: number;  // Dim visibility radius (world pixels)
  color?: string;        // Hex color string e.g. '#ff9933' (default warm orange)
  lightStyle?: LightStyle; // Animation style (default 'torch')
}

/** Input for creating a light source (without auto-generated id/kind) */
export type LightInput = Omit<LightSource, 'id' | 'kind'>;

export interface VisionSettings {
  enabled: boolean;
  defaultInnerRadius: number;    // Default bright vision radius (world pixels)
  defaultOuterRadius?: number | undefined;   // Optional dim vision radius (world pixels); undefined = no dim zone
}
