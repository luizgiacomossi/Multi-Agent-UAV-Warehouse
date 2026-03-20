
import { Agent, Position3D, MATH_CONSTANTS, MissionState } from '../types';
import { MissionController } from './MissionController';
import { World } from './World';

export class Drone implements Agent {
    // drone properties
    id: string;
    name: string;
    start: Position3D;
    goal: Position3D;
    color: string;
    path: Position3D[];
    status: 'IDLE' | 'FLYING' | 'CHARGING' | 'STRANDED';
    deliveryTimes?: number[];
    scanTimes?: number[];       // ticks at which pallet scans were completed
    battery: number;
    maxBattery: number;
    payload: string[];
    destructionTime?: number;
    missionState?: MissionState;
    currentPalletId?: string;   // ID of pallet currently being inspected
    currentScanType?: string;   // 'camera' | 'rfid'
    scanLog: { tick: number; palletId: string }[];  // history of completed scans
    assignedTasksLog: { startTick: number; endTick: number; palletId: string; position: Position3D; type: string; priority: number }[];

    public mission: MissionController;

    constructor(id: string, name: string, color: string, maxBattery: number = 50) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.start = { x: 0, y: 0, z: 0 };
        this.goal = { x: 0, y: 0, z: 0 };
        this.path = [];
        this.status = 'IDLE';
        this.deliveryTimes = [];
        this.scanTimes = [];
        this.scanLog = [];
        this.assignedTasksLog = [];
        this.battery = maxBattery;
        this.maxBattery = maxBattery;
        this.payload = ['camera', 'rfid'];
        this.mission = new MissionController({ x: 0, y: 0, z: 0 });
    }

    clone(): Drone {
        const d = new Drone(this.id, this.name, this.color, this.maxBattery);
        d.start = { ...this.start };

        // Sync the visual goal marker to the current active mission leg
        const activeTarget = this.mission.getNextTarget();
        d.goal = activeTarget ? { ...activeTarget } : { ...this.goal };

        d.path = this.path.map(p => ({ ...p }));
        d.status = this.status;
        d.battery = this.battery;
        d.payload = [...this.payload];
        d.deliveryTimes = this.deliveryTimes ? [...this.deliveryTimes] : [];
        d.scanTimes = this.scanTimes ? [...this.scanTimes] : [];
        d.scanLog = this.scanLog ? [...this.scanLog] : [];
        d.assignedTasksLog = this.assignedTasksLog ? this.assignedTasksLog.map(t => ({ ...t })) : [];
        d.destructionTime = this.destructionTime;
        d.currentPalletId = this.mission.currentPalletId || undefined;
        d.currentScanType = this.mission.currentScanType || undefined;
        // We don't deep clone mission controller state for React rendering, 
        // but we copy the basic props if needed for UI logic
        d.missionState = this.mission.state;
        return d;
    }

    setMissionConfig(start: Position3D, firstGoal: Position3D, maxMissions: number, isRoundTrip: boolean) {
        this.start = { ...start };
        this.goal = { ...firstGoal };
        this.path = [this.start]; // Initialize path with start pos
        this.status = 'IDLE';
        this.deliveryTimes = [];
        this.destructionTime = undefined;
        this.assignedTasksLog = [];

        // Configure Controller
        this.mission.warehouseLocation = { ...start };
        this.mission.configure(maxMissions, isRoundTrip);
        this.mission.reset();
        this.mission.assignNewMission(firstGoal);
    }

    /**
     * Appends a newly planned path segment. 
     * Registers the target as a PENDING (in-flight) scan so other drones exclude it from reassignment,
     * but does NOT mark it as fully scanned until the drone physically arrives at that tick.
     * @param isScanning True if this segment targets a pallet (Outbound or mid-Tour)
     */
    public appendPath(newLeg: Position3D[], isScanning: boolean) {
        if (newLeg.length <= 1) return; // ignore zero-length segments
        const slice = newLeg.slice(1);
        this.path.push(...slice);

        // Register the arrival tick in scanLog so App.tsx can tick-gate coloring correctly.
        // The allScanned exclusion in SimulationManager uses currentPalletId + currentCluster (in-flight),
        // NOT scanLog, to avoid prematurely marking pallets as done.
        if (isScanning && this.mission.currentPalletId) {
            this.scanLog = this.scanLog || [];
            const scanTick = this.path.length - 1;
            // Only push if this palletId isn't already queued (prevent duplicates for re-planned legs)
            const alreadyQueued = this.scanLog.some(e => e.palletId === this.mission.currentPalletId);
            if (!alreadyQueued) {
                this.scanLog.push({ tick: scanTick, palletId: this.mission.currentPalletId! });
            }
        }
        this.status = 'FLYING';
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
                position: this.path[this.path.length - 1],
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
                const prev = this.path[i - 1];
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
                        const cost = isWaiting ? MATH_CONSTANTS.BETA_HOVER : MATH_CONSTANTS.BETA_FLY;
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
        // Check if the drone is at a charging station (within 1 voxel distance)
        return stations.some(s => s.x === pos.x && s.y === pos.y && s.z === pos.z);
    }

    private isWaiting(prev: Position3D, curr: Position3D): boolean {
        // Check if the drone is waiting (position hasn't changed)
        return prev.x === curr.x && prev.y === curr.y && prev.z === curr.z;
    }
}


