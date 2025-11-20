import { Position3D, GenerationTheme } from '../types';

export class World {
  size: number;
  obstacles: Set<string>;
  obstacleList: Position3D[];

  constructor(size: number = 12) {
    this.size = size;
    this.obstacles = new Set();
    this.obstacleList = [];
  }

  public setSize(size: number) {
    this.size = size;
  }

  public clear() {
    this.obstacles.clear();
    this.obstacleList = [];
  }

  public addObstacle(x: number, y: number, z: number) {
    // Boundary check
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) return;
    
    const key = `${x},${y},${z}`;
    if (!this.obstacles.has(key)) {
      this.obstacles.add(key);
      this.obstacleList.push({ x, y, z });
    }
  }

  public clearZone(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    const toRemove: string[] = [];
    
    // Identify obstacles to remove
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const key = `${x},${y},${z}`;
                if (this.obstacles.has(key)) {
                    toRemove.push(key);
                }
            }
        }
    }

    // Remove from Set
    toRemove.forEach(key => this.obstacles.delete(key));

    // Rebuild List (more efficient than splicing for bulk removal)
    if (toRemove.length > 0) {
        this.obstacleList = [];
        this.obstacles.forEach(key => {
            const [x, y, z] = key.split(',').map(Number);
            this.obstacleList.push({ x, y, z });
        });
    }
  }

  public isBlocked(x: number, y: number, z: number): boolean {
    // Out of bounds is considered blocked
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) return true;
    return this.obstacles.has(`${x},${y},${z}`);
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
    // City Logic: Streets and Buildings
    // Road spacing depends on grid size. For small grids, 3. For large, 4 or 5.
    const blockSize = this.size > 16 ? 4 : 3;
    
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        // Streets are empty channels
        const isStreet = (x % blockSize === 0) || (z % blockSize === 0);
        
        if (!isStreet) {
          // Building logic
          // Randomize building height, favoring taller buildings in the center
          const centerX = Math.abs(x - this.size / 2);
          const centerZ = Math.abs(z - this.size / 2);
          const distNormalized = (centerX + centerZ) / this.size;
          
          // Max height decreases as we move away from center
          const maxPossibleHeight = Math.floor(this.size * 0.9);
          const heightFactor = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
          
          let buildingHeight = Math.floor(maxPossibleHeight * (1 - distNormalized * 0.8) * heightFactor);
          buildingHeight = Math.max(1, buildingHeight); // At least 1 high

          // 10% chance of a park (missing building)
          if (Math.random() > 0.9) continue;

          // Build the skyscraper
          for (let y = 0; y < buildingHeight; y++) {
             this.addObstacle(x, y, z);
          }
        }
      }
    }
  }

  private generateTunnel() {
    const density = 0.7; // High density, start full and carve
    const mid = this.size / 2;
    
    for (let x = 0; x < this.size; x++) {
        for (let y = 0; y < this.size; y++) {
            for (let z = 0; z < this.size; z++) {
                // Main central hollowing
                const dist = Math.sqrt((x-mid)**2 + (y-mid)**2 + (z-mid)**2);
                if (dist < this.size / 4) continue; // Central room

                // Tunnels
                const isTunnelX = Math.abs(y - mid) < 2 && Math.abs(z - mid) < 2;
                const isTunnelY = Math.abs(x - mid) < 2 && Math.abs(z - mid) < 2;
                const isTunnelZ = Math.abs(x - mid) < 2 && Math.abs(y - mid) < 2;

                if (isTunnelX || isTunnelY || isTunnelZ) continue;

                // Random noise caves
                if (Math.random() > 0.2 && Math.random() < density) {
                    this.addObstacle(x, y, z);
                }
            }
        }
    }
  }

  private generateOpen() {
    // Just pillars
    const spacing = 4;
    for (let x = 0; x < this.size; x++) {
        for (let z = 0; z < this.size; z++) {
            if (x % spacing === 0 && z % spacing === 0) {
                // Pillar
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