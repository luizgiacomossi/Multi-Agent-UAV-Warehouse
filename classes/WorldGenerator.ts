import { World } from './World';
import { GenerationTheme } from '../types';

export class WorldGenerator {
  static generate(world: World, theme: string) {
    world.clear();

    switch (theme) {
      case GenerationTheme.CITY:
        this.generateCity(world);
        break;
      case GenerationTheme.TUNNEL:
        this.generateTunnel(world);
        break;
      case GenerationTheme.OPEN:
        this.generateOpen(world);
        break;
      default:
        this.generateRandom(world);
        break;
    }
  }

  private static generateCity(world: World) {
    const centerX = Math.floor(world.size / 2);
    const centerZ = Math.floor(world.size / 2);
    const blockSize = 4;
    const roadWidth = 1;
    const maxSkyline = Math.floor(world.size * 0.9);

    for (let x = 0; x < world.size; x++) {
      for (let z = 0; z < world.size; z++) {
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
             world.addObstacle(x, 0, z);
             world.addObstacle(x, 1, z);
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
            if (buildingHeight > 10 && y > buildingHeight * 0.7 && isEdgeOfBlock) continue;
            if (blockSeed < 0.2 && buildingHeight > 8 && localX === Math.floor(blockSize/2)) continue;
            world.addObstacle(x, y, z);
        }
      }
    }
  }

  private static generateTunnel(world: World) {
    const density = 0.7; 
    const mid = world.size / 2;
    
    for (let x = 0; x < world.size; x++) {
        for (let y = 0; y < world.size; y++) {
            for (let z = 0; z < world.size; z++) {
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

  private static generateOpen(world: World) {
    const spacing = 4;
    for (let x = 0; x < world.size; x++) {
        for (let z = 0; z < world.size; z++) {
            if (x % spacing === 0 && z % spacing === 0) {
                const height = Math.floor(Math.random() * (world.size - 2)) + 2;
                for(let y=0; y<height; y++) {
                    world.addObstacle(x, y, z);
                }
            }
        }
    }
  }

  private static generateRandom(world: World) {
    const density = 0.15;
    for (let x = 0; x < world.size; x++) {
        for (let y = 0; y < world.size; y++) {
            for (let z = 0; z < world.size; z++) {
                if (Math.random() < density) {
                    world.addObstacle(x, y, z);
                }
            }
        }
    }
  }
}