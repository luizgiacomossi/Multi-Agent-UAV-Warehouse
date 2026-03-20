import { World } from './World';
import { GenerationTheme, Position3D, TaskPriorityMode } from '../types';
import { WAREHOUSE, DEFAULT_MAX_ALTITUDE } from '../SimulationConfig';

export interface ReservedZone {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export class WorldGenerator {
  private static getPalletWeight(priorityMode: TaskPriorityMode): number {
    return priorityMode === 'uniform' ? 100 : Math.floor(Math.random() * 50) + 10;
  }

  static generate(world: World, theme: string, reservedZone?: ReservedZone, totalTasks: number = 50, numForklifts: number = 3, priorityMode: TaskPriorityMode = 'mixed') {
    world.clear();

    switch (theme) {
      case GenerationTheme.CITY:
        this.generateCity(world, reservedZone);
        break;
      case GenerationTheme.TUNNEL:
        this.generateTunnel(world, reservedZone);
        break;
      case GenerationTheme.OPEN:
        this.generateOpen(world, reservedZone);
        break;
      case 'Warehouse':
        this.generateWarehouse(world, reservedZone, totalTasks, numForklifts, priorityMode);
        break;
      default:
        this.generateRandom(world, reservedZone);
        break;
    }

    // Ensure all non-Warehouse themes strictly spawn the exact totalTasks requested
    if (theme !== 'Warehouse') {
        world.pallets = [];
        let attempts = 0;
        // Find safe spawn points across the generated obstacles
        while (world.pallets.length < totalTasks && attempts < totalTasks * 20) {
             const x = Math.floor(Math.random() * world.size);
             const z = Math.floor(Math.random() * world.size);
             const y = Math.floor(Math.random() * Math.min(world.size - 1, 15));
             
             if (!this.isRestricted(x, y, z, reservedZone) && !world.isBlocked(x, y, z)) {
                 world.pallets.push({
                     id: `PLT-${this.generateUUID()}`,
                     position: { x, y, z },
                     weight: this.getPalletWeight(priorityMode),
                     payload_type: Math.random() > 0.5 ? 'camera' : 'rfid'
                 });
             }
             attempts++;
        }
    }
  }

  private static isRestricted(x: number, y: number, z: number, zone?: ReservedZone): boolean {
      if (!zone) return false;
      return x >= zone.minX && x <= zone.maxX &&
             y >= zone.minY && y <= zone.maxY &&
             z >= zone.minZ && z <= zone.maxZ;
  }

