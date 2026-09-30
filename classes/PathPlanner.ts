import { Position3D, PathNode, SimulationIncident, MATH_CONSTANTS } from '../types';
import { World } from './World';
import { Swarm, Drone } from './Drone';
import { PATHFINDER_TIMEOUT_MS, MAX_TIMESTEPS } from '../SimulationConfig';

const TIMEOUT_MS = PATHFINDER_TIMEOUT_MS;

/** Failed plan attempts a drone may retry (waiting in place between tries) before giving up on a leg. */
export const MAX_LEG_RETRIES = 5;
/** Ticks a drone hovers in place after a failed plan before the next attempt. */
export const RETRY_WAIT_TICKS = 3;

const DIRECTIONS = [ // these are the 6 directions + wait
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, // x-axis
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, // y-axis
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, // z-axis
  { x: 0, y: 0, z: 0 },  // wait -> very important for collision avoidance and checking pallets
];

/**
 * Min-Heap priority queue for fast A* expansion (O(log N) push and pop).
 */
export class MinHeap<T> {
  private data: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.data.length;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.compare(this.data[idx], this.data[parentIdx]) < 0) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[parentIdx];
        this.data[parentIdx] = tmp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(idx: number): void {
    const len = this.data.length;
    while (true) {
      let smallest = idx;
      const left = (idx << 1) + 1;
      const right = left + 1;
      if (left < len && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < len && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== idx) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[smallest];
        this.data[smallest] = tmp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

/**
 * 4D Space-Time Reservation Table with vertex ownership and edge conflict prevention.
 */
export class SpaceTimeReservations {
  private vertexOwners = new Map<number, string>();
  private edgeOwners = new Map<string, string>();

  public addVertex(key: number, ownerId: string): void {
    this.vertexOwners.set(key, ownerId);
  }

  public addEdge(fromPos: Position3D, toPos: Position3D, time: number, ownerId: string): void {
    const fromKey = (fromPos.x) + (fromPos.y * 64) + (fromPos.z * 4096);
    const toKey = (toPos.x) + (toPos.y * 64) + (toPos.z * 4096);
    this.edgeOwners.set(`${time}:${fromKey}->${toKey}`, ownerId);
  }

  public isVertexReserved(key: number, requesterId?: string): boolean {
    const owner = this.vertexOwners.get(key);
    if (!owner) return false;
    if (requesterId && owner === requesterId) return false; // Allowed to wait on own position
    return true;
  }

  public isEdgeConflict(fromPos: Position3D, toPos: Position3D, time: number, requesterId?: string): boolean {
    const fromKey = (fromPos.x) + (fromPos.y * 64) + (fromPos.z * 4096);
    const toKey = (toPos.x) + (toPos.y * 64) + (toPos.z * 4096);
    // Conflict occurs if another agent moves from toPos to fromPos between time and time+1
    const oppositeEdgeKey = `${time}:${toKey}->${fromKey}`;
    const owner = this.edgeOwners.get(oppositeEdgeKey);
    if (!owner) return false;
    if (requesterId && owner === requesterId) return false;
    return true;
  }

  public clearOwnerFromTime(ownerId: string, fromTime: number): void {
    for (const [key, owner] of this.vertexOwners.entries()) {
      if (owner === ownerId) {
        const t = Math.floor(key / 262144);
        if (t >= fromTime) {
          this.vertexOwners.delete(key);
        }
      }
    }

    for (const [edgeKey, owner] of this.edgeOwners.entries()) {
      if (owner === ownerId) {
        const colonIdx = edgeKey.indexOf(':');
        if (colonIdx !== -1) {
          const t = parseInt(edgeKey.substring(0, colonIdx), 10);
          if (t >= fromTime) {
            this.edgeOwners.delete(edgeKey);
          }
        }
      }
    }
  }

  // Set-like compatibility
  public has(key: number): boolean {
    return this.vertexOwners.has(key);
  }

  public add(key: number): this {
    this.vertexOwners.set(key, 'RESERVED');
    return this;
  }

  public cloneForOwner(retainedOwner: string): SpaceTimeReservations {
    const copy = new SpaceTimeReservations();
    for (const [key, owner] of this.vertexOwners.entries()) {
      if (owner === retainedOwner) copy.vertexOwners.set(key, owner);
    }
    for (const [edgeKey, owner] of this.edgeOwners.entries()) {
      if (owner === retainedOwner) copy.edgeOwners.set(edgeKey, owner);
    }
    return copy;
  }

  public get size(): number {
    return this.vertexOwners.size;
  }
}

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

  abstract planLeg(
    swarm: Swarm,
    world: World,
    globalStartTime: number,
    reservedSpaceTime: SpaceTimeReservations | Set<number>,
    maxAltitude?: number,
    batteryEnabled?: boolean
  ): void;

  protected heuristic(a: Position3D, b: Position3D): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
  }

  /**
   * If `pos` is blocked, BFS outward to find the nearest free neighbor.
   * This allows drone goals to be set to pallet center positions even though pallets are blocked voxels.
   * Guarantees safe hover positions outside forklift sweep corridors at y <= 1, never picking y <= 1 in forklift corridors.
   */
  protected nearestFreeNeighbor(
    pos: Position3D,
    world: World,
    maxAltitude?: number,
    reserved?: SpaceTimeReservations | Set<number>,
    time?: number,
    requesterId?: string
  ): Position3D {
    const isForkliftZone = (x: number, y: number, z: number) => {
      if (y > 1) return false;
      return (world.forklifts || []).some(fl => fl.path && fl.path.some(p => p.x === x && p.z === z));
    };

    const isReserved = (p: Position3D) => {
      if (!reserved || time === undefined) return false;
      const k = this.key(p, time);
      return this.isCellReserved(reserved, k, requesterId);
    };

    if (!world.isBlocked(pos.x, pos.y, pos.z) && 
        (maxAltitude === undefined || pos.y <= maxAltitude) && 
        !isForkliftZone(pos.x, pos.y, pos.z) &&
        !isReserved(pos)) {
      return pos;
    }

    const queue: Position3D[] = [pos];
    const visited = new Set<string>();
    visited.add(`${pos.x},${pos.y},${pos.z}`);
    let fallbackElevated: Position3D | null = null;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const dir of DIRECTIONS) {
        if (dir.x === 0 && dir.y === 0 && dir.z === 0) continue;
        const nx = curr.x + dir.x;
        const ny = curr.y + dir.y;
        const nz = curr.z + dir.z;
        const key = `${nx},${ny},${nz}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (nx < 0 || ny < 0 || nz < 0 || nx >= world.size || ny >= world.size || nz >= world.size) continue;
        if (maxAltitude !== undefined && ny > maxAltitude) continue;

        if (!world.isBlocked(nx, ny, nz)) {
          const candidate: Position3D = { x: nx, y: ny, z: nz };
          const inFlZone = isForkliftZone(nx, ny, nz);
          const cellReserved = isReserved(candidate);

          if (!inFlZone && !cellReserved) {
            return candidate;
          }
          // If in forklift zone, elevate to y = 2 if free
          if (inFlZone && ny <= 1) {
            const elevatedY = Math.min(2, maxAltitude !== undefined ? maxAltitude : 2);
            if (!world.isBlocked(nx, elevatedY, nz) && !isReserved({ x: nx, y: elevatedY, z: nz })) {
              if (!fallbackElevated) fallbackElevated = { x: nx, y: elevatedY, z: nz };
            }
          }
        }
        if (visited.size < 300) queue.push({ x: nx, y: ny, z: nz });
      }
    }
    return fallbackElevated || pos;
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
   * Resolves a (possibly blocked) goal to a hover cell. Cells another drone is reserved on at the
   * end of the search horizon are skipped: those are drones parked at their own goal, and a goal
   * sharing their cell can never be reached.
   */
  protected resolveGoal(
    goal: Position3D,
    world: World,
    maxAltitude: number | undefined,
    reserved: SpaceTimeReservations | Set<number>,
    startTime: number,
    maxSearchDepth: number | undefined,
    requesterId?: string
  ): Position3D {
    const horizon = startTime + (maxSearchDepth ?? world.size * 4);
    return this.nearestFreeNeighbor(goal, world, maxAltitude, reserved, horizon, requesterId);
  }

  /** Resets a drone's retry bookkeeping after a leg was planned successfully. */
  protected markLegPlanned(drone: Drone): void {
    drone.legFailures = 0;
    drone.lastLegFailed = false;
  }

  /**
   * Handles a leg with no path. The drone hovers in place for RETRY_WAIT_TICKS so the next cycle
   * re-plans against a later, less congested reservation state. A drone carrying a task is never
   * stranded here: after MAX_LEG_RETRIES the SimulationManager abandons the task instead. A drone
   * that cannot get home (or has nothing to abandon) is stranded once the retries run out.
   */
  protected handleLegFailure(
    drone: Drone,
    startPos: Position3D,
    startTime: number,
    reserved: SpaceTimeReservations | Set<number>
  ): void {
    drone.legFailures++;
    drone.lastLegFailed = true;

    const hasTask = drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR';
    const outOfTime = startTime + RETRY_WAIT_TICKS >= this.maxTimeSteps;

    if (outOfTime || (!hasTask && drone.legFailures > MAX_LEG_RETRIES)) {
      drone.status = 'STRANDED';
      if (reserved instanceof SpaceTimeReservations) {
        const tailEnd = Math.min(startTime + 500, this.maxTimeSteps);
        for (let t = startTime; t <= tailEnd; t++) {
          const k = this.key(startPos, t);
          if (!reserved.isVertexReserved(k, drone.id)) reserved.addVertex(k, drone.id);
        }
      } else {
        reserved.add(this.key(startPos, startTime + 1));
      }
      return;
    }

    // Hover in place, then retry next cycle. Cells already owned by someone else are not
    // overwritten (the drone's own parking tail from its previous leg normally covers them).
    const waitLeg: Position3D[] = [];
    for (let w = 0; w <= RETRY_WAIT_TICKS; w++) {
      waitLeg.push({ ...startPos });
      if (w > 0 && reserved instanceof SpaceTimeReservations) {
        const k = this.key(startPos, startTime + w);
        if (!reserved.isVertexReserved(k, drone.id)) reserved.addVertex(k, drone.id);
      }
    }
    drone.appendPath(waitLeg, false);
  }

  protected key(p: Position3D, t: number): number {
    return (p.x) + (p.y * 64) + (p.z * 4096) + (t * 262144);
  }

  protected isCellReserved(
    reserved: SpaceTimeReservations | Set<number>,
    key: number,
    requesterId?: string
  ): boolean {
    if (reserved instanceof SpaceTimeReservations) {
      return reserved.isVertexReserved(key, requesterId);
    }
    return reserved.has(key);
  }

  protected isEdgeConflict(
    reserved: SpaceTimeReservations | Set<number>,
    fromPos: Position3D,
    toPos: Position3D,
    time: number,
    requesterId?: string
  ): boolean {
    if (reserved instanceof SpaceTimeReservations) {
      return reserved.isEdgeConflict(fromPos, toPos, time, requesterId);
    }
    return false;
  }

  protected findPath(
    start: Position3D,
    goal: Position3D,
    startTime: number,
    world: World,
    reserved: SpaceTimeReservations | Set<number>,
    maxEnergy?: number,
    deadline?: number,
    maxAltitude?: number,
    maxSearchDepth?: number,
    requesterId?: string
  ): { path: Position3D[], finalEnergy: number } | null {

    const effectiveGoal = this.resolveGoal(goal, world, maxAltitude, reserved, startTime, maxSearchDepth, requesterId);

    const startNode: PathNode = {
      ...start, g: 0, h: this.heuristic(start, effectiveGoal), f: 0, parent: null, time: startTime, energy: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openHeap = new MinHeap<PathNode>((a, b) => a.f - b.f);
    openHeap.push(startNode);
    const bestG = new Map<number, number>();
    bestG.set(this.key(start, startTime), 0);

    const closedSet = new Set<number>();
    let nodesExpanded = 0;

    while (openHeap.size > 0) {
      if ((nodesExpanded & 63) === 0) {
        if (deadline && performance.now() > deadline) throw new Error("Pathfinding Timeout");
      }
      nodesExpanded++;

      const current = openHeap.pop()!;

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
        const nextKey = this.key(nextPos, nextTime);

        if (this.isCellReserved(reserved, nextKey, requesterId)) continue;
        if (nx !== current.x || ny !== current.y || nz !== current.z) {
          if (this.isEdgeConflict(reserved, current, nextPos, current.time, requesterId)) continue;
        }

        const stepCost = (nx === current.x && ny === current.y && nz === current.z) ? MATH_CONSTANTS.BETA_HOVER : MATH_CONSTANTS.BETA_FLY;
        const energy = current.energy + stepCost;

        if (maxEnergy !== undefined && energy > maxEnergy) continue;

        const g = current.g + 1;
        if (bestG.has(nextKey) && bestG.get(nextKey)! <= g) continue;
        bestG.set(nextKey, g);

        const h = this.heuristic(nextPos, effectiveGoal);
        const f = g + h;

        const neighborNode: PathNode = {
          x: nx, y: ny, z: nz, g, h, f, parent: current, time: nextTime, energy
        };

        openHeap.push(neighborNode);
      }
    }
    return null;
  }
}

export class NaivePlanner extends PathFindingStrategy {
  name = "Naive (Unsafe)";
  description = "Agents plan selfishly. Collisions result in destruction.";
  isSafe = false;

  planLeg(
    swarm: Swarm,
    world: World,
    globalStartTime: number,
    reservedSpaceTime: SpaceTimeReservations | Set<number>,
    maxAltitude: number,
    batteryEnabled: boolean
  ) {
    const deadline = performance.now() + TIMEOUT_MS;
    const maxLegDepth = world.size * 4;
    // In Naive planning, drones ignore each other, but must still avoid dynamic moving machinery (forklifts)
    const naiveReservations = reservedSpaceTime instanceof SpaceTimeReservations
      ? reservedSpaceTime.cloneForOwner('FORKLIFT')
      : new SpaceTimeReservations();

    for (const drone of swarm.drones) {
      const target = drone.mission.getNextTarget();
      if (!target || drone.status === 'STRANDED') continue;

      const startPos = drone.path[drone.path.length - 1] || drone.start;
      const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;
      const availableEnergy = batteryEnabled 
        ? drone.calculateStateAt(startTime, world.chargeStations, batteryEnabled).battery 
        : undefined;

      const result = this.findPath(
        startPos,
        target,
        startTime,
        world,
        naiveReservations,
        availableEnergy,
        deadline,
        maxAltitude,
        maxLegDepth,
        drone.id
      );

      if (result) {
        drone.appendPath(result.path, drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR');
        this.markLegPlanned(drone);
      } else {
        this.handleLegFailure(drone, startPos, startTime, naiveReservations);
      }
    }
  }
}

export class CooperativePlanner extends PathFindingStrategy {
  name = "Cooperative A*";
  description = "Prioritized planning. Agents avoid each other's future paths.";
  isSafe = true;

  planLeg(
    swarm: Swarm,
    world: World,
    globalStartTime: number,
    reservedSpaceTime: SpaceTimeReservations | Set<number>,
    maxAltitude: number,
    batteryEnabled: boolean
  ) {
    const deadline = performance.now() + TIMEOUT_MS;
    const maxLegDepth = world.size * 4;

    for (const drone of swarm.drones) {
      const target = drone.mission.getNextTarget();
      if (!target || drone.status === 'STRANDED') continue;

      const startPos = drone.path[drone.path.length - 1] || drone.start;
      const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;
      const availableEnergy = batteryEnabled 
        ? drone.calculateStateAt(startTime, world.chargeStations, batteryEnabled).battery 
        : undefined;

      const result = this.findPath(
        startPos,
        target,
        startTime,
        world,
        reservedSpaceTime,
        availableEnergy,
        deadline,
        maxAltitude,
        maxLegDepth,
        drone.id
      );

      if (result) {
        drone.appendPath(result.path, drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR');
        this.markLegPlanned(drone);

        if (reservedSpaceTime instanceof SpaceTimeReservations) {
          // Clear old idle tail reservations for this drone from startTime onwards
          reservedSpaceTime.clearOwnerFromTime(drone.id, startTime);

          // Reserve the newly planned trajectory and directed edges
          result.path.forEach((p, idx) => {
            const t = startTime + idx;
            reservedSpaceTime.addVertex(this.key(p, t), drone.id);
            if (idx > 0) {
              reservedSpaceTime.addEdge(result.path[idx - 1], p, t - 1, drone.id);
            }
          });

          // Reserve resting position for idle duration so other drones won't collide with it
          const lastPos = result.path[result.path.length - 1];
          const arrivalTime = startTime + result.path.length - 1;
          const tailEnd = Math.min(arrivalTime + 500, this.maxTimeSteps);
          for (let w = 1; arrivalTime + w <= tailEnd; w++) {
            reservedSpaceTime.addVertex(this.key(lastPos, arrivalTime + w), drone.id);
          }
        } else {
          result.path.forEach((p, idx) => {
            reservedSpaceTime.add(this.key(p, startTime + idx));
          });
          const lastPos = result.path[result.path.length - 1];
          const arrivalTime = startTime + result.path.length - 1;
          for (let w = 1; w < 50; w++) {
            reservedSpaceTime.add(this.key(lastPos, arrivalTime + w));
          }
        }
      } else {
        this.handleLegFailure(drone, startPos, startTime, reservedSpaceTime);
      }
    }
  }
}

export class EnergySaverPlanner extends PathFindingStrategy {
  name = "Energy Saver";
  description = "Prioritizes battery conservation. Waiting is cheaper than moving.";
  isSafe = true;

  protected findPathEnergy(
    start: Position3D,
    goal: Position3D,
    startTime: number,
    world: World,
    reserved: SpaceTimeReservations | Set<number>,
    maxEnergy: number | undefined,
    deadline: number,
    maxAltitude?: number,
    maxSearchDepth?: number,
    requesterId?: string
  ): { path: Position3D[], finalEnergy: number } | null {

    // Resolve blocked goal to the nearest free neighbor so A* can reach pallets
    const effectiveGoal = this.resolveGoal(goal, world, maxAltitude, reserved, startTime, maxSearchDepth, requesterId);

    const startNode: PathNode = {
      ...start, g: 0, h: this.heuristic(start, effectiveGoal) * MATH_CONSTANTS.BETA_FLY, f: 0, parent: null, time: startTime, energy: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openHeap = new MinHeap<PathNode>((a, b) => a.f - b.f);
    openHeap.push(startNode);
    const bestG = new Map<number, number>();
    bestG.set(this.key(start, startTime), 0);

    let nodesExpanded = 0;

    while (openHeap.size > 0) {
      if ((nodesExpanded & 63) === 0) {
        if (performance.now() > deadline) throw new Error("Pathfinding Timeout");
      }
      nodesExpanded++;

      const current = openHeap.pop()!;

      if (current.x === effectiveGoal.x && current.y === effectiveGoal.y && current.z === effectiveGoal.z) {
        return { path: this.reconstructPath(current), finalEnergy: current.energy };
      }

      if (current.time >= this.maxTimeSteps) continue;
      if (maxSearchDepth !== undefined && (current.time - startTime) >= maxSearchDepth) continue;

      const currentKey = this.key(current, current.time);
      if (bestG.has(currentKey) && current.g > bestG.get(currentKey)!) continue;

      for (const dir of DIRECTIONS) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nz = current.z + dir.z;

        if (world.isBlocked(nx, ny, nz)) continue;
        if (maxAltitude !== undefined && ny > maxAltitude) continue;

        const nextTime = current.time + 1;
        const nextPos: Position3D = { x: nx, y: ny, z: nz };
        const nextKey = this.key(nextPos, nextTime);

        if (this.isCellReserved(reserved, nextKey, requesterId)) continue;
        if (nx !== current.x || ny !== current.y || nz !== current.z) {
          if (this.isEdgeConflict(reserved, current, nextPos, current.time, requesterId)) continue;
        }

        const stepCost = (nx === current.x && ny === current.y && nz === current.z) ? MATH_CONSTANTS.BETA_HOVER : MATH_CONSTANTS.BETA_FLY;
        const newEnergy = current.energy + stepCost;
        if (maxEnergy !== undefined && newEnergy > maxEnergy) continue;

        const g = current.g + stepCost;
        if (bestG.has(nextKey) && bestG.get(nextKey)! <= g) continue;
        bestG.set(nextKey, g);

        const h = this.heuristic(nextPos, effectiveGoal) * MATH_CONSTANTS.BETA_FLY;
        const f = g + h;

        const neighborNode: PathNode = {
          x: nx, y: ny, z: nz, g, h, f, parent: current, time: nextTime, energy: newEnergy
        };

        openHeap.push(neighborNode);
      }
    }
    return null;
  }

  planLeg(
    swarm: Swarm,
    world: World,
    globalStartTime: number,
    reservedSpaceTime: SpaceTimeReservations | Set<number>,
    maxAltitude: number,
    batteryEnabled: boolean
  ) {
    const deadline = performance.now() + TIMEOUT_MS;
    const maxLegDepth = world.size * 4;

    for (const drone of swarm.drones) {
      const target = drone.mission.getNextTarget();
      if (!target || drone.status === 'STRANDED') continue;

      const startPos = drone.path[drone.path.length - 1] || drone.start;
      const startTime = drone.path.length > 0 ? drone.path.length - 1 : 0;
      const availableEnergy = batteryEnabled 
        ? drone.calculateStateAt(startTime, world.chargeStations, batteryEnabled).battery 
        : undefined;

      const result = this.findPathEnergy(
        startPos,
        target,
        startTime,
        world,
        reservedSpaceTime,
        availableEnergy,
        deadline,
        maxAltitude,
        maxLegDepth,
        drone.id
      );

      if (result) {
        drone.appendPath(result.path, drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR');
        this.markLegPlanned(drone);

        if (reservedSpaceTime instanceof SpaceTimeReservations) {
          reservedSpaceTime.clearOwnerFromTime(drone.id, startTime);

          result.path.forEach((p, idx) => {
            const t = startTime + idx;
            reservedSpaceTime.addVertex(this.key(p, t), drone.id);
            if (idx > 0) {
              reservedSpaceTime.addEdge(result.path[idx - 1], p, t - 1, drone.id);
            }
          });

          const lastPos = result.path[result.path.length - 1];
          const arrivalTime = startTime + result.path.length - 1;
          const tailEnd = Math.min(arrivalTime + 500, this.maxTimeSteps);
          for (let w = 1; arrivalTime + w <= tailEnd; w++) {
            reservedSpaceTime.addVertex(this.key(lastPos, arrivalTime + w), drone.id);
          }
        } else {
          result.path.forEach((p, idx) => {
            reservedSpaceTime.add(this.key(p, startTime + idx));
          });
          const lastPos = result.path[result.path.length - 1];
          const arrivalTime = startTime + result.path.length - 1;
          for (let w = 1; w < 50; w++) {
            reservedSpaceTime.add(this.key(lastPos, arrivalTime + w));
          }
        }
      } else {
        this.handleLegFailure(drone, startPos, startTime, reservedSpaceTime);
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
        pos.y === warehouse.position.y &&
        pos.z >= b.minZ && pos.z <= b.maxZ;
    };

    const maxTicks = Math.max(...swarm.drones.map(d => d.path.length), 0) + 10;

    // --- 1. Drone vs Drone Vertex Collisions ---
    for (const drone of swarm.drones) {
      for (let t = 0; t < maxTicks; t++) {
        if (drone.status === 'STRANDED' && drone.destructionTime !== undefined && t > drone.destructionTime) continue;

        const pos = drone.path[Math.min(t, drone.path.length - 1)] || drone.start;
        if (isInsideBase(pos)) continue;

        const key = `${t},${pos.x},${pos.y},${pos.z}`;

        if (!timeLocationMap.has(key)) timeLocationMap.set(key, []);
        timeLocationMap.get(key)!.push(drone.id);
      }
    }

    timeLocationMap.forEach((agentIds, key) => {
      if (agentIds.length > 1) {
        const [tStr, xStr, yStr, zStr] = key.split(',');
        const time = parseInt(tStr, 10);
        const agentNames = agentIds.map(id => {
          const d = swarm.drones.find(a => a.id === id);
          return d ? d.name : id;
        });
        incidents.push({
          id: `col-${time}-${xStr}-${yStr}-${zStr}`,
          type: 'collision',
          time,
          position: { x: parseInt(xStr, 10), y: parseInt(yStr, 10), z: parseInt(zStr, 10) },
          agentIds,
          agentNames
        });
      }
    });

    // --- 2. Drone vs Drone Edge Swap Collisions ---
    for (let i = 0; i < swarm.drones.length; i++) {
      const d1 = swarm.drones[i];
      for (let j = i + 1; j < swarm.drones.length; j++) {
        const d2 = swarm.drones[j];
        for (let t = 1; t < maxTicks; t++) {
          if (d1.status === 'STRANDED' && d1.destructionTime !== undefined && t > d1.destructionTime) continue;
          if (d2.status === 'STRANDED' && d2.destructionTime !== undefined && t > d2.destructionTime) continue;

          const p1_prev = d1.path[Math.min(t - 1, d1.path.length - 1)] || d1.start;
          const p1_curr = d1.path[Math.min(t, d1.path.length - 1)] || d1.start;
          const p2_prev = d2.path[Math.min(t - 1, d2.path.length - 1)] || d2.start;
          const p2_curr = d2.path[Math.min(t, d2.path.length - 1)] || d2.start;

          if (isInsideBase(p1_curr) || isInsideBase(p2_curr)) continue;

          if (
            p1_prev.x === p2_curr.x && p1_prev.y === p2_curr.y && p1_prev.z === p2_curr.z &&
            p1_curr.x === p2_prev.x && p1_curr.y === p2_prev.y && p1_curr.z === p2_prev.z &&
            !(p1_prev.x === p1_curr.x && p1_prev.y === p1_curr.y && p1_prev.z === p1_curr.z)
          ) {
            incidents.push({
              id: `edge-col-${t}-${d1.id}-${d2.id}`,
              type: 'collision',
              time: t,
              position: p1_curr,
              agentIds: [d1.id, d2.id],
              agentNames: [d1.name, d2.name]
            });
          }
        }
      }
    }

    // --- 3. Drone vs Forklift Collisions ---
    if (forklifts.length > 0) {
      for (const drone of swarm.drones) {
        for (let t = 0; t < maxTicks; t++) {
          if (drone.status === 'STRANDED' && drone.destructionTime !== undefined && t > drone.destructionTime) continue;

          const dronePos = drone.path[Math.min(t, drone.path.length - 1)] || drone.start;
          if (isInsideBase(dronePos)) continue;

          for (const fl of forklifts) {
            if (!fl.path.length) continue;

            const flIdx = t % fl.path.length;
            const flPos = fl.path[flIdx];

            // Direct occupation hit
            const hits = (
              dronePos.x === flPos.x && dronePos.z === flPos.z &&
              (dronePos.y === flPos.y || dronePos.y === flPos.y + 1)
            );

            // Head-on phase-through swapping
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
