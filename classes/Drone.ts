
import { Agent, Position3D, ENERGY_COSTS, MissionState } from '../types';
import { MissionController } from './MissionController';
import { World } from './World';

export class Drone implements Agent {
  id: string;
  name: string;
  start: Position3D;
  // goal property is now primarily for initial setup/UI, actual logic uses MissionController
  goal: Position3D; 
  color: string;
  path: Position3D[];
  status: 'idle' | 'moving' | 'finished' | 'blocked' | 'destroyed' | 'out_of_battery';
  deliveryTimes?: number[];
  maxBattery: number;
  destructionTime?: number;
  missionState?: MissionState;
  
  public mission: MissionController;

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
    this.mission = new MissionController({x:0, y:0, z:0});
  }

  clone(): Drone {
    const d = new Drone(this.id, this.name, this.color, this.maxBattery);
    d.start = { ...this.start };
    d.goal = { ...this.goal };
    d.path = this.path.map(p => ({ ...p }));
    d.status = this.status;
    d.deliveryTimes = this.deliveryTimes ? [...this.deliveryTimes] : [];
    d.destructionTime = this.destructionTime;
    // We don't deep clone mission controller state for React rendering, 
    // but we copy the basic props if needed for UI logic
    d.missionState = this.mission.state; 
    return d;
  }

  setMissionConfig(start: Position3D, firstGoal: Position3D, isInfinite: boolean, isRoundTrip: boolean) {
    this.start = { ...start };
    this.goal = { ...firstGoal };
    this.path = [this.start]; // Initialize path with start pos
    this.status = 'idle';
    this.deliveryTimes = [];
    this.destructionTime = undefined;
    
    // Configure Controller
    this.mission.warehouseLocation = { ...start };
    this.mission.configure(isInfinite, isRoundTrip);
    this.mission.reset();
    this.mission.assignNewMission(firstGoal);
  }

  /**
   * Appends a new path segment to the drone's history.
   */
  appendPath(segment: Position3D[], isDelivery: boolean = false) {
      // If this is not the very first segment, we skip the first point of the new segment
      // because it matches the last point of the existing path
      const startIndex = (this.path.length > 0) ? 1 : 0;
      
      for(let i = startIndex; i < segment.length; i++) {
          this.path.push(segment[i]);
      }

      if (isDelivery) {
          this.deliveryTimes = this.deliveryTimes || [];
          // The delivery happens at the end of this segment
          this.deliveryTimes.push(this.path.length - 1);
      }

      this.status = 'moving';
  }

  /**
   * Returns the drone's physical state at a given time tick.
   * Handles battery logic (including recharging at base), stopping, destruction, falling physics,
   * and package visibility (pick up at base, drop at goal).
   */
  getSnapshotAt(tick: number, chargeStations: Position3D[], batteryEnabled: boolean = true) {
    // 1. Check for Collision Destruction
    if (this.destructionTime !== undefined && tick >= this.destructionTime) {
         // Freeze at destruction time. Use destructionTime index, not current tick.
         const crashIdx = Math.min(this.destructionTime, this.path.length - 1);
         const crashPos = (this.path.length > 0) ? this.path[crashIdx] : this.start;
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

    // If finished and waiting at end
    if (tick >= this.path.length && this.path.length > 0) {
        return {
            position: this.path[this.path.length-1],
            battery: battery, // Keeps last calculated battery
            isDestroyed: false,
            isDeadBattery: false,
            isRecharging: false,
            hasPackage: false // Finished usually means delivered
        };
    }

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
   * Made Public to allow SimulationManager to detect battery failures for logging.
   */
  public calculateStateAt(tick: number, chargeStations: Position3D[], batteryEnabled: boolean) {
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
              // We recharge if we are at a station OR at the starting base (warehouse location)
              // Check Mission Warehouse
              const atBase = (curr.x === this.mission.warehouseLocation.x && 
                              curr.y === this.mission.warehouseLocation.y && 
                              curr.z === this.mission.warehouseLocation.z);
              
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
    public drones: Drone[] = [];

    constructor(count: number) {
        // Drones initialized via resize
    }

    resize(count: number, battery: number) {
         this.drones = [];
         const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];
         for(let i=0; i<count; i++) {
             this.drones.push(new Drone(
                 `agent-${i}-${Date.now()}`,
                 `Drone ${i + 1}`,
                 colors[i % colors.length],
                 battery
             ));
         }
    }

    initializeScenario(world: World, maxAltitude: number) {
        const agents = this.drones;
        
        for (let i = 0; i < agents.length; i++) {
            const drone = agents[i];
            let start: Position3D;
            
            // 1. Assign Start
            if (world.warehouse) {
                start = world.warehouse.getSpawnLocation(i);
            } else {
                let attempts = 0;
                while(attempts < 1000) {
                    start = {
                        x: Math.floor(Math.random() * world.size),
                        y: Math.floor(Math.random() * Math.min(world.size, maxAltitude)),
                        z: Math.floor(Math.random() * world.size)
                    };
                    if (!world.isBlocked(start.x, start.y, start.z) && !this.isOccupied(start)) break;
                    attempts++;
                }
                if (attempts >= 1000) start = {x:0, y:0, z:0}; 
            }
            drone.start = start;

            // 2. Assign Initial Goal
            let attempts = 0;
            const minDistance = 4;
            
            while (attempts < 1000) {
                const goal = {
                    x: Math.floor(Math.random() * world.size),
                    y: Math.floor(Math.random() * Math.min(world.size, maxAltitude)),
                    z: Math.floor(Math.random() * world.size)
                };
                
                const dist = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y) + Math.abs(start.z - goal.z);
                
                // Check bounds, blocks, warehouse exclusion
                let valid = !world.isBlocked(goal.x, goal.y, goal.z) && dist > minDistance;
                
                if (valid && world.warehouse) {
                    const b = world.warehouse.getBounds();
                    if (goal.x >= b.minX && goal.x <= b.maxX && goal.z >= b.minZ && goal.z <= b.maxZ) {
                        valid = false;
                    }
                }

                if (valid) {
                    drone.goal = goal;
                    break;
                }
                attempts++;
            }
            if (attempts >= 1000) drone.goal = {x:0, y:0, z:0}; 
        }
    }

    private isOccupied(p: Position3D) {
      return this.drones.some(a => 
        (a.start.x === p.x && a.start.y === p.y && a.start.z === p.z)
      );
    }
}
