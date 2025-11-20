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
  deliveryTime?: number;
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
    this.deliveryTime = undefined;
    this.maxBattery = maxBattery;
  }

  clone(): Drone {
    const d = new Drone(this.id, this.name, this.color, this.maxBattery);
    d.start = { ...this.start };
    d.goal = { ...this.goal };
    d.path = this.path.map(p => ({ ...p }));
    d.status = this.status;
    d.deliveryTime = this.deliveryTime;
    d.destructionTime = this.destructionTime;
    return d;
  }

  setMission(start: Position3D, goal: Position3D) {
    this.start = { ...start };
    this.goal = { ...goal };
    this.path = [];
    this.status = 'idle';
    this.deliveryTime = undefined;
    this.destructionTime = undefined;
  }

  setPath(path: Position3D[], deliveryTick?: number) {
    this.path = path;
    if (path.length > 0) {
        this.deliveryTime = deliveryTick !== undefined ? deliveryTick : path.length - 1;
        this.status = 'idle'; 
    } else {
        this.deliveryTime = undefined;
        this.status = 'blocked';
    }
  }

  /**
   * Returns the drone's physical state at a given time tick.
   * Handles battery logic, stopping, and destruction.
   */
  getSnapshotAt(tick: number, chargeStations: Position3D[]) {
    const stopTick = this.calculateStopTick(chargeStations);
    
    const isDestroyed = this.destructionTime !== undefined && tick >= this.destructionTime;
    const isDeadBattery = stopTick !== undefined && stopTick < (this.path.length - 1) && tick >= stopTick;
    
    const effectiveTick = Math.min(tick, stopTick ?? (this.path.length - 1));
    const position = (this.path.length > 0) ? this.path[effectiveTick] : this.start;
    
    const battery = this.calculateBatteryAt(effectiveTick, chargeStations);
    const isRecharging = this.checkRecharging(effectiveTick, chargeStations);

    return {
        position,
        battery,
        isDestroyed,
        isDeadBattery,
        isRecharging,
        hasPackage: !isDestroyed && (this.deliveryTime === undefined || tick < this.deliveryTime)
    };
  }

  private calculateStopTick(chargeStations: Position3D[]): number {
      let stopTick = this.path.length - 1;
      
      if (this.destructionTime !== undefined) {
          stopTick = Math.min(stopTick, this.destructionTime);
      }
      
      const batteryDeathTick = this.getBatteryDeathTick(chargeStations);
      if (batteryDeathTick !== undefined) {
          stopTick = Math.min(stopTick, batteryDeathTick);
      }
      
      return Math.max(0, stopTick);
  }

  private getBatteryDeathTick(chargeStations: Position3D[]): number | undefined {
      if (!this.path || this.path.length <= 1) return undefined;
      
      let consumed = 0;
      const EPSILON = 0.0001;

      for (let i = 1; i < this.path.length; i++) {
          const prev = this.path[i-1];
          const curr = this.path[i];
          
          if (this.isAtStation(curr, chargeStations) && this.isWaiting(prev, curr)) {
              consumed = 0;
          } else {
              consumed += this.isWaiting(prev, curr) ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;
          }
          
          if (consumed > this.maxBattery + EPSILON) {
              return i - 1;
          }
      }
      return undefined;
  }

  private calculateBatteryAt(tick: number, chargeStations: Position3D[]): number {
      if (!this.path || this.path.length === 0) return this.maxBattery;
      
      let consumed = 0;
      for (let i = 1; i <= tick && i < this.path.length; i++) {
          const prev = this.path[i-1];
          const curr = this.path[i];

          if (this.isAtStation(curr, chargeStations) && this.isWaiting(prev, curr)) {
              consumed = 0;
          } else {
              consumed += this.isWaiting(prev, curr) ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;
          }
      }
      return Math.max(0, this.maxBattery - consumed);
  }

  private checkRecharging(tick: number, chargeStations: Position3D[]): boolean {
      if (!this.path || tick <= 0 || tick >= this.path.length - 1) return false;
      const curr = this.path[tick];
      
      if (!this.isAtStation(curr, chargeStations)) return false;
      
      // Look at neighbors to confirm waiting
      const prev = this.path[tick-1];
      const next = this.path[tick+1];
      return this.isWaiting(prev, curr) || this.isWaiting(curr, next);
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

  initializeScenario(world: World, deployFromBase: boolean = false) {
    const occupied = new Set<string>();
    const posKey = (p: Position3D) => `${p.x},${p.y},${p.z}`;
    const baseSide = Math.ceil(Math.sqrt(this.drones.length));

    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i];
      let start: Position3D;
      let goal: Position3D;
      let attempts = 0;

      if (deployFromBase) {
        const row = Math.floor(i / baseSide);
        const col = i % baseSide;
        start = { x: row, y: 0, z: col };
        occupied.add(posKey(start));
      } else {
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
            (!deployFromBase || (goal.x > baseSide || goal.z > baseSide || goal.y > 2))
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