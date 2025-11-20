import { Position3D } from '../types';
import { WorldGenerator } from './WorldGenerator';
import { Warehouse } from './Warehouse';

export class World {
  size: number;
  grid: Uint8Array;
  obstacleList: Position3D[];
  chargeStations: Position3D[];
  warehouse: Warehouse | null = null;

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
  }

  private getIndex(x: number, y: number, z: number): number {
    return x + this.size * (y + this.size * z);
  }

  public clear() {
    this.grid.fill(0);
    this.obstacleList = [];
    this.chargeStations = [];
    this.warehouse = null;
  }

  public setupWarehouse(capacity: number) {
      this.warehouse = new Warehouse(capacity, { x: 0, y: 0, z: 0 });
      
      // Automatically clear the zone required by the warehouse
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

  public generate(theme: string) {
      WorldGenerator.generate(this, theme);
  }

  public generateStations(count: number) {
      this.chargeStations = [];
      let placed = 0;
      let attempts = 0;
      while(placed < count && attempts < 1000) {
          const x = Math.floor(Math.random() * this.size);
          const z = Math.floor(Math.random() * this.size);
          
          let y = 0;
          for(let h = this.size - 1; h >= 0; h--) {
              if (this.isBlocked(x, h, z)) {
                  y = h + 1;
                  break;
              }
          }

          if (y < this.size && !this.isBlocked(x, y, z)) {
              const exists = this.chargeStations.some(s => s.x === x && s.y === y && s.z === z);
              if (!exists) {
                  this.addChargeStation(x, y, z);
                  placed++;
              }
          }
          attempts++;
      }
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