
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Agent {
  id: string;
  name: string;
  start: Position3D;
  goal: Position3D;
  color: string;
  path: Position3D[];
  status: 'idle' | 'moving' | 'finished' | 'blocked' | 'destroyed' | 'out_of_battery';
  destructionTime?: number;
  deliveryTime?: number;
  maxBattery: number;
}

export interface CollisionEvent {
  position: Position3D;
  time: number;
  agentIds: string[];
}

export enum GenerationTheme {
  RANDOM = "Random Maze",
  CITY = "City Blocks",
  TUNNEL = "Underground Tunnels",
  OPEN = "Open Field with Pillars"
}

export interface PathNode extends Position3D {
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
  time: number;
  energy: number; // Accumulated energy cost
}

export const ENERGY_COSTS = {
  MOVE: 1.0,
  WAIT: 0.1 // Hovering consumes much less than moving
};
