import { Position3D, PathNode, Agent, CollisionEvent } from '../types';
import { World } from './World';
import { Swarm, Drone } from './Drone';

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
    // Check bounds manually to avoid object creation if not needed? 
    // Standard approach is fine, bottleneck is usually the closedSet lookup.
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

  /**
   * Packs space-time coordinates into a single 32-bit integer.
   * Max Grid Size: 64 (6 bits per dim)
   * Max Time: ~4095 (12 bits)
   * Format: [Time:12][Z:6][Y:6][X:6]
   */
  protected key(p: Position3D, t: number): number {
    return (p.x) | (p.y << 6) | (p.z << 12) | (t << 18);
  }

  protected findPath(
    start: Position3D,
    goal: Position3D,
    startTime: number,
    world: World,
    reserved: Set<number>
  ): Position3D[] | null {
    const startNode: PathNode = {
      ...start,
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
      parent: null,
      time: startTime
    };
    startNode.f = startNode.g + startNode.h;

    const openList: PathNode[] = [startNode];
    
    // Use numeric set for performance (no string allocations)
    const closedSet = new Set<number>();

    while (openList.length > 0) {
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

        // Dynamic obstacle check using integer Set
        if (reserved.size > 0 && reserved.has(this.key(nextPos, nextTime))) continue;

        const g = current.g + 1;
        const h = this.heuristic(nextPos, goal);
        const f = g + h;

        const neighborNode: PathNode = {
          ...nextPos,
          g, h, f,
          parent: current,
          time: nextTime
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

    for (const drone of drones) {
      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const path1 = this.findPath(drone.start, drone.goal, 0, world, emptySet);

      if (path1) {
        if (isRoundTrip) {
            const leg1Time = path1.length - 1;
            const path2 = this.findPath(drone.goal, drone.start, leg1Time, world, emptySet);
            
            if (path2) {
                drone.setPath([...path1, ...path2.slice(1)]);
            } else {
                drone.setPath(path1);
            }
        } else {
            drone.setPath(path1);
        }
        drone.status = 'finished';
      } else {
        drone.setPath([drone.start]);
        drone.status = 'blocked';
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
    // Changed to Set<number> for performance
    const reservedSpaceTime = new Set<number>();

    for (const drone of drones) {
      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const path1 = this.findPath(drone.start, drone.goal, 0, world, reservedSpaceTime);

      if (!path1) {
        drone.setPath([drone.start]);
        drone.status = 'blocked';
        continue;
      }

      let fullPath = path1;

      if (isRoundTrip) {
          const leg1Time = path1.length - 1;
          const path2 = this.findPath(drone.goal, drone.start, leg1Time, world, reservedSpaceTime);
          
          if (path2) {
              fullPath = [...path1, ...path2.slice(1)];
          }
      }

      drone.setPath(fullPath);
      drone.status = 'finished';

      // Reserve path
      fullPath.forEach((pos, t) => {
        reservedSpaceTime.add(this.key(pos, t));
      });

      // Reserve final position
      const lastPos = fullPath[fullPath.length - 1];
      const arrivalTime = fullPath.length - 1;
      for (let t = 1; t < 20; t++) {
        reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
      }
    }
  }
}

/**
 * Utility to detect collisions
 */
export class CollisionAnalyzer {
  static detect(swarm: Swarm): CollisionEvent[] {
    const collisions: CollisionEvent[] = [];
    // Using Map<string> here is acceptable as this runs once post-calculation
    // and string keys are easier to debug/parse for collision reporting
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