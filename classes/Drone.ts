
import { Agent, Position3D } from '../types';
import { World } from './World';

export class Drone implements Agent {
  id: string;
  name: string;
  start: Position3D;
  goal: Position3D;
  color: string;
  path: Position3D[];
  status: 'idle' | 'moving' | 'finished' | 'blocked' | 'out_of_battery';
  deliveryTime?: number;
  maxBattery: number;

  constructor(id: string, name: string, color: string, maxBattery: number = 50) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.start = { x: 0, y: 0, z: 0 };
    this.goal = { x: 0, y: 0, z: 0 };
    this.path = [];
    this.status = 'idle';
    this.deliveryTime = undefined;
    this.maxBattery = maxBattery;
  }

  setMission(start: Position3D, goal: Position3D) {
    this.start = { ...start };
    this.goal = { ...goal };
    this.path = [];
    this.status = 'idle';
    this.deliveryTime = undefined;
  }

  setPath(path: Position3D[], deliveryTick?: number) {
    this.path = path;
    
    if (path.length > 0) {
        // If a specific delivery time is provided (e.g. midpoint of round trip), use it.
        // Otherwise, default to the end of the path (single trip).
        this.deliveryTime = deliveryTick !== undefined ? deliveryTick : path.length - 1;
        
        // Status is usually updated by the Planner immediately after, 
        // but we default to idle/moving here.
        this.status = 'idle'; 
    } else {
        this.deliveryTime = undefined;
        this.status = 'blocked';
    }
  }
}

export class Swarm {
  drones: Drone[];
  private colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];

  constructor(count: number) {
    this.drones = [];
    this.resize(count, 50);
  }

  resize(count: number, maxBattery: number) {
    if (count > this.drones.length) {
      // Add new
      for (let i = this.drones.length; i < count; i++) {
        this.drones.push(new Drone(`drone-${i}`, `Drone ${i + 1}`, this.colors[i % this.colors.length], maxBattery));
      }
    } else if (count < this.drones.length) {
      // Remove
      this.drones = this.drones.slice(0, count);
    }
    
    // Update battery for all
    this.drones.forEach(d => d.maxBattery = maxBattery);
  }

  initializeScenario(world: World, deployFromBase: boolean = false) {
    const occupied = new Set<string>();
    const posKey = (p: Position3D) => `${p.x},${p.y},${p.z}`;

    // Calculate Base Grid dimensions if needed
    const baseSide = Math.ceil(Math.sqrt(this.drones.length));

    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i];
      let start: Position3D;
      let goal: Position3D;
      let attempts = 0;

      // 1. Find Start
      if (deployFromBase) {
        // Deterministic Base Grid placement (0,0,0) expanding outwards
        // x and z vary, y is always 0 (ground)
        const row = Math.floor(i / baseSide);
        const col = i % baseSide;
        // Start at 1,1 to avoid exact edge if desired, or 0,0
        start = { x: row, y: 0, z: col };
        
        // Fallback if base location is somehow blocked (should be cleared by App)
        if (world.isBlocked(start.x, start.y, start.z)) {
             console.warn(`Base position ${start.x},${start.y},${start.z} is blocked!`);
        }
        occupied.add(posKey(start));
      } else {
        // Random Start
        while (attempts < 1000) {
          start = {
            x: Math.floor(Math.random() * world.size),
            y: Math.floor(Math.random() * world.size),
            z: Math.floor(Math.random() * world.size)
          };
          const key = posKey(start);
          if (!world.isBlocked(start.x, start.y, start.z) && !occupied.has(key)) {
            occupied.add(key);
            break;
          }
          attempts++;
        }
      }

      // 2. Find Goal
      attempts = 0;
      const minDist = Math.max(4, Math.floor(world.size / 3));
      
      while (attempts < 2000) {
        goal = {
          x: Math.floor(Math.random() * world.size),
          y: Math.floor(Math.random() * world.size),
          z: Math.floor(Math.random() * world.size)
        };
        const key = posKey(goal);
        
        const dist = Math.abs(start!.x - goal.x) + Math.abs(start!.y - goal.y) + Math.abs(start!.z - goal.z);

        if (!world.isBlocked(goal.x, goal.y, goal.z) && 
            !occupied.has(key) && 
            dist > minDist && 
            // If deploying from base, try to ensure goal isn't IN the base
            (!deployFromBase || (goal.x > baseSide || goal.z > baseSide || goal.y > 2))
            ) {
          occupied.add(key); 
          break;
        }
        attempts++;
      }

      if (attempts >= 2000) {
        console.warn(`Could not find valid mission for ${drone.name}`);
        // Fallback: just sit still
        goal = { ...start! };
      }

      drone.setMission(start!, goal!);
    }
  }

  getAgents(): Agent[] {
    return this.drones; // Drone implements Agent
  }
}
