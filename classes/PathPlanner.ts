
import { Position3D, PathNode, SimulationIncident, ENERGY_COSTS } from '../types';
import { World } from './World';
import { Swarm } from './Drone';

const TIMEOUT_MS = 10000; 

const DIRECTIONS = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 0 }, 
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
  abstract planLeg(
      swarm: Swarm, 
      world: World, 
      globalStartTime: number,
      reservedSpaceTime: Set<number>,
      maxAltitude?: number, 
      batteryEnabled?: boolean
  ): void;

  protected heuristic(a: Position3D, b: Position3D): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
  }

  protected reconstructPath(node: PathNode): Position3D[] {
    const path: Position3D[] = [];
    let curr: PathNode | null = node;
    while (curr) {
      path.unshift({ x: curr.x, y: curr.y, z: curr.z });
      curr = curr.parent;
    }
    return path;
  }

  protected key(p: Position3D, t: number): number {
    return (p.x) | (p.y << 6) | (p.z << 12) | (t << 18);
  }

  protected findPath(
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
    
    const startNode: PathNode = {
      ...start, g: 0, h: this.heuristic(start, goal), f: 0, parent: null, time: startTime, energy: 0
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

      if (current.x === goal.x && current.y === goal.y && current.z === goal.z) {
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

        const stepCost = (nx === current.x && ny === current.y && nz === current.z) ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;
        const energy = current.energy + stepCost;
        
        if (maxEnergy !== undefined && energy > maxEnergy) continue;

        const g = current.g + 1;
        const h = this.heuristic(nextPos, goal);
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
        if (!target || drone.status === 'out_of_battery' || drone.status === 'blocked' || drone.status === 'destroyed') continue;

        const startPos = drone.path[drone.path.length - 1] || drone.start;
        const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;
        
        // Simple battery estimation (assuming previous usage)
        // Note: Exact battery tracking is handled in Drone.ts during render, here we just need rough "can I make it?"
        const availableEnergy = batteryEnabled ? drone.maxBattery : undefined; 

        const result = this.findPath(startPos, target, startTime, world, naiveSet, availableEnergy, deadline, maxAltitude, maxLegDepth);

        if (result) {
            drone.appendPath(result.path, drone.mission.state === 'OUTBOUND');
        } else {
            // Keep trying or fail? For naive, we just fail/block
            drone.status = 'blocked';
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
        if (!target || drone.status === 'out_of_battery' || drone.status === 'blocked' || drone.status === 'destroyed') {
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
            drone.appendPath(result.path, drone.mission.state === 'OUTBOUND');
            
            // Reserve the new path segment
            result.path.forEach((p, idx) => {
                 reservedSpaceTime.add(this.key(p, startTime + idx));
            });
            
            // Reserve the goal for a bit to prevent rear-ending
            const lastPos = result.path[result.path.length - 1];
            const arrivalTime = startTime + result.path.length - 1;
            for(let w=1; w<5; w++) {
                reservedSpaceTime.add(this.key(lastPos, arrivalTime + w));
            }

        } else {
            drone.status = 'blocked';
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
      ...start, g: 0, h: this.heuristic(start, goal) * ENERGY_COSTS.MOVE, f: 0, parent: null, time: startTime, energy: 0
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

        const stepCost = (nx === current.x && ny === current.y && nz === current.z) ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;
        const newEnergy = current.energy + stepCost;
        if (maxEnergy !== undefined && newEnergy > maxEnergy) continue;

        const g = current.g + stepCost; 
        const h = this.heuristic(nextPos, goal) * ENERGY_COSTS.MOVE;
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
        if (!target || drone.status === 'out_of_battery' || drone.status === 'blocked' || drone.status === 'destroyed') continue;

        const startPos = drone.path[drone.path.length - 1] || drone.start;
        const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;
        const availableEnergy = batteryEnabled ? drone.maxBattery : undefined; 

        const result = this.findPathEnergy(startPos, target, startTime, world, reservedSpaceTime, availableEnergy, deadline, maxAltitude, maxLegDepth);

        if (result) {
            drone.appendPath(result.path, drone.mission.state === 'OUTBOUND');
            result.path.forEach((p, idx) => {
                 reservedSpaceTime.add(this.key(p, startTime + idx));
            });
            const lastPos = result.path[result.path.length - 1];
            const arrivalTime = startTime + result.path.length - 1;
            for(let w=1; w<5; w++) {
                reservedSpaceTime.add(this.key(lastPos, arrivalTime + w));
            }
        } else {
            drone.status = 'blocked';
        }
    }
  }
}

export class CollisionAnalyzer {
  static detect(swarm: Swarm): SimulationIncident[] {
    const incidents: SimulationIncident[] = [];
    const timeLocationMap = new Map<string, string[]>(); 

    for (const drone of swarm.drones) {
      drone.path.forEach((pos, t) => {
        const key = `${t},${pos.x},${pos.y},${pos.z}`;
        if (!timeLocationMap.has(key)) timeLocationMap.set(key, []);
        timeLocationMap.get(key)!.push(drone.id);
      });
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
    return incidents;
  }
}
