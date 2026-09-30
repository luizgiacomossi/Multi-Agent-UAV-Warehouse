import { Agent, Position3D } from '../types';
import { Drone } from './Drone';

/** What a drone is doing at a given playback tick. */
export type DroneActivityKind =
  | 'crashed'     // destroyed in a collision
  | 'depleted'    // battery ran out (falling / fallen)
  | 'blocked'     // the planner found no path and gave up
  | 'scanning'    // at a pallet, scanning it this tick
  | 'enRoute'     // flying to its assigned pallet
  | 'returning'   // flying back to its dock
  | 'holding'     // airborne, waiting in place (e.g. for traffic to clear)
  | 'inTransit'   // airborne between tasks
  | 'charging'    // on its dock or a station, recharging
  | 'docked'      // on its dock, waiting for a task
  | 'complete';   // mission finished, landed

export interface DroneActivity {
  kind: DroneActivityKind;
  /** Pallet being flown to or scanned. */
  palletId?: string;
  /** Sensor required by that pallet ('camera' | 'rfid'). */
  scanType?: string;
  /** 1-based number of the scan in progress (enRoute / scanning). */
  scanNumber?: number;
}

/** Tick-dependent physical state, as returned by Drone.getSnapshotAt. */
export interface ActivitySnapshot {
  isDeadBattery: boolean;
  isRecharging: boolean;
}

const samePos = (a: Position3D, b: Position3D) => a.x === b.x && a.y === b.y && a.z === b.z;

/**
 * Describes what `agent` is doing at `tick`, derived only from its planned, tick-indexed records
 * (path, task log, scan log). `agent.status` is the final planning outcome and must not be used
 * for per-tick labels.
 */
export function describeDroneActivity(
  agent: Agent,
  tick: number,
  dock: Position3D,
  snapshot: ActivitySnapshot
): DroneActivity {
  const finishTick = agent.path.length - 1;

  if (agent.destructionTime !== undefined && tick >= agent.destructionTime) return { kind: 'crashed' };
  if (snapshot.isDeadBattery) return { kind: 'depleted' };
  if (agent.status === 'STRANDED' && tick >= finishTick) return { kind: 'blocked' };

  const scansBefore = (agent.scanLog ?? []).filter(entry => entry.tick < tick).length;
  const scanNow = (agent.scanLog ?? []).find(entry => entry.tick === tick);
  const taskNow = (agent.assignedTasksLog ?? []).find(task => tick >= task.startTick && tick <= task.endTick);

  if (scanNow) {
    return { kind: 'scanning', palletId: scanNow.palletId, scanType: taskNow?.type, scanNumber: scansBefore + 1 };
  }
  if (taskNow) {
    return { kind: 'enRoute', palletId: taskNow.palletId, scanType: taskNow.type, scanNumber: scansBefore + 1 };
  }

  const position = agent.path[Math.min(tick, finishTick)] ?? agent.start;
  if (samePos(position, dock)) {
    if (tick >= finishTick) return { kind: 'complete' };
    return { kind: snapshot.isRecharging ? 'charging' : 'docked' };
  }
  if (snapshot.isRecharging) return { kind: 'charging' }; // at a charge station
  if (tick >= finishTick) return { kind: 'complete' };

  return { kind: isHeadingHome(agent, tick, dock) ? 'returning' : isStationary(agent, tick) ? 'holding' : 'inTransit' };
}

/** True if the drone reaches its dock before its next task starts. */
function isHeadingHome(agent: Agent, tick: number, dock: Position3D): boolean {
  const nextTaskStart = Math.min(
    ...(agent.assignedTasksLog ?? []).map(task => task.startTick).filter(start => start > tick),
    Infinity
  );
  for (let t = tick + 1; t < agent.path.length && t <= nextTaskStart; t++) {
    if (samePos(agent.path[t], dock)) return true;
  }
  return false;
}

function isStationary(agent: Agent, tick: number): boolean {
  const here = agent.path[tick];
  const next = agent.path[tick + 1];
  return !!here && !!next && samePos(here, next);
}

/**
 * Activity of any agent at `tick`. Drones use their dock and battery snapshot; other agents fall
 * back to their start cell and no battery effects.
 */
export function activityAt(agent: Agent, tick: number, chargeStations: Position3D[], batteryEnabled = true): DroneActivity {
  if (agent instanceof Drone) {
    const snapshot = agent.getSnapshotAt(tick, chargeStations, batteryEnabled);
    return describeDroneActivity(agent, tick, agent.mission.warehouseLocation, snapshot);
  }
  return describeDroneActivity(agent, tick, agent.start, { isDeadBattery: false, isRecharging: false });
}

/** Whether the drone is airborne and working (for fleet summaries). */
export function isFlying(activity: DroneActivity): boolean {
  return ['scanning', 'enRoute', 'returning', 'holding', 'inTransit'].includes(activity.kind);
}
