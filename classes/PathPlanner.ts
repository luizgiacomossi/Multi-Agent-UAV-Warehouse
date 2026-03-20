
import { Position3D, PathNode, SimulationIncident, MATH_CONSTANTS } from '../types';
import { World } from './World';
import { Swarm } from './Drone';
import { PATHFINDER_TIMEOUT_MS, MAX_TIMESTEPS } from '../SimulationConfig';

const TIMEOUT_MS = PATHFINDER_TIMEOUT_MS;

const DIRECTIONS = [ // these are the 6 directions + wait
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, // x-axis
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, // y-axis
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, // z-axis
  { x: 0, y: 0, z: 0 },  // wait -> very important for collision avoidance and checking pallets
];

export abstract class PathFindingStrategy {
  abstract name: string;
  abstract description: string;
  abstract isSafe: boolean;
  protected maxTimeSteps: number;

  constructor(maxTimeSteps: number = 200) {
    this.maxTimeSteps = maxTimeSteps;
  }

  public setMaxTimeSteps(steps: number) {
    this.maxTimeSteps = steps;
  }

  // Modified to plan a single leg for all agents
  abstract planLeg(  // a leg is a segment of the path between two waypoints!!! 
    swarm: Swarm, // all the drones
    world: World, // the warehouse
    globalStartTime: number, // the time at which the leg starts
    reservedSpaceTime: Set<number>, // the set of reserved space-time cells (reserved by other drones)
    maxAltitude?: number, // the maximum altitude
    batteryEnabled?: boolean // whether battery is considered  
  ): void;


  // heuristic function for A* algorithm to estimate the cost to reach the goal
  // used to prioritize nodes to explore! 
  protected heuristic(a: Position3D, b: Position3D): number {
    // Manhattan distance
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
  }

  /**
   * If `pos` is blocked, BFS outward (max 5 steps) to find the nearest free neighbor.
   * This allows drone goals to be set to pallet center positions even though pallets are blocked voxels.
   */
  protected nearestFreeNeighbor(pos: Position3D, world: World): Position3D {
    if (!world.isBlocked(pos.x, pos.y, pos.z)) return pos;

    const queue: Position3D[] = [pos];
    const visited = new Set<string>();
    visited.add(`${pos.x},${pos.y},${pos.z}`);

    while (queue.length > 0) { // Breadth-First Search (BFS)
      const curr = queue.shift()!;
      for (const dir of DIRECTIONS) {
        if (dir.x === 0 && dir.y === 0 && dir.z === 0) continue; // skip wait
        const nx = curr.x + dir.x;
        const ny = curr.y + dir.y;
        const nz = curr.z + dir.z;
        const key = `${nx},${ny},${nz}`; // key for the visited set
        if (visited.has(key)) continue;
        visited.add(key);
        if (nx < 0 || ny < 0 || nz < 0 || nx >= world.size || ny >= world.size || nz >= world.size) continue; // check bounds
        if (!world.isBlocked(nx, ny, nz)) return { x: nx, y: ny, z: nz }; // return the nearest free neighbor
        if (visited.size < 200) queue.push({ x: nx, y: ny, z: nz }); // limit BFS breadth
      }
    }
    return pos; // fallback: return original (A* will fail gracefully) =)
  }

  protected reconstructPath(node: PathNode): Position3D[] {
    // Reconstruct the path from: goal -> start
    const path: Position3D[] = [];
    let curr: PathNode | null = node;
    while (curr) {
      path.unshift({ x: curr.x, y: curr.y, z: curr.z });
      curr = curr.parent;
    }
    return path;
  }

  protected key(p: Position3D, t: number): number {
    // key for the visited set
    // Bit manipulation to create a unique key for each state (position + time)
    // p.x: bits 0-5 (0-63)
    // p.y: bits 6-11 (0-63)
    // p.z: bits 12-17 (0-63)
    // t:   bits 18-31 (0-16383)
    // this is used for ensuring that we don't visit the same state twice
    return (p.x) | (p.y << 6) | (p.z << 12) | (t << 18);
  }

