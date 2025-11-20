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
    const centerX = Math.floor(this.size / 2);
    const centerZ = Math.floor(this.size / 2);

    // Road Config
    const blockSize = 4; // Voxels per building block
    const roadWidth = 1;
    
    // Height Config
    const maxSkyline = Math.floor(this.size * 0.9);
    
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        
        // 1. Define Streets (Grid pattern with a wide central avenue)
        const isMainAveX = Math.abs(x - centerX) <= 1; // Wide avenue X
        const isMainAveZ = Math.abs(z - centerZ) <= 1; // Wide avenue Z
        
        // Regular grid streets
        // We shift the modulo so streets fall between blocks
        const isStreetX = (x % (blockSize + roadWidth)) === 0;
        const isStreetZ = (z % (blockSize + roadWidth)) === 0;

        if (isMainAveX || isMainAveZ || isStreetX || isStreetZ) {
            // Keep streets clear
            continue;
        }

        // 2. Determine Block Identity
        // We use the top-left coordinate of the block to determine the "building" properties
        // so the whole block behaves as one unit.
        const blockX = Math.floor(x / (blockSize + roadWidth));
        const blockZ = Math.floor(z / (blockSize + roadWidth));
        
        // Simple hash for block properties
        const blockSeed = Math.abs(Math.sin(blockX * 12.9898 + blockZ * 78.233)); 

        // 3. Zoning (Parks & Plazas)
        if (blockSeed > 0.90) {
            // Park/Plaza - leave empty or very low
            if (blockSeed > 0.95) {
                 // Fountain/Statue in middle of plaza?
                 if ((x % (blockSize+roadWidth)) === 2 && (z % (blockSize+roadWidth)) === 2) {
                     this.addObstacle(x, 0, z);
                     this.addObstacle(x, 1, z);
                 }
            }
            continue; 
        }

        // 4. Calculate Building Height (Skyline)
        // Distance from center (Euclidean)
        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2));
        const maxDist = this.size * 0.75;
        
        // Gaussian-ish falloff: Center is high, edges are low
        let heightFactor = Math.max(0, 1 - (dist / maxDist));
        heightFactor = Math.pow(heightFactor, 1.5); // Sharpen the peak

        // Add per-block random variation so neighbors aren't identical
        const heightVariation = 0.7 + (blockSeed * 0.6); // 0.7x to 1.3x
        
        let buildingHeight = Math.floor(maxSkyline * heightFactor * heightVariation);
        
        // Minimum height for valid buildings
        buildingHeight = Math.max(2, buildingHeight);
        // Clamp to world
        buildingHeight = Math.min(this.size - 1, buildingHeight);

        // 5. Building Shape & Architecture
        
        // Check relative position within the block (0 to blockSize-1)
        const localX = (x % (blockSize + roadWidth)) - 1;
        const localZ = (z % (blockSize + roadWidth)) - 1;
        
        // "Setbacks" - Taller buildings get thinner at top
        // If building is tall, upper 30% is thinner
        const isEdgeOfBlock = localX === 0 || localZ === 0 || localX === blockSize-1 || localZ === blockSize-1;
        
        for (let y = 0; y < buildingHeight; y++) {
            // Logic for setbacks
            if (buildingHeight > 10 && y > buildingHeight * 0.7) {
                if (isEdgeOfBlock) continue; // Taper top
            }

            // Logic for "Twin Towers" or gaps (randomly applied to some blocks)
            if (blockSeed < 0.2 && buildingHeight > 8) {
                 // Split block in half
                 if (localX === Math.floor(blockSize/2)) continue;
            }

            this.addObstacle(x, y, z);
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