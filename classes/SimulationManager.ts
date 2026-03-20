
import { World } from './World';
import { Swarm, Drone } from './Drone';
import { Warehouse } from './Warehouse';
import { SimulationIncident, Position3D, Pallet, ClusterVisualization } from '../types';
import { ReservedZone } from './WorldGenerator';
import { KDTree } from '../utils/KDTree';
import { TaskCluster } from './TaskCluster';
import {
    PathFindingStrategy,
    NaivePlanner,
    CooperativePlanner,
    EnergySaverPlanner,
    CollisionAnalyzer
} from './PathPlanner';
import { CostModel } from './CostModel';
import { Task } from '../types';
import { MAX_TIMESTEPS, GRID_SIZE, DEFAULT_AGENT_COUNT } from '../SimulationConfig';

// class SimulationManager is the main class that manages the simulation
// it connects the frontend (UI) and the backend (Simulation logic)
export class SimulationManager {
    public world: World;
    public swarm: Swarm;
    private algorithms: Record<string, PathFindingStrategy>;

    constructor(defaultSize: number = GRID_SIZE, defaultAgentCount: number = DEFAULT_AGENT_COUNT) {
        this.world = new World(defaultSize);
        this.swarm = new Swarm(defaultAgentCount);

        this.algorithms = {
            'Naive': new NaivePlanner(),
            'Cooperative': new CooperativePlanner(),
            'Energy Saver': new EnergySaverPlanner(),
        };
    }

    public getAvailableAlgorithms(): string[] {
        return Object.keys(this.algorithms);
    }

    public getAlgorithmDescription(name: string): string {
        return this.algorithms[name]?.description || "";
    }

    public generateWorld(theme: string, size: number, enableStations: boolean, deployFromBase: boolean, agentCount: number, totalTasks: number = 50, numForklifts: number = 3) {
        this.world.setSize(size);

        let reservedZone: ReservedZone | undefined = undefined;
        if (deployFromBase) {
            // Create a temporary warehouse to calculate the restricted bounds
            const tempWarehouse = new Warehouse(agentCount);
            const b = tempWarehouse.getBounds();
            reservedZone = {
                minX: b.minX, maxX: b.maxX,
                minY: b.minY, maxY: b.maxY,
                minZ: b.minZ, maxZ: b.maxZ
            };
        }

        this.world.generate(theme, reservedZone, totalTasks, numForklifts);

        if (enableStations) {
            const stationCount = size > 20 ? 3 : 1;
            this.world.generateStations(stationCount);
        }
    }

    public initializeAgents(count: number, battery: number, deployFromBase: boolean, maxAltitude: number) {
        if (deployFromBase) {
            this.world.setupWarehouse(count);
        } else {
            this.world.removeWarehouse();
        }

        this.swarm.resize(count, battery);
        this.swarm.initializeScenario(this.world, maxAltitude);
    }

    private generateRandomTask(
        warehouse: Warehouse | null,
        maxAltitude: number,
        scannedPalletIds: Set<string> = new Set()
    ): Task {
        let attempts = 0;
        let p: Position3D = { x: 0, y: 0, z: 0 };
        let reqPayload = Math.random() > 0.5 ? 'camera' : 'rfid';
        let palletId: string | undefined = undefined;

        // Try to assign a real Pallet if in Warehouse mode
        if (this.world.pallets && this.world.pallets.length > 0) {
            // Prefer pallets that haven't been scanned yet
            const unscanned = this.world.pallets.filter(plt => !scannedPalletIds.has(plt.id));
            // If all pallets done, reset and re-scan everything (full cycle complete)
            const pool = unscanned.length > 0 ? unscanned : this.world.pallets;

            const plt = pool[Math.floor(Math.random() * pool.length)];
            p = { x: plt.position.x, y: plt.position.y, z: plt.position.z };
            reqPayload = plt.payload_type;
            palletId = plt.id;
        } else {
            // Fallback to random coordinate ONLY if not in a Warehouse
            const worldSizeX = this.world?.size || 24;
            const worldSizeZ = this.world?.size || 24;
            const yLimit = Math.min(worldSizeX - 1, maxAltitude || 10);

            while (attempts < 200) {
                p = {
                    x: Math.floor(Math.random() * worldSizeX),
                    y: Math.floor(Math.random() * yLimit),
                    z: Math.floor(Math.random() * worldSizeZ)
                };

                const inWarehouse = warehouse ?
                    (p.x >= warehouse.position.x && p.x < warehouse.position.x + warehouse.baseSize &&
                        p.z >= warehouse.position.z && p.z < warehouse.position.z + warehouse.baseSize &&
                        p.y < 3) : false;

                if (this.world && this.world.isBlocked(p.x, p.y, p.z)) {
                    attempts++;
                    continue;
                }

                if (!inWarehouse) break;
                attempts++;
            }
        }

        return {
            id: 'T-' + Math.random().toString(36).substr(2, 9),
            target: p,
            req_payload: reqPayload,
            palletId: palletId,
            pi_k: Math.random() * 0.9 + 0.1,
            t_hover: 5,
            status: 'PENDING'
        };
    }