  protected findPath(
    // A* algorithm to find the shortest path between two points
    start: Position3D,
    goal: Position3D,
    startTime: number,
    world: World,
    reserved: Set<number>,
    maxEnergy?: number,
    deadline?: number,
    maxAltitude?: number,
    maxSearchDepth?: number
  ): { path: Position3D[], finalEnergy: number } | null {

    // Resolve blocked goal to the nearest free neighbor so A* can actually reach it
    const effectiveGoal = this.nearestFreeNeighbor(goal, world);

    const startNode: PathNode = {
      ...start, g: 0, h: this.heuristic(start, effectiveGoal), f: 0, parent: null, time: startTime, energy: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openList: PathNode[] = [startNode];
    const closedSet = new Set<number>();
    let nodesExpanded = 0;

    while (openList.length > 0) {
      if ((nodesExpanded & 63) === 0) {
        if (deadline && performance.now() > deadline) throw new Error("Pathfinding Timeout");
      }
      nodesExpanded++;

      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;

      if (current.x === effectiveGoal.x && current.y === effectiveGoal.y && current.z === effectiveGoal.z) {
        return { path: this.reconstructPath(current), finalEnergy: current.energy };
      }


      if (current.time >= this.maxTimeSteps) continue;
      if (maxSearchDepth !== undefined && (current.time - startTime) >= maxSearchDepth) continue;
      if (maxEnergy !== undefined && current.energy > maxEnergy) continue;

      const closedKey = this.key(current, current.time);
      if (closedSet.has(closedKey)) continue;
      closedSet.add(closedKey);

      for (const dir of DIRECTIONS) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nz = current.z + dir.z;

        if (world.isBlocked(nx, ny, nz)) continue;
        if (maxAltitude !== undefined && ny > maxAltitude) continue;

        const nextTime = current.time + 1;
        const nextPos: Position3D = { x: nx, y: ny, z: nz };

        if (reserved.size > 0 && reserved.has(this.key(nextPos, nextTime))) continue;

        const stepCost = (nx === current.x && ny === current.y && nz === current.z) ? MATH_CONSTANTS.BETA_HOVER : MATH_CONSTANTS.BETA_FLY;
        const energy = current.energy + stepCost;

        if (maxEnergy !== undefined && energy > maxEnergy) continue;

        const g = current.g + 1;
        const h = this.heuristic(nextPos, effectiveGoal);
        const f = g + h;

        const neighborNode: PathNode = {
          x: nx, y: ny, z: nz, g, h, f, parent: current, time: nextTime, energy
        };

        const existingIdx = openList.findIndex(n =>
          n.x === nx && n.y === ny && n.z === nz && n.time === nextTime
        );

        if (existingIdx !== -1) {
          if (openList[existingIdx].g > g) openList[existingIdx] = neighborNode;
        } else {
          openList.push(neighborNode);
        }
      }
    }
    return null;
  }
}

export class NaivePlanner extends PathFindingStrategy {
  name = "Naive (Unsafe)";
  description = "Agents plan selfishly. Collisions result in destruction.";
  isSafe = false;

  planLeg(swarm: Swarm, world: World, globalStartTime: number, reservedSpaceTime: Set<number>, maxAltitude: number, batteryEnabled: boolean) {
    const deadline = performance.now() + TIMEOUT_MS;
    const maxLegDepth = world.size * 4;
    // Naive ignores other agents, so it passes an empty set to findPath
    const naiveSet = new Set<number>();

    for (const drone of swarm.drones) {
      const target = drone.mission.getNextTarget();
      if (!target || drone.status === 'STRANDED') continue;

      const startPos = drone.path[drone.path.length - 1] || drone.start;
      const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;

      // Simple battery estimation (assuming previous usage)
      // Note: Exact battery tracking is handled in Drone.ts during render, here we just need rough "can I make it?"
      const availableEnergy = batteryEnabled ? drone.maxBattery : undefined;

      const result = this.findPath(startPos, target, startTime, world, naiveSet, availableEnergy, deadline, maxAltitude, maxLegDepth);

      if (result) {
        drone.appendPath(result.path, drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR');
      } else {
        // Keep trying or fail? For naive, we just fail/block
        drone.status = 'STRANDED';
      }
    }
  }
}

export class CooperativePlanner extends PathFindingStrategy {
  name = "Cooperative A*";
  description = "Prioritized planning. Agents avoid each other's future paths.";
  isSafe = true;

