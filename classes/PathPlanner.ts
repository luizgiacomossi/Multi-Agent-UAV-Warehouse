import { Position3D, PathNode, Agent, CollisionEvent } from '../types';
import { World } from './World';
import { Swarm, Drone } from './Drone';

export class PathPlanner {
  private maxTimeSteps: number;

  constructor(maxTimeSteps: number = 200) {
    this.maxTimeSteps = maxTimeSteps;
  }

  public setMaxTimeSteps(steps: number) {
      this.maxTimeSteps = steps;
  }

  /**
   * Main Cooperative A* Planning
   */
  public plan(swarm: Swarm, world: World) {
    const drones = swarm.drones;
    const reservedSpaceTime = new Set<string>(); // "x,y,z,t"

    for (const drone of drones) {
      if (world.isPositionBlocked(drone.start)) {
        drone.setPath([drone.start]);
        continue;
      }

      const path = this.findPath(drone, world, reservedSpaceTime);
      
      if (path) {
        drone.setPath(path);
        drone.status = 'finished';
        
        // Reserve path
        path.forEach((pos, t) => {
            reservedSpaceTime.add(this.key(pos, t));
        });

        // Reserve goal for a bit after finishing to prevent immediate collision
        const lastPos = path[path.length - 1];
        const arrivalTime = path.length - 1;
        for(let t = 1; t < 20; t++) {
            reservedSpaceTime.add(this.key(lastPos, arrivalTime + t));
        }

      } else {
        drone.setPath([drone.start]);
        drone.status = 'blocked';
      }
    }
  }

  /**
   * Plans paths for all agents ignoring each other (Naive).
   * This WILL result in collisions.
   */
  public planNaive(swarm: Swarm, world: World) {
    const drones = swarm.drones;
    const emptySet = new Set<string>();

    for (const drone of drones) {
        if (world.isPositionBlocked(drone.start)) {
            drone.setPath([drone.start]);
            continue;
        }
        
        // Pass empty set so they don't avoid each other
        const path = this.findPath(drone, world, emptySet);
        
        if (path) {
            drone.setPath(path);
            drone.status = 'finished';
        } else {
            drone.setPath([drone.start]);
            drone.status = 'blocked';
        }
    }
  }

  /**
   * Runs a simulation of "Naive" pathfinding (ignoring other agents) 
   * to find where collisions WOULD have occurred.
   */
  public detectProjectedCollisions(swarm: Swarm, world: World): CollisionEvent[] {
      const collisions: CollisionEvent[] = [];
      const timeLocationMap = new Map<string, string[]>(); // key: "t,x,y,z" -> [agentId, agentId]

      // 1. Calculate Naive Paths for all drones (if not already set, but we re-calc here to be safe/pure)
      // Note: To avoid modifying the actual swarm state during 'detect', we clone or just re-run logic.
      // For performance in this app, we assume the swarm might already have paths, 
      // but to detect collisions reliably we need to ensure we check the paths.
      
      // 2. Map positions to time based on current paths
      for (const drone of swarm.drones) {
          drone.path.forEach((pos, t) => {
              const key = `${t},${pos.x},${pos.y},${pos.z}`;
              if (!timeLocationMap.has(key)) {
                  timeLocationMap.set(key, []);
              }
              timeLocationMap.get(key)!.push(drone.id);
          });
      }

      // 3. Identify overlaps
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

  private findPath(drone: Drone, world: World, reserved: Set<string>): Position3D[] | null {
    const startNode: PathNode = {
      ...drone.start,
      g: 0,
      h: this.heuristic(drone.start, drone.goal),
      f: 0,
      parent: null,
      time: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openList: PathNode[] = [startNode];
    const closedSet = new Set<string>();

    while (openList.length > 0) {
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;

      // Goal Check
      if (current.x === drone.goal.x && current.y === drone.goal.y && current.z === drone.goal.z) {
        return this.reconstructPath(current);
      }

      if (current.time >= this.maxTimeSteps) continue;

      const closedKey = this.key(current, current.time);
      if (closedSet.has(closedKey)) continue;
      closedSet.add(closedKey);

      const neighbors = this.getNeighbors(current, world);

      for (const nextPos of neighbors) {
        const nextTime = current.time + 1;
        
        // Collision Check: Static
        if (world.isPositionBlocked(nextPos)) continue;

        // Collision Check: Dynamic (Other Drones) - Skipped if reserved is empty (Naive mode)
        if (reserved.size > 0 && reserved.has(this.key(nextPos, nextTime))) continue;

        const g = current.g + 1;
        const h = this.heuristic(nextPos, drone.goal);
        const f = g + h;

        const neighborNode: PathNode = {
          ...nextPos,
          g, h, f,
          parent: current,
          time: nextTime
        };

        // Check open list for better path
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

  private getNeighbors(node: PathNode, world: World): Position3D[] {
      const candidates = [
          {x: node.x+1, y: node.y, z: node.z},
          {x: node.x-1, y: node.y, z: node.z},
          {x: node.x, y: node.y+1, z: node.z},
          {x: node.x, y: node.y-1, z: node.z},
          {x: node.x, y: node.y, z: node.z+1},
          {x: node.x, y: node.y, z: node.z-1},
          {x: node.x, y: node.y, z: node.z}, // Wait
      ];

      return candidates.filter(p => 
          p.x >= 0 && p.x < world.size &&
          p.y >= 0 && p.y < world.size &&
          p.z >= 0 && p.z < world.size
      );
  }

  private heuristic(a: Position3D, b: Position3D): number {
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
  }

  private reconstructPath(node: PathNode): Position3D[] {
      const path: Position3D[] = [];
      let curr: PathNode | null = node;
      while (curr) {
          path.unshift({ x: curr.x, y: curr.y, z: curr.z });
          curr = curr.parent;
      }
      return path;
  }

  private key(p: Position3D, t: number): string {
      return `${p.x},${p.y},${p.z},${t}`;
  }
}