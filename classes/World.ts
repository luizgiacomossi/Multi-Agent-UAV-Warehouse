import { Position3D, Pallet, Forklift, TaskPriorityMode } from '../types';
import { WorldGenerator, ReservedZone } from './WorldGenerator';
import { Warehouse } from './Warehouse';

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

    public generate(theme: string, reservedZone?: ReservedZone, totalTasks: number = 50, numForklifts: number = 3, priorityMode: TaskPriorityMode = 'mixed') {
        WorldGenerator.generate(this, theme, reservedZone, totalTasks, numForklifts, priorityMode);
    }

  /**
   * Places `count` charging stations on floor cells, spread over the map: each one is the free cell
   * farthest from the base and from the stations already placed (farthest-point sampling, so the
   * layout is deterministic). Cells inside the base zone, under forklift lanes, or not reachable
   * from the base are skipped.
   */
  public generateStations(count: number, baseZone?: ReservedZone) {
      this.chargeStations = [];
      if (count <= 0) return;

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

      const flatDistance = (a: Position3D, b: Position3D) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      const anchors: Position3D[] = [base];
      while (this.chargeStations.length < count) {
          let best: Position3D | null = null;
          let bestDistance = 0;
          for (const cell of candidates) {
              const distance = Math.min(...anchors.map(a => flatDistance(cell, a)));
              if (distance > bestDistance) {
                  best = cell;
                  bestDistance = distance;
              }
          }
          if (!best) break; // no free floor cell left
          this.chargeStations.push(best);
          anchors.push(best);
      }
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
