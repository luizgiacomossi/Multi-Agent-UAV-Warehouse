import { Position3D, Pallet, Forklift, TaskPriorityMode, MATH_CONSTANTS } from '../types';
import { WorldGenerator, ReservedZone } from './WorldGenerator';
import { Warehouse } from './Warehouse';
import { BatteryModel } from './BatteryModel';
import { CostModel } from './CostModel';
import { INSTANT_CHARGE_RATE, SCAN_TICKS } from '../SimulationConfig';

/** Drone battery the coverage placement of charging stations is computed for. */
export interface StationCoverage {
  capacity: number;
  drainMultiplier: number;
}

const flatDistance = (a: Position3D, b: Position3D) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
/** Index of the cell farthest from its nearest anchor (first on ties), or -1 if none is away from all. */
function farthest(cells: Position3D[], anchors: Position3D[]): number {
  let best = -1;
  let bestDistance = 0;
  cells.forEach((cell, i) => {
      const distance = Math.min(...anchors.map(a => flatDistance(cell, a)));
      if (distance > bestDistance) {
          best = i;
          bestDistance = distance;
      }
  });
  return best;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class World {
  size: number;
  grid: Uint8Array;
  obstacleList: Position3D[];
  chargeStations: Position3D[];
  warehouse: Warehouse | null = null;
  pallets: Pallet[] = []; // [NEW] Track pallets generated in the warehouse
  forklifts: Forklift[] = [];

  constructor(size: number = 24) {
    this.size = size;
    this.grid = new Uint8Array(size * size * size);
    this.obstacleList = [];
    this.chargeStations = [];
  }

  public setSize(size: number) {
    this.size = size;
    this.grid = new Uint8Array(size * size * size);
    this.obstacleList = [];
    this.chargeStations = [];
    this.warehouse = null;
    this.pallets = [];
    this.forklifts = [];
  }

  private getIndex(x: number, y: number, z: number): number {
    return x + this.size * (y + this.size * z);
  }

  public clear() {
    this.grid.fill(0);
    this.obstacleList = [];
    this.chargeStations = [];
    this.warehouse = null;
    this.pallets = [];
    this.forklifts = [];
  }

  public setupWarehouse(capacity: number) {
      this.warehouse = new Warehouse(capacity, { x: 0, y: 0, z: 0 });
      
      // Automatically clear the zone required by the warehouse as a safety measure
      // even if generation avoided it.
      const bounds = this.warehouse.getBounds();
      this.clearZone(bounds.minX, bounds.minY, bounds.minZ, bounds.maxX, bounds.maxY, bounds.maxZ);
  }

  public removeWarehouse() {
      this.warehouse = null;
  }

  public addObstacle(x: number, y: number, z: number) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) return;
    const idx = this.getIndex(x, y, z);
    if (this.grid[idx] === 0) {
      this.grid[idx] = 1;
      this.obstacleList.push({ x, y, z });
    }
  }

  public addChargeStation(x: number, y: number, z: number) {
      if (x >= 0 && x < this.size && y >= 0 && y < this.size && z >= 0 && z < this.size) {
          if (!this.isBlocked(x, y, z)) {
              this.chargeStations.push({x, y, z});
          }
      }
  }

    public generate(theme: string, reservedZone?: ReservedZone, totalTasks: number = 50, numForklifts: number = 3, priorityMode: TaskPriorityMode = 'mixed', rackLevels?: number) {
        WorldGenerator.generate(this, theme, reservedZone, totalTasks, numForklifts, priorityMode, rackLevels);
    }

  /**
   * Sites (base + stations) the coverage placement needs so every pallet is affordable from some
   * charger, or null when the stations were spread instead or no number of stations covers them all.
   */
  minChargingSites: number | null = null;

  /**
   * Places `count` charging stations on floor cells. Cells inside the base zone, under forklift
   * lanes, or not reachable from the base are skipped, and the layout is deterministic.
   *
   * Without `coverage` the stations are spread over the map: each one is the free cell farthest
   * from the base and from the stations already placed (farthest-point sampling). With `coverage`
   * they are placed for the drones' battery (see placeForCoverage).
   */
  public generateStations(count: number, baseZone?: ReservedZone, coverage?: StationCoverage) {
      this.chargeStations = [];
      this.minChargingSites = null;
      if (count <= 0 && !coverage) return;

      const { base, candidates } = this.stationCandidates(baseZone);
      if (coverage) {
          this.placeForCoverage(count, base, baseZone, candidates, coverage);
          return;
      }

      const anchors: Position3D[] = [base];
      while (this.chargeStations.length < count) {
          const best = farthest(candidates, anchors);
          if (best < 0) break; // no free floor cell left
          this.chargeStations.push(candidates[best]);
          anchors.push(candidates[best]);
      }
  }

  /** The base centre and the free floor cells a station may use. */
  private stationCandidates(baseZone?: ReservedZone): { base: Position3D; candidates: Position3D[] } {
      const forkliftColumns = new Set(this.forklifts.flatMap(fl => (fl.path || []).map(p => `${p.x},${p.z}`)));
      const inBaseZone = (x: number, z: number) =>
          !!baseZone && x >= baseZone.minX && x <= baseZone.maxX && z >= baseZone.minZ && z <= baseZone.maxZ;
      const base: Position3D = baseZone
          ? { x: Math.round((baseZone.minX + baseZone.maxX) / 2), y: 0, z: Math.round((baseZone.minZ + baseZone.maxZ) / 2) }
          : { x: 0, y: 0, z: 0 };
      const reachable = this.reachableFrom(base);

      const candidates: Position3D[] = [];
      for (let x = 0; x < this.size; x++) {
          for (let z = 0; z < this.size; z++) {
              if (inBaseZone(x, z) || forkliftColumns.has(`${x},${z}`)) continue;
              if (this.isBlocked(x, 0, z) || this.isBlocked(x, 1, z)) continue;
              if (reachable && !reachable.has(this.getIndex(x, 0, z))) continue;
              candidates.push({ x, y: 0, z });
          }
      }
      return { base, candidates };
  }

  /**
   * Greedy station placement for the battery. A pallet is covered when a drone leaving some
   * charger on a full battery can scan it and still reach the nearest charger with the safety
   * margin left (the allocation's energy check, Eq. 13 and 14). Each station goes to the cell
   * that covers the most pallets not yet covered (maximum coverage). Once all are covered, or no
   * cell covers more, each further station goes to the cell that most shortens the pallets' trips
   * to their nearest charger. Stations must be reachable from the base on one full battery.
   *
   * The placement is a prefix of the same greedy sequence for any `count`, so the first
   * `minChargingSites - 1` stations are the ones that cover every pallet.
   */
  private placeForCoverage(count: number, base: Position3D, baseZone: ReservedZone | undefined, candidates: Position3D[], coverage: StationCoverage) {
      const { capacity, drainMultiplier } = coverage;
      const battery = new BatteryModel(capacity, INSTANT_CHARGE_RATE, drainMultiplier);
      // Allocation's base position (the dock corner, see SimulationManager.runPathfinding)
      const pBase: Position3D = baseZone ? { x: baseZone.minX, y: baseZone.minY, z: baseZone.minZ } : { x: 0, y: 0, z: 0 };
      // Distance from the nearest dock of the base (drones leave from their own dock)
      const fromBase = (p: Position3D) => baseZone
          ? Math.abs(p.x - clamp(p.x, baseZone.minX, baseZone.maxX)) + Math.abs(p.y - baseZone.minY) + Math.abs(p.z - clamp(p.z, baseZone.minZ, baseZone.maxZ))
          : CostModel.distanceManhattan(p, pBase);
      const affordable = (outbound: number, back: number) =>
          CostModel.isAffordable(capacity, drainMultiplier * (MATH_CONSTANTS.BETA_FLY * MATH_CONSTANTS.GAMMA * (outbound + back) + MATH_CONSTANTS.BETA_HOVER * SCAN_TICKS));

      const targets = this.pallets.map(p => p.position);
      // Shortest leg to each pallet from a charger, and from each pallet to the nearest charger
      const outbound = targets.map(fromBase);
      const back = targets.map(t => CostModel.distanceManhattan(t, pBase));
      const covered = targets.map((_, i) => affordable(outbound[i], back[i]));
      let uncovered = covered.filter(c => !c).length;
      const sites = candidates.filter(c => battery.flightEnergy(fromBase(c)) < capacity);

      const placed: Position3D[] = [];
      if (uncovered === 0) this.minChargingSites = 1;
      let coverable = uncovered > 0; // false once no cell covers any of the remaining pallets
      while (placed.length < count || coverable) {
          let best = -1;
          let bestRank = [0, 0]; // [pallets newly covered, total trip shortening]
          for (let c = 0; c < sites.length; c++) {
              let gain = 0;
              let shortening = 0;
              for (let i = 0; i < targets.length; i++) {
                  const d = CostModel.distanceManhattan(sites[c], targets[i]);
                  if (d < back[i]) shortening += back[i] - d;
                  if (!covered[i] && affordable(Math.min(outbound[i], d), Math.min(back[i], d))) gain++;
              }
              if (gain > bestRank[0] || (gain === bestRank[0] && shortening > bestRank[1])) {
                  best = c;
                  bestRank = [gain, shortening];
              }
          }
          if (best < 0) {
              // No cell shortens any trip: spread the rest as without coverage
              const anchors = [base, ...placed];
              best = farthest(sites, anchors);
              if (best < 0) break; // no cell left
          }
          if (bestRank[0] === 0 && coverable) {
              coverable = false; // the rest cannot be covered
              if (placed.length >= count) break;
          }
          const [site] = sites.splice(best, 1);
          placed.push(site);
          for (let i = 0; i < targets.length; i++) {
              const d = CostModel.distanceManhattan(site, targets[i]);
              outbound[i] = Math.min(outbound[i], d);
              back[i] = Math.min(back[i], d);
              if (!covered[i] && affordable(outbound[i], back[i])) {
                  covered[i] = true;
                  uncovered--;
              }
          }
          if (uncovered === 0 && coverable) {
              this.minChargingSites = placed.length + 1;
              coverable = false;
          }
      }
      this.chargeStations = placed.slice(0, Math.max(0, count));
  }

  /** Free cells connected to `start` (flood fill), or null if `start` itself is blocked. */
  private reachableFrom(start: Position3D): Set<number> | null {
      if (this.isBlocked(start.x, start.y, start.z)) return null;
      const seen = new Set<number>([this.getIndex(start.x, start.y, start.z)]);
      const queue: Position3D[] = [start];
      const steps = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      while (queue.length > 0) {
          const { x, y, z } = queue.pop()!;
          for (const [dx, dy, dz] of steps) {
              const nx = x + dx, ny = y + dy, nz = z + dz;
              if (this.isBlocked(nx, ny, nz)) continue;
              const index = this.getIndex(nx, ny, nz);
              if (seen.has(index)) continue;
              seen.add(index);
              queue.push({ x: nx, y: ny, z: nz });
          }
      }
      return seen;
  }

  public clearZone(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                 if (x >= 0 && x < this.size && y >= 0 && y < this.size && z >= 0 && z < this.size) {
                    const idx = this.getIndex(x, y, z);
                    this.grid[idx] = 0;
                 }
            }
        }
    }
    // Rebuild list to sync with grid state
    this.obstacleList = [];
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        for (let z = 0; z < this.size; z++) {
           if (this.grid[this.getIndex(x, y, z)] === 1) {
             this.obstacleList.push({ x, y, z });
           }
        }
      }
    }
  }

  public isBlocked(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) return true;
    return this.grid[this.getIndex(x, y, z)] === 1;
  }

  public isPositionBlocked(p: Position3D): boolean {
    return this.isBlocked(p.x, p.y, p.z);
  }
}
