
import { Position3D, PathNode, CollisionEvent, ENERGY_COSTS } from '../types';
import { World } from './World';
import { Swarm } from './Drone';

const TIMEOUT_MS = 30000;
const INSTANT_REFUEL_TICKS = 10; // Time spent at base in Infinite Mode to pick up new package & "refuel"

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

  abstract plan(swarm: Swarm, world: World, isRoundTrip?: boolean, missionQueues?: Map<string, Position3D[]>, maxAltitude?: number, batteryEnabled?: boolean): void;

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
    maxAltitude?: number
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
      
      // Energy check: If maxEnergy is provided (battery enabled), prune if exceeded
      if (maxEnergy !== undefined && current.energy > maxEnergy) continue;

      const closedKey = this.key(current, current.time);
      if (closedSet.has(closedKey)) continue;
      closedSet.add(closedKey);

      for (const dir of DIRECTIONS) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nz = current.z + dir.z;

        // Check World bounds and obstacles
        if (world.isBlocked(nx, ny, nz)) continue;
        
        // Check Altitude constraint
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

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false, missionQueues?: Map<string, Position3D[]>, maxAltitude?: number, batteryEnabled: boolean = true) {
    const emptySet = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of swarm.drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const missions = missionQueues?.get(drone.id) || [drone.goal];
      let currentStart = drone.start;
      let currentTime = 0;
      let fullPath: Position3D[] = [];
      const deliveryTicks: number[] = [];
      // If battery disabled, pass undefined to findPath so it ignores energy limits
      const maxEnergy = batteryEnabled ? drone.maxBattery : undefined; 

      for (let i = 0; i < missions.length; i++) {
          const missionGoal = missions[i];
          
          // 1. Outbound
          const resultOut = this.findPath(currentStart, missionGoal, currentTime, world, emptySet, maxEnergy, deadline, maxAltitude);
          if (!resultOut) {
              drone.status = 'out_of_battery';
              break;
          }
          
          const pathOut = resultOut.path;
          
          // Append PathOut
          if (fullPath.length > 0) fullPath.push(...pathOut.slice(1));
          else fullPath = pathOut;

          currentTime = fullPath.length - 1;
          deliveryTicks.push(currentTime);
          currentStart = missionGoal;

          // 2. Inbound (if round trip or infinite)
          if (isRoundTrip || missionQueues) {
              // Calculate remaining energy for return trip? 
              // In Naive simple implementation we treat battery as per-trip or total? 
              // Let's assume naive planner just tries to get back.
              
              const resultBack = this.findPath(currentStart, drone.start, currentTime, world, emptySet, maxEnergy, deadline, maxAltitude);
              if (!resultBack) {
                  drone.status = 'out_of_battery';
                  break;
              }
              
              const pathBack = resultBack.path;
              fullPath.push(...pathBack.slice(1));
              currentTime = fullPath.length - 1;
              currentStart = drone.start; // Back at base

              // Wait at base for "refuel" and "loading" if there are more missions
              if (i < missions.length - 1) {
                 for(let w=0; w<INSTANT_REFUEL_TICKS; w++) {
                     fullPath.push({...currentStart});
                     currentTime++;
                 }
                 // Note: The next findPath call starts with energy=0, simulating a full recharge
              }
          }
      }

      drone.setPath(fullPath.length > 0 ? fullPath : [drone.start], deliveryTicks);
      if (fullPath.length > 0 && drone.status !== 'out_of_battery') drone.status = 'finished';
    }
  }
}

