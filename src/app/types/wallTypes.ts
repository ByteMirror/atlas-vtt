export type WallType = 'solid' | 'door' | 'secret-door';

export interface WallSegment {
  id: string;
  kind: 'wall';
  type: WallType;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  direction?: 'left' | 'right' | undefined;   // Light pass-through side (undefined = blocks both sides)
  closed?: boolean;               // Doors/secret doors: true = blocks vision (default true)
  chainId?: string;               // Groups segments from same draw action
}

/** Input for creating a wall (without auto-generated id/kind) */
export type WallInput = Omit<WallSegment, 'id' | 'kind'>;