  planLeg(swarm: Swarm, world: World, globalStartTime: number, reservedSpaceTime: Set<number>, maxAltitude: number, batteryEnabled: boolean) {
    const deadline = performance.now() + TIMEOUT_MS;
    const maxLegDepth = world.size * 4;

    for (const drone of swarm.drones) {
      const target = drone.mission.getNextTarget();

      // Skip if no target or dead
      if (!target || drone.status === 'STRANDED') {
        // Even if not moving, we should reserve current spot? 
        // For simplicity in this loop, static agents are treated as obstacles by world.isBlocked check if they are obstacles,
        // but for dynamic agents sitting idle, we rely on reservedSpaceTime if we added them.
        // Here we assume if they are done, they are out of the way or handled next tick.
        continue;
      }

      const startPos = drone.path[drone.path.length - 1] || drone.start;
      const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;

      const availableEnergy = batteryEnabled ? drone.maxBattery : undefined;

      const result = this.findPath(startPos, target, startTime, world, reservedSpaceTime, availableEnergy, deadline, maxAltitude, maxLegDepth);

      if (result) {
        drone.appendPath(result.path, drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR');

        // Reserve the new path segment
        result.path.forEach((p, idx) => {
          reservedSpaceTime.add(this.key(p, startTime + idx));
        });

        // Reserve the goal for a bit to prevent rear-ending
        const lastPos = result.path[result.path.length - 1];
        const arrivalTime = startTime + result.path.length - 1;
        for (let w = 1; w < 5; w++) {
          reservedSpaceTime.add(this.key(lastPos, arrivalTime + w));
        }

      } else {
        drone.status = 'STRANDED';
        // Reserve where it stands so others don't run into it
        reservedSpaceTime.add(this.key(startPos, startTime + 1));
      }
    }
  }
}

export class EnergySaverPlanner extends PathFindingStrategy {
  name = "Energy Saver";
  description = "Prioritizes battery conservation. Waiting is cheaper than moving.";
  isSafe = true;

  // Helper overridden for energy cost
  protected findPathEnergy(
    start: Position3D,
    goal: Position3D,
    startTime: number,
    world: World,
    reserved: Set<number>,
    maxEnergy: number | undefined,
    deadline: number,
    maxAltitude?: number,
    maxSearchDepth?: number
  ): { path: Position3D[], finalEnergy: number } | null {

    const startNode: PathNode = {
      ...start, g: 0, h: this.heuristic(start, goal) * MATH_CONSTANTS.BETA_FLY, f: 0, parent: null, time: startTime, energy: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openList: PathNode[] = [startNode];
    const closedSet = new Set<number>();
    let nodesExpanded = 0;

    while (openList.length > 0) {
      if ((nodesExpanded & 63) === 0) {
        if (performance.now() > deadline) throw new Error("Pathfinding Timeout");
      }
      nodesExpanded++;

      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;

      if (current.x === goal.x && current.y === goal.y && current.z === goal.z) {
        return { path: this.reconstructPath(current), finalEnergy: current.energy };
      }

      if (current.time >= this.maxTimeSteps) continue;
      if (maxSearchDepth !== undefined && (current.time - startTime) >= maxSearchDepth) continue;

      const closedKey = this.key(current, current.time);
      if (closedSet.has(closedKey)) continue;
      closedSet.add(closedKey);

      for (const dir of DIRECTIONS) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nz = current.z + dir.z;

        if (world.isBlocked(nx, ny, nz)) continue;
        if (maxAltitude !== undefined && ny > maxAltitude) continue;

        const nextTime = current.time + 1;
        const nextPos = { x: nx, y: ny, z: nz };

        if (reserved.size > 0 && reserved.has(this.key(nextPos, nextTime))) continue;

        const stepCost = (nx === current.x && ny === current.y && nz === current.z) ? MATH_CONSTANTS.BETA_HOVER : MATH_CONSTANTS.BETA_FLY;
        const newEnergy = current.energy + stepCost;
        if (maxEnergy !== undefined && newEnergy > maxEnergy) continue;

        const g = current.g + stepCost;
        const h = this.heuristic(nextPos, goal) * MATH_CONSTANTS.BETA_FLY;
        const f = g + h;

        const neighborNode: PathNode = {
          x: nx, y: ny, z: nz, g, h, f, parent: current, time: nextTime, energy: newEnergy
        };

        const existingIdx = openList.findIndex(n =>
          n.x === nx && n.y === ny && n.z === nz && n.time === nextTime
        );

        if (existingIdx !== -1) {
          if (openList[existingIdx].g > g) openList[existingIdx] = neighborNode;
        } else {
          openList.push(neighborNode);
        }
      }
    }
    return null;
  }