// Swarm class to manage multiple drones 
// Swarm is a collection of drones that work together to complete the mission 
export class Swarm {

    public drones: Drone[] = [];

    constructor(count: number) {
        // Drones initialized via resize because the number of drones can be changed by the user during runtime 
    }

    resize(count: number, battery: number) {
        this.drones = [];
        const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];
        for (let i = 0; i < count; i++) {
            this.drones.push(new Drone(
                `agent-${i}-${Date.now()}`, // Unique ID for the drone 
                `Drone ${i + 1}`, // Display name for the drone 
                colors[i % colors.length], // Color for the drone 
                battery // Battery capacity for the drone 
            ));
        }
    }

    initializeScenario(world: World, maxAltitude: number) {
        // Initialize the scenario (start position, goal position, etc.) for all drones 
        const agents = this.drones;

        for (let i = 0; i < agents.length; i++) {
            const drone = agents[i]; // Get the drone 
            let start: Position3D; // Start position for the drone 

            // Assign Start - set to warehouse spawn location if available, otherwise random 
            if (world.warehouse) {
                start = world.warehouse.getSpawnLocation(i); // Get the spawn location for the drone 
            } else { //fallback: random unblocked free cell 
                let attempts = 0;
                while (attempts < 1000) {
                    start = {
                        x: Math.floor(Math.random() * world.size),
                        y: Math.floor(Math.random() * Math.min(world.size, maxAltitude)),
                        z: Math.floor(Math.random() * world.size)
                    };
                    if (!world.isBlocked(start.x, start.y, start.z) && !this.isOccupied(start)) break;
                    attempts++;
                }
                if (attempts >= 1000) start = { x: 0, y: 0, z: 0 };
            }
            drone.start = start;

            // Assign Initial Goal — set to real pallet positions in Warehouse mode 
            if (world.pallets && world.pallets.length > 0) {
                // Pick a random pallet for each drone 
                const pallet = world.pallets[Math.floor(Math.random() * world.pallets.length)]; // Get a random pallet 
                drone.goal = { ...pallet.position }; // Set the goal to the pallet position 
                drone.currentPalletId = pallet.id; // Set the current pallet ID 
                drone.currentScanType = pallet.payload_type; // Set the current scan type 
                // Keep MissionController in sync
                drone.mission.currentPalletId = pallet.id; // Keep MissionController in sync 
                drone.mission.currentScanType = pallet.payload_type;
            } else {
                // Non-warehouse fallback: random unblocked free cell
                let attempts = 0;
                const minDistance = 4;
                while (attempts < 1000) {
                    const goal = {
                        x: Math.floor(Math.random() * world.size),
                        y: Math.floor(Math.random() * Math.min(world.size, maxAltitude)),
                        z: Math.floor(Math.random() * world.size)
                    };
                    const dist = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y) + Math.abs(start.z - goal.z);
                    if (!world.isBlocked(goal.x, goal.y, goal.z) && dist > minDistance) {
                        drone.goal = goal;
                        break;
                    }
                    attempts++;
                }
                if (attempts >= 1000) drone.goal = { x: 0, y: 0, z: 0 };
            }
        }
    }

    private isOccupied(p: Position3D) {
        // Check if the position is occupied by any drone 
        return this.drones.some(a =>
            (a.start.x === p.x && a.start.y === p.y && a.start.z === p.z)
        );
    }
}
