
import { Position3D, PathNode, Agent, CollisionEvent, ENERGY_COSTS } from '../types';
import { World } from './World';
import { Swarm, Drone } from './Drone';

const TIMEOUT_MS = 4000;

/**
 * Abstract Base Strategy for Path Planning.
 */
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

  protected getNeighbors(node: PathNode, world: World): Position3D[] {
    const candidates = [
      { x: node.x + 1, y: node.y, z: node.z },
      { x: node.x - 1, y: node.y, z: node.z },
      { x: node.x, y: node.y + 1, z: node.z },
      { x: node.x, y: node.y - 1, z: node.z },
      { x: node.x, y: node.y, z: node.z + 1 },
      { x: node.x, y: node.y, z: node.z - 1 },
      { x: node.x, y: node.y, z: node.z }, // Wait
    ];

    return candidates.filter(p =>
      p.x >= 0 && p.x < world.size &&
      p.y >= 0 && p.y < world.size &&
      p.z >= 0 && p.z < world.size
    );
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
      ...start,
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
      parent: null,
      time: startTime,
      energy: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openList: PathNode[] = [startNode];
    const closedSet = new Set<number>();

    while (openList.length > 0) {
      if (deadline && performance.now() > deadline) {
        throw new Error("Pathfinding Timeout");
      }

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

      const neighbors = this.getNeighbors(current, world);

      for (const nextPos of neighbors) {
        const nextTime = current.time + 1;

        if (world.isPositionBlocked(nextPos)) continue;
        if (reserved.size > 0 && reserved.has(this.key(nextPos, nextTime))) continue;

        // Determine move type cost
        const isWait = nextPos.x === current.x && nextPos.y === current.y && nextPos.z === current.z;
        const stepCost = isWait ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;
        
        const g = current.g + 1; 
        const energy = current.energy + stepCost;
        
        // If hard battery limit, skip node early
        if (maxEnergy !== undefined && energy > maxEnergy) continue;

        const h = this.heuristic(nextPos, goal);
        const f = g + h;

        const neighborNode: PathNode = {
          ...nextPos,
          g, h, f,
          parent: current,
          time: nextTime,
          energy
        };

        const existingIdx = openList.findIndex(n =>
          n.x === neighborNode.x && n.y === neighborNode.y && n.z === neighborNode.z && n.time === neighborNode.time
        );

        if (existingIdx !== -1) {
          if (openList[existingIdx].g > g) {
            openList[existingIdx] = neighborNode;
          }
        } else {
          openList.push(neighborNode);
        }
      }
    }
    return null;
  }
}

/**
 * Strategy 1: Naive Planning
 */
export class NaivePlanner extends PathFindingStrategy {
  name = "Naive (Unsafe)";
  description = "Agents plan selfishly. Collisions result in destruction.";
  isSafe = false;

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false) {
    const drones = swarm.drones;
    const emptySet = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of drones) {
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
            // Estimate remaining battery for leg 2 check? Not perfect but sufficient for naive
            const path2 = this.findPath(drone.goal, drone.start, leg1Time, world, emptySet, drone.maxBattery, deadline); // Simplified battery check
            
            if (path2) {
                fullPath = [...path1, ...path2.slice(1)];
            }
            deliveryTick = leg1Time;
        } else {
            deliveryTick = fullPath.length - 1;
        }
        
        drone.setPath(fullPath, deliveryTick);
        drone.status = 'finished';
      } else {
        drone.setPath([drone.start]);
        drone.status = 'out_of_battery'; // Often due to energy limit in findPath
      }
    }
  }
}

/**
 * Strategy 2: Cooperative A*
 */
export class CooperativePlanner extends PathFindingStrategy {
  name = "Cooperative A*";
  description = "Prioritized planning. Agents avoid each other's future paths.";
  isSafe = true;

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false) {
    const drones = swarm.drones;
    const reservedSpaceTime = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const path1 = this.findPath(drone.start, drone.goal, 0, world, reservedSpaceTime, drone.maxBattery, deadline);

      if (!path1) {
        drone.setPath([drone.start]);
        drone.status = 'out_of_battery';
        continue;
      }

      let fullPath = path1;
      let deliveryTick = path1.length - 1;

      if (isRoundTrip) {
          const leg1Time = path1.length - 1;
          const path2 = this.findPath(drone.goal, drone.start, leg1Time, world, reservedSpaceTime, drone.maxBattery, deadline); // Simplified
          
          if (path2) {
              fullPath = [...path1, ...path2.slice(1)];
          }
          deliveryTick = leg1Time;
      } else {
          deliveryTick = fullPath.length - 1;
      }

      drone.setPath(fullPath, deliveryTick);
      drone.status = 'finished';

      fullPath.forEach((pos, t) => {
        reservedSpaceTime.add(this.key(pos, t));
      });
      
      // Reserve post-arrival to prevent rear-end collisions
      const lastPos = fullPath[fullPath.length - 1];
      const arrivalTime = fullPath.length - 1;
      for (let t = 1; t < 20; t++) {
        reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
      }
    }
  }
}

/**
 * Strategy 3: Energy Saver (Custom A*)
 * Prioritizes low energy consumption over speed.
 */