  planLeg(swarm: Swarm, world: World, globalStartTime: number, reservedSpaceTime: Set<number>, maxAltitude: number, batteryEnabled: boolean) {
    const deadline = performance.now() + TIMEOUT_MS;
    const maxLegDepth = world.size * 4;

    for (const drone of swarm.drones) {
      const target = drone.mission.getNextTarget();
      if (!target || drone.status === 'STRANDED') continue;

      const startPos = drone.path[drone.path.length - 1] || drone.start;
      const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;
      const availableEnergy = batteryEnabled ? drone.maxBattery : undefined;

      const result = this.findPathEnergy(startPos, target, startTime, world, reservedSpaceTime, availableEnergy, deadline, maxAltitude, maxLegDepth);

      if (result) {
        drone.appendPath(result.path, drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR');
        result.path.forEach((p, idx) => {
          reservedSpaceTime.add(this.key(p, startTime + idx));
        });
        const lastPos = result.path[result.path.length - 1];
        const arrivalTime = startTime + result.path.length - 1;
        for (let w = 1; w < 5; w++) {
          reservedSpaceTime.add(this.key(lastPos, arrivalTime + w));
        }
      } else {
        drone.status = 'STRANDED';
      }
    }
  }
}

export class CollisionAnalyzer {
  static detect(
    swarm: Swarm,
    forklifts: { id: string; name: string; path: import('../types').Position3D[] }[] = [],
    warehouse: import('./Warehouse').Warehouse | null = null
  ): SimulationIncident[] {
    const incidents: SimulationIncident[] = [];
    const timeLocationMap = new Map<string, string[]>();

    const isInsideBase = (pos: import('../types').Position3D) => {
      if (!warehouse) return false;
      const b = warehouse.getBounds();
      return pos.x >= b.minX && pos.x <= b.maxX &&
        pos.y >= b.minY && pos.y <= b.maxY &&
        pos.z >= b.minZ && pos.z <= b.maxZ;
    };

    const maxTicks = Math.max(...swarm.drones.map(d => d.path.length), 0) + 10;

    // --- Drone vs Drone ---
    for (const drone of swarm.drones) {
      // Drones physically exist in the simulation indefinitely at their last point.
      for (let t = 0; t < maxTicks; t++) {
        if (drone.status === 'STRANDED' && drone.destructionTime !== undefined && t > drone.destructionTime) continue;

        const pos = drone.path[Math.min(t, drone.path.length - 1)] || drone.start;
        if (isInsideBase(pos)) continue; // Ignore all drone-vs-drone collisions inside base

        const key = `${t},${pos.x},${pos.y},${pos.z}`;

        if (!timeLocationMap.has(key)) timeLocationMap.set(key, []);
        timeLocationMap.get(key)!.push(drone.id);
      }
    }

    timeLocationMap.forEach((agentIds, key) => {
      if (agentIds.length > 1) {
        const [tStr, xStr, yStr, zStr] = key.split(',');
        const time = parseInt(tStr);
        const agentNames = agentIds.map(id => {
          const d = swarm.drones.find(a => a.id === id);
          return d ? d.name : id;
        });
        incidents.push({
          id: `col-${time}-${xStr}-${yStr}-${zStr}`,
          type: 'collision',
          time,
          position: { x: parseInt(xStr), y: parseInt(yStr), z: parseInt(zStr) },
          agentIds,
          agentNames
        });
      }
    });

    // --- Drone vs Forklift ---
    if (forklifts.length > 0) {
      for (const drone of swarm.drones) {
        for (let t = 0; t < maxTicks; t++) {
          if (drone.status === 'STRANDED' && drone.destructionTime !== undefined && t > drone.destructionTime) continue;

          const dronePos = drone.path[Math.min(t, drone.path.length - 1)] || drone.start;
          if (isInsideBase(dronePos)) continue; // Ignore all physical drone-vs-forklift collisions near the base

          for (const fl of forklifts) {
            if (!fl.path.length) continue;

            const flIdx = t % fl.path.length;
            const flPos = fl.path[flIdx];

            // 1. Direct occupation hit (drone sits inside forklift cage)
            const hits = (
              dronePos.x === flPos.x && dronePos.z === flPos.z &&
              (dronePos.y === flPos.y || dronePos.y === flPos.y + 1)
            );

            // 2. Head-on phase-through swapping (agent and forklift cross paths identically between ticks)
            let swapped = false;
            if (t > 0) {
              const prevDronePos = drone.path[Math.min(t - 1, drone.path.length - 1)] || drone.start;
              const prevFlPos = fl.path[(t - 1) % fl.path.length];
              swapped = (
                prevDronePos.x === flPos.x && prevDronePos.z === flPos.z &&
                dronePos.x === prevFlPos.x && dronePos.z === prevFlPos.z &&
                (prevDronePos.y === flPos.y || prevDronePos.y === flPos.y + 1)
              );
            }

            if (hits || swapped) {
              incidents.push({
                id: `fl-col-${t}-${drone.id}-${fl.id}`,
                type: 'collision',
                time: t,
                position: dronePos,
                agentIds: [drone.id, fl.id],
                agentNames: [drone.name, fl.name]
              });
            }
          }
        }
      }
    }

    // De-duplicate by id
    const seen = new Set<string>();
    return incidents.filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  }
}
