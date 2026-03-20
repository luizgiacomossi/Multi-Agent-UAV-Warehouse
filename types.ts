
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export type MissionState = 'IDLE' | 'OUTBOUND' | 'EXECUTING_TOUR' | 'RETURNING' | 'COMPLETED';

export interface Agent {
  id: string;
  name: string;
  start: Position3D;
  goal: Position3D;
  color: string;
  path: Position3D[];
  status: 'IDLE' | 'FLYING' | 'CHARGING' | 'STRANDED';
  destructionTime?: number;
  deliveryTimes?: number[]; // kept for backward compat with Metrics
  scanTimes?: number[];     // ticks at which pallet scans were completed
  battery: number;
  maxBattery: number;
  payload: string[];          // e.g., ['camera', 'rfid']
  missionState?: MissionState;
  // Current inspection assignment
  currentPalletId?: string;   // ID of the pallet being inspected
  currentScanType?: string;   // 'camera' | 'rfid'
  scanLog?: { tick: number; palletId: string }[];  // history of completed scans
  assignedTasksLog?: { startTick: number; endTick: number; palletId: string; position: Position3D; type: string; priority: number }[];
}

export interface ClusterVisualization {
  id: string;
  droneId: string;
  droneName: string;
  color: string;
  centroid: Position3D;
  positions: Position3D[];
  palletIds: string[];
  startTick: number;
  endTick: number;
}

export interface Pallet {
  id: string;
  position: Position3D;
  weight: number;
  payload_type: string;
}

export interface Forklift {
  id: string;
  name: string;
  path: Position3D[];
  color: string;
}

export interface Task {
  id: string;
  target: Position3D;       // Typically the position of a Pallet
  req_payload: string;      // e.g., 'camera' or 'rfid'
  palletId?: string;        // ID of the pallet to inspect (Warehouse mode)
  pi_k: number;             // Priority (0.1 to 1.0)
  t_hover: number;          // Hover time at target in seconds (scan duration)
  status: 'PENDING' | 'ASSIGNED' | 'COMPLETED' | 'FAILED';
  assigned_drone_id?: string;
}

export type IncidentType = 'collision' | 'battery_dead';

export interface SimulationIncident {
  id: string;
  type: IncidentType;
  position: Position3D;
  time: number;
  agentIds: string[];
  agentNames: string[];
}

export enum GenerationTheme {
  RANDOM = "Random Maze",
  CITY = "City Blocks",
  TUNNEL = "Underground Tunnels",
  OPEN = "Open Field with Pillars",
  WAREHOUSE = "Warehouse"
}

export interface PathNode extends Position3D {
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
  time: number;
  energy: number; // Accumulated energy cost
}

// All mathematical constants are defined in SimulationConfig.ts (single source of truth).
// Re-exported here so existing imports of MATH_CONSTANTS from '../types' keep working.
export { MATH_CONSTANTS } from './SimulationConfig';