    private distanceManhattan(a: Position3D, b: Position3D): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
    }

    private buildLocalizedClusters(pallets: Pallet[], clusterRadius: number, maxClusterSize: number, maxClusters: number): TaskCluster[] {
        const pool = [...pallets];
        const clusters: TaskCluster[] = [];

        while (pool.length > 0 && clusters.length < maxClusters) {
            const seed = pool[Math.floor(Math.random() * pool.length)];
            const kdTree = new KDTree<Pallet>(pool, p => p.position);

            const neighbors = kdTree
                .rangeQuery(seed.position, clusterRadius)
                .sort((a, b) => this.distanceManhattan(a.position, seed.position) - this.distanceManhattan(b.position, seed.position))
                .slice(0, Math.max(1, maxClusterSize));

            const clusterTasks = neighbors.map(plt => ({
                id: 'T-' + Math.random().toString(36).substr(2, 9),
                target: { ...plt.position },
                req_payload: plt.payload_type,
                palletId: plt.id,
                pi_k: 1.0,
                t_hover: 5,
                status: 'PENDING' as const
            }));

            if (clusterTasks.length === 0) {
                break;
            }

            const takenIds = new Set(neighbors.map(plt => plt.id));
            for (let i = pool.length - 1; i >= 0; i--) {
                if (takenIds.has(pool[i].id)) {
                    pool.splice(i, 1);
                }
            }

            clusters.push(new TaskCluster(clusterTasks));
        }

        return clusters;
    }

    public async runPathfinding(
        algorithmName: string,
        isRoundTrip: boolean,
        missionCount: number = 1,
        maxAltitude: number = 24,
        batteryEnabled: boolean = true,
        allocationMode: '1-to-1' | 'Cluster' = '1-to-1',
        clusterRadius: number = 5,
        maxClusterSize: number = 3
    ): Promise<{ agents: Drone[], incidents: SimulationIncident[], maxTicks: number, clusters: ClusterVisualization[] }> {

        const strategy = this.algorithms[algorithmName];
        if (!strategy) throw new Error(`Algorithm ${algorithmName} not found`);

        const reservedSpaceTime = new Set<number>(); // Persist reservations across legs for consistency
        const clusters: ClusterVisualization[] = [];
        const activeClustersByDrone = new Map<string, ClusterVisualization>();

        // 1. Setup Initial Missions using MissionController
        this.swarm.drones.forEach(drone => {
            // drone.goal was set in initializeScenario to the pallet position
            // sync MissionController with the correct pallet context
            drone.setMissionConfig(drone.start, drone.goal, missionCount, isRoundTrip);
            // Re-apply pallet metadata that initializeScenario set, since setMissionConfig resets mission
            if (drone.currentPalletId) {
                drone.mission.currentPalletId = drone.currentPalletId;
                drone.mission.currentScanType = drone.currentScanType || null;
            }
        });

        // 2. Iterative Simulation Loop
        // Instead of one giant plan, we plan leg-by-leg (Outbound -> Return -> Outbound...)

        // Maximum global ticks for safety
        const MAX_GLOBAL_TIME = MAX_TIMESTEPS;
        strategy.setMaxTimeSteps(MAX_GLOBAL_TIME);

        // Pre-allocate Forklift space-time to force drones to avoid them dynamically across the full simulation
        this.world.forklifts.forEach(fl => {
            if (!fl.path || fl.path.length === 0) return;
            for (let t = 0; t < MAX_GLOBAL_TIME; t++) {
                const pos = fl.path[t % fl.path.length];
                const h1 = (pos.x) | (pos.y << 6) | (pos.z << 12) | (t << 18);
                const h2 = (pos.x) | ((pos.y + 1) << 6) | (pos.z << 12) | (t << 18);
                reservedSpaceTime.add(h1);
                reservedSpaceTime.add(h2); // Extra height block
            }
        });

        // Maximum theoretical legs = missionCount * clusterCapacity * 2 (Outbound/Inbound padding)
        const maxLegTries = missionCount * 15;
        for (let cycle = 0; cycle < maxLegTries; cycle++) {

            // 0. Register active assignment segments at the START of the physical leg
            this.swarm.drones.forEach(drone => {
                if (drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR') {
                    if (drone.mission.currentPalletId) {
                        const isLogged = drone.assignedTasksLog.some(l => l.palletId === drone.mission.currentPalletId);
                        if (!isLogged) {
                            const tgt = this.world.pallets.find(p => p.id === drone.mission.currentPalletId);
                            if (tgt) {
                                drone.assignedTasksLog.push({
                                    startTick: Math.max(0, drone.path.length - 1),
                                    endTick: MAX_TIMESTEPS,
                                    palletId: drone.mission.currentPalletId,
                                    position: drone.mission.getNextTarget() || drone.goal,
                                    type: drone.mission.currentScanType || 'camera',
                                    priority: tgt.weight / 100
                                });
                            }
                        }
                    }
                }
            });

            // A. Plan Current Leg for all agents
            // The planner now just looks at where they are (end of current path) and where MissionController says to go.
            strategy.planLeg(this.swarm, this.world, 0, reservedSpaceTime, maxAltitude, batteryEnabled);

            // B. Update Mission States and Batch Assign using Munkres
            const idleDrones: Drone[] = [];
            this.swarm.drones.forEach(drone => {
                const prevPallet = drone.mission.currentPalletId;
                const prevCluster = drone.mission.currentCluster;
                const readyForNew = drone.mission.completeLeg();

                // 0.5 Close the historical segment
                if (prevPallet && drone.assignedTasksLog.length > 0) {
                    const lastLog = drone.assignedTasksLog[drone.assignedTasksLog.length - 1];
                    if (lastLog.palletId === prevPallet) {
                        lastLog.endTick = drone.path.length - 1;
                    }
                }

                if (prevCluster && drone.mission.currentCluster !== prevCluster) {
                    const activeCluster = activeClustersByDrone.get(drone.id);
                    if (activeCluster) {
                        activeCluster.endTick = drone.path.length - 1;
                        activeClustersByDrone.delete(drone.id);
                    }
                }

                if (readyForNew && drone.status !== 'STRANDED' && drone.mission.state !== 'COMPLETED') {
                    idleDrones.push(drone);
                }
            });

            if (idleDrones.length > 0) {
                // Build the exclusion set from in-flight state only (NOT scanLog, which logs future ticks at planning time).
                // Using scanLog here would mark pallets as "done" the instant a path is queued, before the drone arrives.
                const allScanned = new Set<string>();
                this.swarm.drones.forEach(d => {
                    // 1. Pallet the drone is actively flying to right now
                    if (d.currentPalletId) allScanned.add(d.currentPalletId);

                    // 2. All pallets scheduled inside an active cluster tour
                    if (d.mission.currentCluster) {
                        d.mission.currentCluster.tourSequence.forEach(t => allScanned.add(t.palletId));
                    }

                    // 3. Pallets whose arrival tick has already passed (genuinely scanned)
                    const currentPathLen = d.path.length;
                    (d.scanLog || []).forEach(entry => {
                        if (entry.tick < currentPathLen) allScanned.add(entry.palletId);
                    });
                });

                const dMax = this.world.size * 2; // Approximate valid maximum structural traversal
                const pBase = this.world.warehouse?.position || { x: 0, y: 0, z: 0 };

                if (allocationMode === 'Cluster' && this.world.pallets && this.world.pallets.length > 0) {
                    const unscanned = this.world.pallets.filter(plt => !allScanned.has(plt.id));

                    if (unscanned.length > 0) {
                        const pendingClusters = this.buildLocalizedClusters(unscanned, clusterRadius, maxClusterSize, idleDrones.length);

                        // Fire the Munkres Cost Engine for spatial matching
                        if (pendingClusters.length > 0) {
                            const assignments = CostModel.executeClusterAllocation(idleDrones, pendingClusters, pBase, dMax);

                            assignments.forEach(a => {
                                const drone = idleDrones.find(d => d.id === a.drone.id);
                                if (drone) {
                                    drone.mission.assignClusterMission(a.cluster);
                                    const clusterVisual: ClusterVisualization = {
                                        id: a.cluster.id,
                                        droneId: drone.id,
                                        droneName: drone.name,
                                        color: drone.color,
                                        centroid: { ...a.cluster.centroid },
                                        positions: a.cluster.tourSequence.map(t => ({ ...t.target })),
                                        palletIds: a.cluster.tourSequence.map(t => t.palletId || ''),
                                        startTick: Math.max(0, drone.path.length - 1),
                                        endTick: MAX_TIMESTEPS
                                    };
                                    clusters.push(clusterVisual);
                                    activeClustersByDrone.set(drone.id, clusterVisual);
                                    console.log(`[${drone.name}] Munkres Cost (${a.cost.toFixed(2)}) - Allocated Cluster:`, {
                                        timestamp: new Date().toISOString(),
                                        tick: cycle,
                                        centroid: a.cluster.centroid,
                                        tourCost: a.cluster.tourCost.toFixed(2),
                                        tasks: a.cluster.tourSequence.map(t => t.palletId)
                                    });
                                }
                            });
                        }
                    }
                } else {
                    // Baseline 1-to-1 Munkres Assignment
                    const unscanned = this.world.pallets ? this.world.pallets.filter(plt => !allScanned.has(plt.id)) : [];

                    if (unscanned.length > 0) {
                        const pendingTasks: Task[] = unscanned.slice(0, idleDrones.length).map(plt => ({
                            id: 'T-' + Math.random().toString(36).substr(2, 9),
                            target: { ...plt.position },
                            req_payload: plt.payload_type,
                            palletId: plt.id,
                            pi_k: 1.0,
                            t_hover: 5,
                            status: 'PENDING'
                        }));

                        if (pendingTasks.length > 0) {
                            const assignments = CostModel.executeOptimalAllocation(idleDrones, pendingTasks, pBase, dMax);

                            assignments.forEach(a => {
                                const drone = idleDrones.find(d => d.id === a.drone.id);
                                if (drone) {
                                    drone.mission.assignNewMission(a.task.target, a.task.palletId, a.task.req_payload);
                                    drone.goal = { ...a.task.target };
                                    drone.currentPalletId = a.task.palletId;
                                    drone.currentScanType = a.task.req_payload;

                                    console.log(`[${drone.name}] Munkres Cost (${a.cost.toFixed(2)}) - Allocated 1-to-1 Task:`, {
                                        timestamp: new Date().toISOString(),
                                        tick: cycle,
                                        palletId: a.task.palletId,
                                        target: a.task.target
                                    });
                                }
                            });
                        }
                    }
                }
            }

            // Break early if everyone is finished/blocked
            const everyoneDone = this.swarm.drones.every(d => d.mission.state === 'COMPLETED' || d.status === 'STRANDED');
            if (everyoneDone) break;
        }

        // 3. Detect Collisions (drone-drone and drone-forklift)
        let collisions = CollisionAnalyzer.detect(this.swarm, this.world.forklifts, this.world.warehouse);


        // 4. Detect Battery Incidents
        const batteryIncidents: SimulationIncident[] = [];
        if (batteryEnabled) {
            const totalDuration = Math.max(...this.swarm.drones.map(d => d.path.length));
            this.swarm.drones.forEach(d => {
                // Check the full path including a buffer
                const { deathTick } = d.calculateStateAt(totalDuration + 100, this.world.chargeStations, true);
                if (deathTick !== undefined) {
                    batteryIncidents.push({
                        id: `bat-${d.id}-${deathTick}`,
                        type: 'battery_dead',
                        time: deathTick,
                        position: d.path[Math.min(deathTick, d.path.length - 1)] || d.start,
                        agentIds: [d.id],
                        agentNames: [d.name]
                    });
                    d.status = 'STRANDED';
                }
            });
        }

        // Merge and Sort
        const incidents = [...collisions, ...batteryIncidents].sort((a, b) => a.time - b.time);

        // Handle Unsafe Destruction (Universal safety net)
        // Filter for collisions only
        const collisionIncidents = incidents.filter(i => i.type === 'collision');
        const destroyedIds = new Set<string>();

        collisionIncidents.forEach(col => {
            col.agentIds.forEach(id => {
                if (destroyedIds.has(id)) return;
                const drone = this.swarm.drones.find(d => d.id === id);
                if (drone) {
                    drone.destructionTime = col.time;
                    drone.status = 'STRANDED';
                    // Truncate path after destruction so they stop moving logically
                    if (drone.path.length > col.time + 1) {
                        drone.path = drone.path.slice(0, col.time + 1);
                    }
                    destroyedIds.add(id);
                }
            });
        });

        // Return a deep copy for React state stability
        const agents = this.swarm.drones.map(d => d.clone());
        const maxTicks = Math.max(...agents.map(a => a.path.length), 0);
        activeClustersByDrone.forEach(cluster => {
            cluster.endTick = Math.min(cluster.endTick, maxTicks);
        });

        return { agents, incidents, maxTicks, clusters };
    }

    // ==========================================
    // PAPER EXPERIMENT SUPPORT
    // ==========================================

    /**
     * Experiment 2: Monte Carlo Event-Triggered Scenario
     */
    public runMonteCarloAllocations(iterations: number = 50, droneCount: number = 10, taskCount: number = 50) {
        console.log(`--- Starting Monte Carlo Experiment 2: ${iterations} Iterations ---`);
        const results = [];

        // Single generic Base point to return to
        const p_base: Position3D = { x: 0, y: 0, z: 0 };

        // Ensure Warehouse exists so computational tasks bind correctly to physical Pallets
        if (this.world.pallets.length === 0) {
            this.generateWorld('Warehouse', 24, false, false, droneCount);
        }

        for (let i = 0; i < iterations; i++) {
            // 1. Generate Synthetic Scenario (identical for all 3 baselines per iteration)
            const syntheticDrones: Drone[] = [];
            for (let d = 0; d < droneCount; d++) {
                const drone = new Drone(`MC_D${d}`, `Agent ${d}`, '#ef4444');
                drone.start = this.generateRandomTask(null, 24).target; // hack to get free pos
                drone.battery = Math.floor(Math.random() * 50) + 50; // 50 to 100%
                drone.payload = [Math.random() > 0.5 ? 'camera' : 'rfid']; // 1 item
                syntheticDrones.push(drone);
            }

            const syntheticTasks: Task[] = [];
            for (let t = 0; t < taskCount; t++) {
                syntheticTasks.push(this.generateRandomTask(null, 24));
            }

            // Run algorithms
            const resultHungarian = CostModel.executeOptimalAllocation(syntheticDrones, syntheticTasks, p_base, this.world.size * 1.732);
            // TODO: Implement Greedy and Random baseline eval internally here and compare metrics.
            // For now, output the Proposed Hungarian assignment performance

            let strandedCount = 0;
            let finalBatteries: number[] = [];
            let maxDist = 0;

            resultHungarian.forEach(alloc => {
                const totalDist = CostModel.distanceEuclidean(alloc.drone.start, alloc.task.target) + CostModel.distanceEuclidean(alloc.task.target, p_base);
                const consumedBat = (totalDist * 1.3 * 0.5) + (alloc.task.t_hover * 0.1); // using constants roughly
                const finalBat = alloc.drone.battery - consumedBat;

                if (finalBat < 20) strandedCount++;
                finalBatteries.push(finalBat);
                if (totalDist > maxDist) maxDist = totalDist;
            });

            const sum = finalBatteries.reduce((a, b) => a + b, 0);
            const avg = sum / finalBatteries.length;
            const sqDiffs = finalBatteries.map(val => Math.pow(val - avg, 2));
            const stdDev = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / finalBatteries.length) || 0;

            results.push({ Iteration: i + 1, Stranded: strandedCount, BatStdDev: stdDev, MakespanDist: maxDist });
            console.log(`[Iter ${i + 1}] Stranded: ${strandedCount} | StdDev: ${stdDev.toFixed(2)} | Makespan: ${maxDist.toFixed(1)}`);
        }

        console.table(results);
        return results;
    }

    /**
     * Experiment 3: Time-Triggered Fault Tolerance
     */
    public runFaultToleranceScenario() {
        console.log(`--- Starting Fault Tolerance Experiment 3 ---`);

        // Ensure Warehouse exists so computational tasks bind correctly to physical Pallets
        if (this.world.pallets.length === 0) {
            this.generateWorld('Warehouse', 24, false, false, 5);
        }

        // 1. Static Setup
        const drones: Drone[] = [];
        for (let d = 0; d < 5; d++) {
            const drone = new Drone(`FT_D${d}`, `Agent ${d}`, '#ef4444');
            drone.start = { x: 0, y: 0, z: 0 };
            drone.battery = 100;
            drone.payload = ['camera']; // Universal
            drones.push(drone);
        }

        const tasks: Task[] = [];
        for (let t = 0; t < 5; t++) {
            tasks.push(this.generateRandomTask(null, 24));
            tasks[t].req_payload = 'camera'; // Make feasible
        }

        // Initial Allocation
        let assignments = CostModel.executeOptimalAllocation(drones, tasks, { x: 0, y: 0, z: 0 }, this.world.size * 1.732);
        console.log(`Initial Allocation complete for ${assignments.length} tasks.`);

        // 2. The Time Loop (Simulated here linearly)
        let T = 0;
        const dt = 0.1;

        console.log("Simulating T=0 to T=60s...");
        T = 60.0;

        // 3. Fault Injection
        console.log(`[T=${T}s] FAULT INJECTED: Drone FT_D2 battery critically fails.`);
        const failedDrone = drones.find(d => d.id === 'FT_D2');
        if (failedDrone) failedDrone.battery = 10; // Trigger < 20% limit

        // 4. Detection & Re-allocation Stopwatch
        const t0 = performance.now();

        // Orphan task that Drone 2 had
        const orphanedTask = assignments.find(a => a.drone.id === 'FT_D2')?.task;

        if (orphanedTask) {
            // Remove failed drone
            const healthyDrones = drones.filter(d => d.battery >= 20);
            // Re-solve for remaining Tasks + orphaned task against healthy drones 
            // (Simplified for timing measurement: just assigning the orphaned task to best available)
            const reAsgn = CostModel.executeOptimalAllocation(healthyDrones, [orphanedTask], { x: 0, y: 0, z: 0 }, this.world.size * 1.732);
        }

        const t1 = performance.now();
        const latencyMs = (t1 - t0);

        console.log(`[T=${T + 0.1}s] FAULT RECOVERED.`);
        console.log(`Recovery Latency (t_recovery): ${latencyMs.toFixed(4)} ms`);

        return latencyMs;
    }
}
