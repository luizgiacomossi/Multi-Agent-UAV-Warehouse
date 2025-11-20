
import { Agent, Position3D, ENERGY_COSTS } from '../types';
import { World } from './World';

export class Drone implements Agent {
  id: string;
  name: string;
  start: Position3D;
  goal: Position3D;
  color: string;
  path: Position3D[];
  status: 'idle' | 'moving' | 'finished' | 'blocked' | 'destroyed' | 'out_of_battery';
  deliveryTimes?: number[];
  maxBattery: number;
  destructionTime?: number;

  constructor(id: string, name: string, color: string, maxBattery: number = 50) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.start = { x: 0, y: 0, z: 0 };
    this.goal = { x: 0, y: 0, z: 0 };
    this.path = [];
    this.status = 'idle';
    this.deliveryTimes = [];
    this.maxBattery = maxBattery;
  }

  clone(): Drone {
    const d = new Drone(this.id, this.name, this.color, this.maxBattery);
    d.start = { ...this.start };
    d.goal = { ...this.goal };
    d.path = this.path.map(p => ({ ...p }));
    d.status = this.status;
    d.deliveryTimes = this.deliveryTimes ? [...this.deliveryTimes] : [];
    d.destructionTime = this.destructionTime;
    return d;
  }

  setMission(start: Position3D, goal: Position3D) {
    this.start = { ...start };
    this.goal = { ...goal };
    this.path = [];
    this.status = 'idle';
    this.deliveryTimes = [];
    this.destructionTime = undefined;
  }

  setPath(path: Position3D[], deliveryTimes?: number[]) {
    this.path = path;
    this.deliveryTimes = deliveryTimes || [];
    if (path.length > 0) {
        this.status = 'idle'; 
    } else {
        this.status = 'blocked';
    }
  }

  /**
   * Returns the drone's physical state at a given time tick.
   * Handles battery logic (including recharging at base), stopping, destruction, falling physics,
   * and package visibility (pick up at base, drop at goal).
   */
  getSnapshotAt(tick: number, chargeStations: Position3D[], batteryEnabled: boolean = true) {
    // 1. Check for Collision Destruction
    if (this.destructionTime !== undefined && tick >= this.destructionTime) {
         const crashPos = this.path[Math.min(tick, this.path.length-1)] || this.start;
         return {
             position: crashPos,
             battery: 0,
             isDestroyed: true,
             isDeadBattery: false,
             isRecharging: false,
             hasPackage: false
         };
    }

    // 2. Calculate State (Battery & Package) up to this tick
    const { battery, hasPackage, isRecharging, deathTick } = this.calculateStateAt(tick, chargeStations, batteryEnabled);

    // 3. Check for Battery Death (Falling)
    if (batteryEnabled && deathTick !== undefined && tick >= deathTick) {
        // Physics: FALLING LOGIC
        const deathPos = this.path[Math.min(deathTick, this.path.length - 1)];
        const timeSinceDeath = tick - deathTick;
        
        // Fall speed logic
        const fallY = Math.max(0, deathPos.y - (timeSinceDeath * 0.8)); 
        
        const currentPos = {
            x: deathPos.x,
            y: fallY,
            z: deathPos.z
        };

        return {
            position: currentPos,
            battery: 0,
            isDestroyed: false,
            isDeadBattery: true,
            isRecharging: false,
            hasPackage: hasPackage // Falls with the package
        };
    }

    // 4. Normal Operation
    const effectiveTick = Math.min(tick, this.path.length - 1);
    const position = (this.path.length > 0) ? this.path[effectiveTick] : this.start;

    return {
        position,
        battery,
        isDestroyed: false,
        isDeadBattery: false,
        isRecharging,
        hasPackage
    };
  }

  /**
   * Iterates through the path to calculate battery drain, recharges, and package state.
   */
  private calculateStateAt(tick: number, chargeStations: Position3D[], batteryEnabled: boolean) {
      if (!this.path || this.path.length === 0) {
          return { battery: this.maxBattery, hasPackage: true, isRecharging: false, deathTick: undefined };
      }

      let battery = this.maxBattery;
      let hasPackage = true; // Starts with package
      let deathTick: number | undefined = undefined;
      let isRecharging = false;

      const maxPathIndex = this.path.length - 1;
      const deliverySet = new Set(this.deliveryTimes || []);

      for (let i = 0; i <= tick && i <= maxPathIndex; i++) {
          // -- Package Logic --
          
          // If this tick matches a delivery time, we drop the package
          if (deliverySet.has(i)) {
              hasPackage = false;
          }

          // -- Movement & Battery Logic --
          if (i > 0) {
              const prev = this.path[i-1];
              const curr = this.path[i];
              const isWaiting = this.isWaiting(prev, curr);
              
              // Check for Base/Station Recharge
              // We recharge if we are at a station OR at the starting base
              const atBase = (curr.x === this.start.x && curr.y === this.start.y && curr.z === this.start.z);
              const atStation = this.isAtStation(curr, chargeStations);

              if ((atBase || atStation) && isWaiting) {
                  // Recharging
                  if (batteryEnabled) battery = this.maxBattery; 
                  
                  // If at base and waiting, and we don't have a package, we pick one up (Reloading)
                  if (atBase && !hasPackage) {
                      hasPackage = true; 
                  }
                  
                  // Set flag for current tick only
                  if (i === tick) isRecharging = true;
              } else {
                  // Consuming
                  if (batteryEnabled) {
                      const cost = isWaiting ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;
                      battery -= cost;
                  }
              }

              // Death Check
              if (batteryEnabled && battery <= 0 && deathTick === undefined) {
                  deathTick = i;
                  // We don't break here because we need to see if the requested tick is later
              }
          }
      }

      return { battery: Math.max(0, battery), hasPackage, isRecharging, deathTick };
  }

  private isAtStation(pos: Position3D, stations: Position3D[]): boolean {
      return stations.some(s => s.x === pos.x && s.y === pos.y && s.z === pos.z);
  }

  private isWaiting(prev: Position3D, curr: Position3D): boolean {
      return prev.x === curr.x && prev.y === curr.y && prev.z === curr.z;
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
      for (let i = this.drones.length; i < count; i++) {
        this.drones.push(new Drone(`drone-${i}`, `Drone ${i + 1}`, this.colors[i % this.colors.length], maxBattery));
      }
    } else if (count < this.drones.length) {
      this.drones = this.drones.slice(0, count);
    }
    this.drones.forEach(d => d.maxBattery = maxBattery);
  }

  initializeScenario(world: World, maxAltitude: number = 24) {
    const occupied = new Set<string>();
    const posKey = (p: Position3D) => `${p.x},${p.y},${p.z}`;
    const warehouse = world.warehouse;
    
    // Constraint: Goals cannot be higher than maxAltitude
    const yLimit = Math.min(world.size - 1, maxAltitude);

    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i];
      let start: Position3D;
      let goal: Position3D;
      let attempts = 0;

      if (warehouse) {
        start = warehouse.getSpawnLocation(i);
        occupied.add(posKey(start));
      } else {
        while (attempts < 1000) {
          start = {
            x: Math.floor(Math.random() * world.size),
            y: Math.floor(Math.random() * yLimit),
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

      attempts = 0;
      const minDist = Math.max(4, Math.floor(world.size / 3));
      
      while (attempts < 2000) {
        goal = {
          x: Math.floor(Math.random() * world.size),
          y: Math.floor(Math.random() * yLimit),
          z: Math.floor(Math.random() * world.size)
        };
        const key = posKey(goal);
        const dist = Math.abs(start!.x - goal.x) + Math.abs(start!.y - goal.y) + Math.abs(start!.z - goal.z);

        const inWarehouse = warehouse ? 
            (goal.x >= warehouse.position.x && goal.x < warehouse.position.x + warehouse.baseSize && 
             goal.z >= warehouse.position.z && goal.z < warehouse.position.z + warehouse.baseSize && 
             goal.y < 3) 
            : false;

        if (!world.isBlocked(goal.x, goal.y, goal.z) && 
            !occupied.has(key) && 
            dist > minDist && 
            !inWarehouse &&
            !(start!.x === goal.x && start!.y === goal.y && start!.z === goal.z)
            ) {
          occupied.add(key); 
          break;
        }
        attempts++;
      }

      if (attempts >= 2000) goal = { ...start! };
      drone.setMission(start!, goal!);
    }
  }
}
