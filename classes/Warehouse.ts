import { Position3D } from '../types';

export class Warehouse {
  position: Position3D; // Bottom-left corner
  capacity: number;
  baseSize: number; // Width/Depth in blocks
  height: number = 1;

  constructor(capacity: number, position: Position3D = { x: 0, y: 0, z: 0 }) {
    this.capacity = capacity;
    this.position = position;
    // Calculate grid size needed (e.g., 9 drones need a 3x3 grid)
    this.baseSize = Math.ceil(Math.sqrt(capacity));
  }

  public getSpawnLocation(index: number): Position3D {
    if (index >= this.capacity) {
      // Fallback if we somehow exceed capacity, stack them or place nearby
      return { 
        x: this.position.x, 
        y: this.position.y + 1, 
        z: this.position.z 
      };
    }

    const row = Math.floor(index / this.baseSize);
    const col = index % this.baseSize;

    return {
      x: this.position.x + row,
      y: this.position.y, // On the "floor" of the warehouse
      z: this.position.z + col
    };
  }

  public getBounds() {
    return {
      minX: this.position.x,
      minY: this.position.y,
      minZ: this.position.z,
      maxX: this.position.x + this.baseSize + 1, // +1 for padding
      maxY: this.position.y + 5, // Clear air space above
      maxZ: this.position.z + this.baseSize + 1 // +1 for padding
    };
  }
}