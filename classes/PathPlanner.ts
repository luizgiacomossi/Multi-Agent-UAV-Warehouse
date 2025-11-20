import { Position3D, PathNode, CollisionEvent, ENERGY_COSTS } from '../types';
import { World } from './World';
import { Swarm } from './Drone';

const TIMEOUT_MS = 30000;
const RECHARGE_TICKS = 20;

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

  abstract plan(swarm: Swarm, world: World, isRoundTrip?: boolean): void;

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
    deadline?: number
  ): Position3D[] | null {
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
        return this.reconstructPath(current);
      }

      if (current.time >= this.maxTimeSteps) continue;
      if (maxEnergy !== undefined && current.energy > maxEnergy) continue;

      const closedKey = this.key(current, current.time);
      if (closedSet.has(closedKey)) continue;
      closedSet.add(closedKey);

      for (const dir of DIRECTIONS) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nz = current.z + dir.z;

        if (world.isBlocked(nx, ny, nz)) continue;

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

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false) {
    const emptySet = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of swarm.drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const path1 = this.findPath(drone.start, drone.goal, 0, world, emptySet, drone.maxBattery, deadline);

      if (path1) {
        let fullPath = path1;
        let deliveryTick = path1.length - 1;

        if (isRoundTrip) {
            const leg1Time = path1.length - 1;
            const path2 = this.findPath(drone.goal, drone.start, leg1Time, world, emptySet, drone.maxBattery, deadline);
            if (path2) fullPath = [...path1, ...path2.slice(1)];
            deliveryTick = leg1Time;
        }
        
        drone.setPath(fullPath, deliveryTick);
        drone.status = 'finished';
      } else {
        drone.setPath([drone.start]);
        drone.status = 'out_of_battery';
      }
    }
  }
}

export class CooperativePlanner extends PathFindingStrategy {
  name = "Cooperative A*";
  description = "Prioritized planning. Agents avoid each other's future paths.";
  isSafe = true;

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false) {
    const reservedSpaceTime = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of swarm.drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      // 1. Try direct Path
      let path1 = this.findPath(drone.start, drone.goal, 0, world, reservedSpaceTime, drone.maxBattery, deadline);
      
      // 2. If out of battery, try via Station
      if (!path1 && world.chargeStations.length > 0) {
          const sortedStations = [...world.chargeStations].sort((a, b) => 
             this.heuristic(drone.start, a) - this.heuristic(drone.start, b)
          );

          for (const station of sortedStations) {
              const toStation = this.findPath(drone.start, station, 0, world, reservedSpaceTime, drone.maxBattery, deadline);
              if (!toStation) continue;

              const arrivalTime = toStation.length - 1;
              const departureTime = arrivalTime + RECHARGE_TICKS;

              // Check availability of station
              let stationBlocked = false;
              for(let t = arrivalTime; t < departureTime; t++) {
                  if (reservedSpaceTime.has(this.key(station, t))) {
                      stationBlocked = true;
                      break;
                  }
              }
              if (stationBlocked) continue;

              // Plan from Station to Goal
              const fromStation = this.findPath(station, drone.goal, departureTime, world, reservedSpaceTime, drone.maxBattery, deadline);
              
              if (fromStation) {
                  const waitFrames: Position3D[] = [];
                  for(let i=0; i<RECHARGE_TICKS; i++) waitFrames.push({ ...station });
                  path1 = [...toStation, ...waitFrames, ...fromStation.slice(1)];
                  break;
              }
          }
      }

      if (!path1) {
        drone.setPath([drone.start]);
        drone.status = 'out_of_battery';
        continue;
      }

      let fullPath = path1;
      let deliveryTick = path1.length - 1;

      if (isRoundTrip) {
          const leg1Time = fullPath.length - 1;
          const path2 = this.findPath(drone.goal, drone.start, leg1Time, world, reservedSpaceTime, drone.maxBattery, deadline);
          
          if (path2) fullPath = [...fullPath, ...path2.slice(1)];
          deliveryTick = leg1Time;
      }

      drone.setPath(fullPath, deliveryTick);
      drone.status = 'finished';

      fullPath.forEach((pos, t) => reservedSpaceTime.add(this.key(pos, t)));
      
      const lastPos = fullPath[fullPath.length - 1];
      const arrivalTime = fullPath.length - 1;
      for (let t = 1; t < 20; t++) reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
    }
  }
}

