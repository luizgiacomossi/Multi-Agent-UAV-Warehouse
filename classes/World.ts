import { Position3D, GenerationTheme } from '../types';

export class World {
  size: number;
  // Flattened grid storage: x + y*size + z*size*size
  // 0 = empty, 1 = obstacle
  grid: Uint8Array;
  obstacleList: Position3D[];

  constructor(size: number = 12) {
    this.size = size;
    this.grid = new Uint8Array(size * size * size);
    this.obstacleList = [];
  }

  public setSize(size: number) {
    this.size = size;
    // Re-initialize grid
    this.grid = new Uint8Array(size * size * size);
    this.obstacleList = [];
  }

  private getIndex(x: number, y: number, z: number): number {
    return x + this.size * (y + this.size * z);
  }

  public clear() {
    this.grid.fill(0);
    this.obstacleList = [];
  }

  public addObstacle(x: number, y: number, z: number) {
    // Boundary check
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) return;
    
    const idx = this.getIndex(x, y, z);
    
    if (this.grid[idx] === 0) {
      this.grid[idx] = 1;
      this.obstacleList.push({ x, y, z });
    }
  }

  public clearZone(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    // Rebuild obstacle list efficiently
    // First, mark zone as clear in grid
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

    // Rebuild list from grid (faster than splicing array repeatedly)
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
    // Out of bounds is considered blocked
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) return true;
    return this.grid[this.getIndex(x, y, z)] === 1;
  }

  public isPositionBlocked(p: Position3D): boolean {
    return this.isBlocked(p.x, p.y, p.z);
  }

  public generate(theme: string) {
    this.clear();

    switch (theme) {
      case GenerationTheme.CITY:
        this.generateCity();
        break;
      case GenerationTheme.TUNNEL:
        this.generateTunnel();
        break;
      case GenerationTheme.OPEN:
        this.generateOpen();
        break;
      default:
        this.generateRandom();
        break;
    }
  }

  private generateCity() {
    const blockSize = this.size > 16 ? 4 : 3;
    
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        // Streets
        const isStreet = (x % blockSize === 0) || (z % blockSize === 0);
        
        if (!isStreet) {
          const centerX = Math.abs(x - this.size / 2);
          const centerZ = Math.abs(z - this.size / 2);
          const distNormalized = (centerX + centerZ) / this.size;
          
          const maxPossibleHeight = Math.floor(this.size * 0.9);
          const heightFactor = Math.random() * 0.5 + 0.5; 
          
          let buildingHeight = Math.floor(maxPossibleHeight * (1 - distNormalized * 0.8) * heightFactor);
          buildingHeight = Math.max(1, buildingHeight); 

          if (Math.random() > 0.9) continue;

          for (let y = 0; y < buildingHeight; y++) {
             this.addObstacle(x, y, z);
          }
        }
      }
    }
  }

  private generateTunnel() {
    const density = 0.7; 
    const mid = this.size / 2;
    
    for (let x = 0; x < this.size; x++) {
        for (let y = 0; y < this.size; y++) {
            for (let z = 0; z < this.size; z++) {
                const dist = Math.sqrt((x-mid)**2 + (y-mid)**2 + (z-mid)**2);
                if (dist < this.size / 4) continue; 

                const isTunnelX = Math.abs(y - mid) < 2 && Math.abs(z - mid) < 2;
                const isTunnelY = Math.abs(x - mid) < 2 && Math.abs(z - mid) < 2;
                const isTunnelZ = Math.abs(x - mid) < 2 && Math.abs(y - mid) < 2;

                if (isTunnelX || isTunnelY || isTunnelZ) continue;

                if (Math.random() > 0.2 && Math.random() < density) {
                    this.addObstacle(x, y, z);
                }
            }
        }
    }
  }

  private generateOpen() {
    const spacing = 4;
    for (let x = 0; x < this.size; x++) {
        for (let z = 0; z < this.size; z++) {
            if (x % spacing === 0 && z % spacing === 0) {
                const height = Math.floor(Math.random() * (this.size - 2)) + 2;
                for(let y=0; y<height; y++) {
                    this.addObstacle(x, y, z);
                }
            }
        }
    }
  }

  private generateRandom() {
    const density = 0.15;
    for (let x = 0; x < this.size; x++) {
        for (let y = 0; y < this.size; y++) {
            for (let z = 0; z < this.size; z++) {
                if (Math.random() < density) {
                    this.addObstacle(x, y, z);
                }
            }
        }
    }
  }
}