export class EnergySaverPlanner extends PathFindingStrategy {
  name = "Energy Saver";
  description = "Prioritizes battery conservation. Waiting is cheaper than moving.";
  isSafe = true;

  // Override findPath to use Energy as G-cost instead of Time
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
      ...start,
      g: 0, // G is now ENERGY
      h: this.heuristic(start, goal) * ENERGY_COSTS.MOVE, // Heuristic in Energy units
      f: 0,
      parent: null,
      time: startTime,
      energy: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openList: PathNode[] = [startNode];
    const closedSet = new Set<number>();

    while (openList.length > 0) {
      if (performance.now() > deadline) {
        throw new Error("Pathfinding Timeout");
      }

      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;

      if (current.x === goal.x && current.y === goal.y && current.z === goal.z) {
        return this.reconstructPath(current);
      }

      if (current.time >= this.maxTimeSteps) continue;

      const closedKey = this.key(current, current.time);
      if (closedSet.has(closedKey)) continue;
      closedSet.add(closedKey);

      const neighbors = this.getNeighbors(current, world);

      for (const nextPos of neighbors) {
        const nextTime = current.time + 1;

        if (world.isPositionBlocked(nextPos)) continue;
        if (reserved.size > 0 && reserved.has(this.key(nextPos, nextTime))) continue;

        const isWait = nextPos.x === current.x && nextPos.y === current.y && nextPos.z === current.z;
        const stepCost = isWait ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;

        const newEnergy = current.energy + stepCost;
        if (newEnergy > maxEnergy) continue;

        // G cost is ENERGY, not time steps
        const g = current.g + stepCost; 
        const h = this.heuristic(nextPos, goal) * ENERGY_COSTS.MOVE;
        const f = g + h;

        const neighborNode: PathNode = {
          ...nextPos,
          g, h, f,
          parent: current,
          time: nextTime,
          energy: newEnergy
        };

        // Check if we found a better path to this state (Pos + Time) in terms of ENERGY
        const existingIdx = openList.findIndex(n =>
          n.x === neighborNode.x && n.y === neighborNode.y && n.z === neighborNode.z && n.time === neighborNode.time
        );

        if (existingIdx !== -1) {
          if (openList[existingIdx].g > g) {
            openList[existingIdx] = neighborNode;
          }
        } else {
          openList.push(neighborNode);
        }
      }
    }
    return null;
  }

  plan(swarm: Swarm, world: World, isRoundTrip: boolean = false) {
    const drones = swarm.drones;
    const reservedSpaceTime = new Set<number>();
    const deadline = performance.now() + TIMEOUT_MS;

    for (const drone of drones) {
      if (performance.now() > deadline) throw new Error("Pathfinding Timeout");

      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      // Use Energy Optimized Finder
      const path1 = this.findPathEnergyOptimized(drone.start, drone.goal, 0, world, reservedSpaceTime, drone.maxBattery, deadline);

      if (!path1) {
        drone.setPath([drone.start]);
        drone.status = 'out_of_battery';
        continue;
      }

      let fullPath = path1;
      let deliveryTick = path1.length - 1;

      // For simplicty, leg 2 just uses regular path finding but checks energy constraints
      if (isRoundTrip) {
          const leg1Time = path1.length - 1;
          // Calculate energy consumed in leg 1 to pass as start energy for leg 2? 
          // The current simplified findPath doesn't take "startEnergy" param easily without refactor.
          // We'll approximate by reducing maxBattery for the second leg.
          // Energy used in Leg 1:
          let energyUsed = 0;
          for(let i=1; i<path1.length; i++) {
             const prev = path1[i-1];
             const curr = path1[i];
             if(prev.x === curr.x && prev.y === curr.y && prev.z === curr.z) energyUsed += ENERGY_COSTS.WAIT;
             else energyUsed += ENERGY_COSTS.MOVE;
          }
          
          const remainingBat = drone.maxBattery - energyUsed;
          
          const path2 = this.findPathEnergyOptimized(drone.goal, drone.start, leg1Time, world, reservedSpaceTime, remainingBat, deadline);
          
          if (path2) {
              fullPath = [...path1, ...path2.slice(1)];
          } else {
              // If can't make it back, just stay at goal? or mark as partial?
              // For now, commit to leg 1 and mark out of battery later.
          }
          deliveryTick = leg1Time;
      } else {
          deliveryTick = fullPath.length - 1;
      }

      drone.setPath(fullPath, deliveryTick);
      drone.status = 'finished';

      fullPath.forEach((pos, t) => {
        reservedSpaceTime.add(this.key(pos, t));
      });
       
      const lastPos = fullPath[fullPath.length - 1];
      const arrivalTime = fullPath.length - 1;
      for (let t = 1; t < 20; t++) {
        reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
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
        if (!timeLocationMap.has(key)) {
          timeLocationMap.set(key, []);
        }
        timeLocationMap.get(key)!.push(drone.id);
      });
    }

    timeLocationMap.forEach((agentIds, key) => {
      if (agentIds.length > 1) {
        const [tStr, xStr, yStr, zStr] = key.split(',');
        collisions.push({
          time: parseInt(tStr),
          position: {
            x: parseInt(xStr),
            y: parseInt(yStr),
            z: parseInt(zStr)
          },
          agentIds
        });
      }
    });

    return collisions;
  }
}