  // Simple pseudo-random UUID generator for Pallets
  private static generateUUID(): string {
      return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  private static generateWarehouse(world: World, reservedZone?: ReservedZone, totalTasks: number = 50, numForklifts: number = 3, priorityMode: TaskPriorityMode = 'mixed') {
      const aisleWidth = WAREHOUSE.AISLE_WIDTH;
      const rackDepth  = WAREHOUSE.RACK_HEIGHT;  // depth of each rack cluster (voxels)
      const maxRackHeight = Math.min(world.size - 2, DEFAULT_MAX_ALTITUDE);

      // Clear existing pallets just in case
      world.pallets = [];

      for (let x = 0; x < world.size; x++) {
          for (let z = 0; z < world.size; z++) {
              
              // Skip the base/charging zone
              if (this.isRestricted(x, 0, z, reservedZone)) continue;

              // Determine if this cell is an aisle or a rack
              const isAisleX = (x % (rackDepth + aisleWidth)) < aisleWidth;
              const isAisleZ = (z % (rackDepth + aisleWidth)) < aisleWidth;

              // If it's not an aisle in either dimension, it's a rack location
              if (!isAisleX && !isAisleZ) {
                  // Build a vertical stack of pallets
                  const height = Math.floor(Math.random() * maxRackHeight) + 1;
                  
                  for (let y = 0; y < height; y++) {
                      if (this.isRestricted(x, y, z, reservedZone)) continue;
                      
                      world.addObstacle(x, y, z); // Physically block the pathfinder
                      
                      // Register a logical Pallet here
                      world.pallets.push({
                          id: `PLT-${this.generateUUID()}`,
                          position: { x, y, z },
                          weight: this.getPalletWeight(priorityMode),
                          payload_type: Math.random() > 0.5 ? 'camera' : 'rfid'
                      });
                  }
              }
          }
      }

      // Truncate to the exact requested totalTasks randomly
      if (world.pallets.length > totalTasks) {
          // simple fisher-yates shuffle and slice
          const shuffled = [...world.pallets].sort(() => 0.5 - Math.random());
          world.pallets = shuffled.slice(0, totalTasks);
      }

      // Generate moving Dynamic Forklifts inside aisles
      world.forklifts = [];
      const MAX_TICKS = 2000;
      let forkliftCount = 0;
      
      // Determine what Z range is safe
      const zMin = reservedZone ? (reservedZone.maxZ + 1) : 2;
      const zMax = world.size - 2;

      for (let x = 2; x < world.size - 2; x++) {
          if (forkliftCount >= numForklifts) break;
          const isAisleX = (x % (rackDepth + aisleWidth)) < aisleWidth;
          
          if (isAisleX && x % 4 === 0) {
              const path: Position3D[] = [];
              let cz = zMin;
              let dir = 1;
              for (let t = 0; t < MAX_TICKS; t++) {
                  path.push({ x, y: 0, z: cz });
                  cz += dir;
                  if (cz >= zMax || cz <= zMin) dir *= -1;
              }
              world.forklifts.push({
                  id: `FL-${forkliftCount}`,
                  name: `Forklift ${forkliftCount + 1}`,
                  path,
                  color: '#fbbf24' // Amber
              });
              forkliftCount++;
          }
      }
  }

  private static generateCity(world: World, reservedZone?: ReservedZone) {
    const centerX = Math.floor(world.size / 2);
    const centerZ = Math.floor(world.size / 2);
    const blockSize = 4;
    const roadWidth = 1;
    const maxSkyline = Math.floor(world.size * 0.9);

    for (let x = 0; x < world.size; x++) {
      for (let z = 0; z < world.size; z++) {
        // Check restriction
        if (this.isRestricted(x, 0, z, reservedZone)) continue;

        // Streets
        const isMainAveX = Math.abs(x - centerX) <= 1;
        const isMainAveZ = Math.abs(z - centerZ) <= 1;
        const isStreetX = (x % (blockSize + roadWidth)) === 0;
        const isStreetZ = (z % (blockSize + roadWidth)) === 0;

        if (isMainAveX || isMainAveZ || isStreetX || isStreetZ) continue;

        // Block Logic
        const blockX = Math.floor(x / (blockSize + roadWidth));
        const blockZ = Math.floor(z / (blockSize + roadWidth));
        const blockSeed = Math.abs(Math.sin(blockX * 12.9898 + blockZ * 78.233));

        if (blockSeed > 0.90) {
           // Parks
           if (blockSeed > 0.95 && (x % (blockSize+roadWidth)) === 2 && (z % (blockSize+roadWidth)) === 2) {
             if (!this.isRestricted(x, 0, z, reservedZone)) world.addObstacle(x, 0, z);
             if (!this.isRestricted(x, 1, z, reservedZone)) world.addObstacle(x, 1, z);
           }
           continue;
        }

        // Height Calc
        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2));
        const maxDist = world.size * 0.75;
        let heightFactor = Math.pow(Math.max(0, 1 - (dist / maxDist)), 1.5);
        const heightVariation = 0.7 + (blockSeed * 0.6);
        let buildingHeight = Math.floor(maxSkyline * heightFactor * heightVariation);
        buildingHeight = Math.max(2, Math.min(world.size - 1, buildingHeight));

        // Building Architecture
        const localX = (x % (blockSize + roadWidth)) - 1;
        const localZ = (z % (blockSize + roadWidth)) - 1;
        const isEdgeOfBlock = localX === 0 || localZ === 0 || localX === blockSize-1 || localZ === blockSize-1;

        for (let y = 0; y < buildingHeight; y++) {
            if (this.isRestricted(x, y, z, reservedZone)) continue;

            if (buildingHeight > 10 && y > buildingHeight * 0.7 && isEdgeOfBlock) continue;
            if (blockSeed < 0.2 && buildingHeight > 8 && localX === Math.floor(blockSize/2)) continue;
            world.addObstacle(x, y, z);
        }
      }
    }
  }

  private static generateTunnel(world: World, reservedZone?: ReservedZone) {
    const density = 0.7; 
    const mid = world.size / 2;
    
    for (let x = 0; x < world.size; x++) {
        for (let y = 0; y < world.size; y++) {
            for (let z = 0; z < world.size; z++) {
                if (this.isRestricted(x, y, z, reservedZone)) continue;

                const dist = Math.sqrt((x-mid)**2 + (y-mid)**2 + (z-mid)**2);
                if (dist < world.size / 4) continue; 

                const isTunnelX = Math.abs(y - mid) < 2 && Math.abs(z - mid) < 2;
                const isTunnelY = Math.abs(x - mid) < 2 && Math.abs(z - mid) < 2;
                const isTunnelZ = Math.abs(x - mid) < 2 && Math.abs(y - mid) < 2;

                if (isTunnelX || isTunnelY || isTunnelZ) continue;

                if (Math.random() > 0.2 && Math.random() < density) {
                    world.addObstacle(x, y, z);
                }
            }
        }
    }
  }

  private static generateOpen(world: World, reservedZone?: ReservedZone) {
    const spacing = 4;
    for (let x = 0; x < world.size; x++) {
        for (let z = 0; z < world.size; z++) {
            if (x % spacing === 0 && z % spacing === 0) {
                const height = Math.floor(Math.random() * (world.size - 2)) + 2;
                for(let y=0; y<height; y++) {
                    if (!this.isRestricted(x, y, z, reservedZone)) {
                        world.addObstacle(x, y, z);
                    }
                }
            }
        }
    }
  }

  private static generateRandom(world: World, reservedZone?: ReservedZone) {
    const density = 0.15;
    for (let x = 0; x < world.size; x++) {
        for (let y = 0; y < world.size; y++) {
            for (let z = 0; z < world.size; z++) {
                if (this.isRestricted(x, y, z, reservedZone)) continue;

                if (Math.random() < density) {
                    world.addObstacle(x, y, z);
                }
            }
        }
    }
  }
}