export class CooperativePlanner extends PathFindingStrategy {
  name = "Cooperative A*";
  description = "Prioritized planning. Agents avoid each other's future paths.";
  isSafe = true;

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false, missionQueues?: Map<string, Position3D[]>, maxAltitude?: number, batteryEnabled: boolean = true) {
    const reservedSpaceTime = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of swarm.drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const missions = missionQueues?.get(drone.id) || [drone.goal];
      let currentStart = drone.start;
      let currentTime = 0;
      let fullPath: Position3D[] = [];
      const deliveryTicks: number[] = [];
      let isDead = false;
      const maxEnergy = batteryEnabled ? drone.maxBattery : undefined;

      for (let i = 0; i < missions.length; i++) {
          const missionGoal = missions[i];

          // --- LEG 1: Base -> Goal ---
          // Note: findPath initializes node energy to 0. This effectively simulates a full battery/reset 
          // if we are coming from a previous iteration where we returned to base.
          // Ideally, for non-base-return multi-stops, we should pass current energy, but our logic returns to base.
          
          const resultOut = this.findPath(currentStart, missionGoal, currentTime, world, reservedSpaceTime, maxEnergy, deadline, maxAltitude);
          
          if (!resultOut) {
               isDead = true;
               break;
          }
          const pathOut = resultOut.path;

          if (fullPath.length > 0) fullPath.push(...pathOut.slice(1));
          else fullPath = pathOut;
          
          currentTime = fullPath.length - 1;
          deliveryTicks.push(currentTime);
          currentStart = missionGoal;

          // Register reservations for Leg 1
          pathOut.forEach((p, idx) => reservedSpaceTime.add(this.key(p, pathOut[0] === fullPath[0] ? idx : (currentTime - pathOut.length + 1 + idx))));

          // --- LEG 2: Goal -> Base ---
          if (isRoundTrip || missionQueues) {
              // For round trip, we should consider the energy consumed in Leg 1 IF we are not recharging at goal.
              // But in our logic, we check energy per-leg vs maxBattery. 
              // If strictly enforcing battery for roundtrip without recharge at goal, maxEnergy should be (maxBattery - Leg1Cost).
              // However, to keep it simple and playable, we assume "maxEnergy" constraint applies per leg search or allow recharge at goal?
              // No, let's assume per-leg check ensures the leg is possible, but doesn't guarantee total trip.
              // To do it right:
              const energyLeft = maxEnergy !== undefined ? (maxEnergy - resultOut.finalEnergy) : undefined;
              
              const resultBack = this.findPath(currentStart, drone.start, currentTime, world, reservedSpaceTime, energyLeft, deadline, maxAltitude);
              
              if (!resultBack) {
                  isDead = true;
                  break;
              }
              const pathBack = resultBack.path;

              fullPath.push(...pathBack.slice(1));
              
              pathBack.forEach((p, idx) => reservedSpaceTime.add(this.key(p, currentTime + idx)));

              currentTime = fullPath.length - 1;
              currentStart = drone.start;

              // If continuing, wait at base and Refuel 
              if (i < missions.length - 1) {
                  for(let w=0; w<INSTANT_REFUEL_TICKS; w++) {
                      fullPath.push({...currentStart});
                      currentTime++;
                      reservedSpaceTime.add(this.key(currentStart, currentTime));
                  }
              }
          }
      }

      if (fullPath.length === 0 || isDead) {
        drone.setPath(fullPath.length > 0 ? fullPath : [drone.start]);
        drone.status = 'out_of_battery';
      } else {
        drone.setPath(fullPath, deliveryTicks);
        drone.status = 'finished';
        
        // Reserve end spot
        const lastPos = fullPath[fullPath.length - 1];
        const arrivalTime = fullPath.length - 1;
        for (let t = 1; t < 20; t++) reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
      }
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
    maxEnergy: number | undefined,
    deadline: number,
    maxAltitude?: number
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

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false, missionQueues?: Map<string, Position3D[]>, maxAltitude?: number, batteryEnabled: boolean = true) {
    const reservedSpaceTime = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of swarm.drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const missions = missionQueues?.get(drone.id) || [drone.goal];
      let currentStart = drone.start;
      let currentTime = 0;
      let fullPath: Position3D[] = [];
      const deliveryTicks: number[] = [];
      let isDead = false;
      const maxEnergy = batteryEnabled ? drone.maxBattery : undefined;

      for (let i = 0; i < missions.length; i++) {
          const missionGoal = missions[i];

          // --- LEG 1 ---
          const resultOut = this.findPathEnergyOptimized(currentStart, missionGoal, currentTime, world, reservedSpaceTime, maxEnergy, deadline, maxAltitude);
          if (!resultOut) { isDead = true; break; }
          const pathOut = resultOut.path;

          if (fullPath.length > 0) fullPath.push(...pathOut.slice(1));
          else fullPath = pathOut;

          currentTime = fullPath.length - 1;
          deliveryTicks.push(currentTime);
          currentStart = missionGoal;

          // Reserve Leg 1
          pathOut.forEach((p, idx) => reservedSpaceTime.add(this.key(p, pathOut[0] === fullPath[0] ? idx : (currentTime - pathOut.length + 1 + idx))));

          // --- LEG 2 ---
          if (isRoundTrip || missionQueues) {
              const energyLeft = maxEnergy !== undefined ? (maxEnergy - resultOut.finalEnergy) : undefined;
              const resultBack = this.findPathEnergyOptimized(currentStart, drone.start, currentTime, world, reservedSpaceTime, energyLeft, deadline, maxAltitude);
              if (!resultBack) { isDead = true; break; }
              const pathBack = resultBack.path;

              fullPath.push(...pathBack.slice(1));
              
              pathBack.forEach((p, idx) => reservedSpaceTime.add(this.key(p, currentTime + idx)));

              currentTime = fullPath.length - 1;
              currentStart = drone.start;

               // If continuing, wait and Refuel
              if (i < missions.length - 1) {
                  for(let w=0; w<INSTANT_REFUEL_TICKS; w++) {
                      fullPath.push({...currentStart});
                      currentTime++;
                      reservedSpaceTime.add(this.key(currentStart, currentTime));
                  }
              }
          }
      }

      if (fullPath.length === 0 || isDead) {
        drone.setPath(fullPath.length > 0 ? fullPath : [drone.start]);
        drone.status = 'out_of_battery';
      } else {
        drone.setPath(fullPath, deliveryTicks);
        drone.status = 'finished';
        
        const lastPos = fullPath[fullPath.length - 1];
        const arrivalTime = fullPath.length - 1;
        for (let t = 1; t < 20; t++) reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
      }
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
        // Map IDs to Names for logging
        const agentNames = agentIds.map(id => {
            const d = swarm.drones.find(a => a.id === id);
            return d ? d.name : id;
        });

        collisions.push({
          time: parseInt(tStr),
          position: { x: parseInt(xStr), y: parseInt(yStr), z: parseInt(zStr) },
          agentIds,
          agentNames
        });
      }
    });
    return collisions;
  }
}