export class EnergySaverPlanner extends PathFindingStrategy {
  name = "Energy Saver";
  description = "Prioritizes battery conservation. Waiting is cheaper than moving.";
  isSafe = true;

  protected findPathEnergyOptimized(
    start: Position3D,
    goal: Position3D,
    startTime: number,
    world: World,
    reserved: Set<number>,
    maxEnergy: number,
    deadline: number
  ): Position3D[] | null {
    
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
        return this.reconstructPath(current);
      }

      if (current.time >= this.maxTimeSteps) continue;

      const closedKey = this.key(current, current.time);
      if (closedSet.has(closedKey)) continue;
      closedSet.add(closedKey);

      for (const dir of DIRECTIONS) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nz = current.z + dir.z;

        if (world.isBlocked(nx, ny, nz)) continue;

        const nextTime = current.time + 1;
        const nextPos = { x: nx, y: ny, z: nz };

        if (reserved.size > 0 && reserved.has(this.key(nextPos, nextTime))) continue;

        const stepCost = (nx === current.x && ny === current.y && nz === current.z) ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;

        const newEnergy = current.energy + stepCost;
        if (newEnergy > maxEnergy) continue;

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

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false) {
    const reservedSpaceTime = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of swarm.drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      let path1 = this.findPathEnergyOptimized(drone.start, drone.goal, 0, world, reservedSpaceTime, drone.maxBattery, deadline);

      if (!path1 && world.chargeStations.length > 0) {
          const sortedStations = [...world.chargeStations].sort((a, b) => 
             this.heuristic(drone.start, a) - this.heuristic(drone.start, b)
          );

          for (const station of sortedStations) {
              const toStation = this.findPathEnergyOptimized(drone.start, station, 0, world, reservedSpaceTime, drone.maxBattery, deadline);
              if (!toStation) continue;

              const arrivalTime = toStation.length - 1;
              const departureTime = arrivalTime + RECHARGE_TICKS;

              let stationBlocked = false;
              for(let t = arrivalTime; t < departureTime; t++) {
                  if (reservedSpaceTime.has(this.key(station, t))) {
                      stationBlocked = true;
                      break;
                  }
              }
              if (stationBlocked) continue;

              const fromStation = this.findPathEnergyOptimized(station, drone.goal, departureTime, world, reservedSpaceTime, drone.maxBattery, deadline);
              
              if (fromStation) {
                  const waitFrames: Position3D[] = [];
                  for(let i=0; i<RECHARGE_TICKS; i++) waitFrames.push({ ...station });
                  path1 = [...toStation, ...waitFrames, ...fromStation.slice(1)];
                  break;
              }
          }
      }

      if (!path1) {
        drone.setPath([drone.start]);
        drone.status = 'out_of_battery';
        continue;
      }

      let fullPath = path1;
      let deliveryTick = path1.length - 1;

      if (isRoundTrip) {
          const leg1Time = fullPath.length - 1;
          const path2 = this.findPathEnergyOptimized(drone.goal, drone.start, leg1Time, world, reservedSpaceTime, drone.maxBattery, deadline);
          
          if (path2) fullPath = [...fullPath, ...path2.slice(1)];
          deliveryTick = leg1Time;
      }

      drone.setPath(fullPath, deliveryTick);
      drone.status = 'finished';

      fullPath.forEach((pos, t) => reservedSpaceTime.add(this.key(pos, t)));
      const lastPos = fullPath[fullPath.length - 1];
      const arrivalTime = fullPath.length - 1;
      for (let t = 1; t < 20; t++) reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
    }
  }
}

export class CollisionAnalyzer {
  static detect(swarm: Swarm): CollisionEvent[] {
    const collisions: CollisionEvent[] = [];
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
        collisions.push({
          time: parseInt(tStr),
          position: { x: parseInt(xStr), y: parseInt(yStr), z: parseInt(zStr) },
          agentIds
        });
      }
    });
    return collisions;
  }
}