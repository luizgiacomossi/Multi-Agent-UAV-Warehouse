
import { World } from './World';
import { Swarm, Drone } from './Drone';
import { Warehouse } from './Warehouse';
import { SimulationIncident, Position3D, Pallet, ClusterVisualization, TaskPriorityMode, MissionCompletionMode } from '../types';
import { ReservedZone } from './WorldGenerator';
import { KDTree } from '../utils/KDTree';
import { TaskCluster } from './TaskCluster';
import {
    PathFindingStrategy,
    NaivePlanner,
    CooperativePlanner,
    EnergySaverPlanner,
    CollisionAnalyzer,
    SpaceTimeReservations,
    MAX_LEG_RETRIES
} from './PathPlanner';
import { CostModel } from './CostModel';
import { CBSPlanner } from './CBSPlanner';
import { Task } from '../types';
import { MAX_TIMESTEPS, GRID_SIZE, DEFAULT_AGENT_COUNT, MATH_CONSTANTS } from '../SimulationConfig';
import { random } from '../utils/Random';

type PalletReservation = {
    droneId: string;
    mode: 'single' | 'cluster';
    clusterId?: string;
};

// class SimulationManager is the main class that manages the simulation
// it connects the frontend (UI) and the backend (Simulation logic)
export class SimulationManager {
    public world: World;
    public swarm: Swarm;
    private algorithms: Record<string, PathFindingStrategy>;
    private palletAssignments = new Map<string, PalletReservation>();
    private completedPalletIds = new Set<string>();
    private abandonCounts = new Map<string, number>();
    private unreachablePalletIds = new Set<string>();

    /** A pallet abandoned this many times is treated as unreachable and no longer offered. */
    private static readonly MAX_PALLET_ABANDONS = 2;

    /**
     * Drones whose clocks are within this many ticks of the earliest pending event are planned in
     * the same cycle (lets CBS plan them jointly while keeping drones roughly in time order).
     */
    private static readonly EVENT_SYNC_WINDOW_TICKS = 10;

    constructor(defaultSize: number = GRID_SIZE, defaultAgentCount: number = DEFAULT_AGENT_COUNT) {
        this.world = new World(defaultSize);
        this.swarm = new Swarm(defaultAgentCount);

        this.algorithms = {
            'Naive': new NaivePlanner(),
            'Cooperative': new CooperativePlanner(),
            'Energy Saver': new EnergySaverPlanner(),
            'CBS': new CBSPlanner(new CooperativePlanner()),
        };
    }

    public getAvailableAlgorithms(): string[] {
        return Object.keys(this.algorithms);
    }

    /** The registered strategy instance, e.g. to read planner-specific statistics in experiments. */
    public getStrategy(name: string): PathFindingStrategy | undefined {
        return this.algorithms[name];
    }

    public getAlgorithmDescription(name: string): string {
        return this.algorithms[name]?.description || "";
    }

    public generateWorld(theme: string, size: number, enableStations: boolean, deployFromBase: boolean, agentCount: number, totalTasks: number = 50, numForklifts: number = 3, priorityMode: TaskPriorityMode = 'mixed') {
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

        this.world.generate(theme, reservedZone, totalTasks, numForklifts, priorityMode);

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
        let reqPayload = random() > 0.5 ? 'camera' : 'rfid';
        let palletId: string | undefined = undefined;

        // Try to assign a real Pallet if in Warehouse mode
        if (this.world.pallets && this.world.pallets.length > 0) {
            // Prefer pallets that haven't been scanned yet
            const unscanned = this.world.pallets.filter(plt => !scannedPalletIds.has(plt.id));
            // If all pallets done, reset and re-scan everything (full cycle complete)
            const pool = unscanned.length > 0 ? unscanned : this.world.pallets;

            const plt = pool[Math.floor(random() * pool.length)];
            p = { x: plt.position.x, y: plt.position.y, z: plt.position.z };
            reqPayload = plt.payload_type;
            palletId = plt.id;
            return {
                id: 'T-' + random().toString(36).substr(2, 9),
                target: p,
                req_payload: reqPayload,
                palletId: palletId,
                pi_k: plt.weight / 100,
                t_hover: 5,
                status: 'PENDING'
            };
        } else {
            // Fallback to random coordinate ONLY if not in a Warehouse
            const worldSizeX = this.world?.size || 24;
            const worldSizeZ = this.world?.size || 24;
            const yLimit = Math.min(worldSizeX - 1, maxAltitude || 10);

            while (attempts < 200) {
                p = {
                    x: Math.floor(random() * worldSizeX),
                    y: Math.floor(random() * yLimit),
                    z: Math.floor(random() * worldSizeZ)
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
            id: 'T-' + random().toString(36).substr(2, 9),
            target: p,
            req_payload: reqPayload,
            palletId: palletId,
            pi_k: random() * 0.9 + 0.1,
            t_hover: 5,
            status: 'PENDING'
        };
    }

    private distanceManhattan(a: Position3D, b: Position3D): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
    }

    /**
     * Deterministic cluster seed: the highest-priority pallet, so urgent pallets anchor full clusters
     * instead of being left over as singletons. Ties go to the pallet with the most compatible
     * neighbours (fills clusters, fewer trips), then to pool order.
     */
    private pickClusterSeed(pool: Pallet[], neighboursOf: (pallet: Pallet) => Pallet[]): Pallet {
        const topWeight = Math.max(...pool.map(p => p.weight));
        const candidates = pool.filter(p => p.weight === topWeight);
        if (candidates.length === 1) return candidates[0];

        let seed = candidates[0];
        let seedDensity = neighboursOf(seed).length;
        for (const candidate of candidates.slice(1)) {
            const density = neighboursOf(candidate).length;
            if (density > seedDensity) {
                seed = candidate;
                seedDensity = density;
            }
        }
        return seed;
    }

    private buildLocalizedClusters(pallets: Pallet[], clusterRadius: number, maxClusterSize: number, maxClusters: number): TaskCluster[] {
        const pool = [...pallets];
        const clusters: TaskCluster[] = [];

        while (pool.length > 0 && clusters.length < maxClusters) {
            const kdTree = new KDTree<Pallet>(pool, p => p.position);
            const neighboursOf = (pallet: Pallet) => kdTree
                .rangeQuery(pallet.position, clusterRadius)
                .filter(p => p.payload_type === pallet.payload_type);
            const seed = this.pickClusterSeed(pool, neighboursOf);

            const neighbors = neighboursOf(seed)
                .sort((a, b) => this.distanceManhattan(a.position, seed.position) - this.distanceManhattan(b.position, seed.position))
                .slice(0, Math.max(1, maxClusterSize));

            const clusterTasks = neighbors.map(plt => ({
                id: 'T-' + random().toString(36).substr(2, 9),
                target: { ...plt.position },
                req_payload: plt.payload_type,
                palletId: plt.id,
                pi_k: plt.weight / 100,
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

    private resetPalletTracking() {
        this.palletAssignments.clear();
        this.completedPalletIds.clear();
        this.abandonCounts.clear();
        this.unreachablePalletIds.clear();
    }

    /**
     * Releases every pallet reserved by a drone that gave up on its task, returning them to the
     * pool. Pallets abandoned MAX_PALLET_ABANDONS times are marked unreachable instead.
     */
    private releaseDronePallets(droneId: string) {
        for (const [palletId, reservation] of [...this.palletAssignments.entries()]) {
            if (reservation.droneId !== droneId) continue;
            this.palletAssignments.delete(palletId);
            const count = (this.abandonCounts.get(palletId) || 0) + 1;
            this.abandonCounts.set(palletId, count);
            if (count >= SimulationManager.MAX_PALLET_ABANDONS) {
                this.unreachablePalletIds.add(palletId);
            }
        }
    }

    private reservePallet(palletId: string | undefined, reservation: PalletReservation) {
        if (!palletId || this.completedPalletIds.has(palletId)) return;
        this.palletAssignments.set(palletId, reservation);
    }

    private reserveCluster(cluster: TaskCluster, droneId: string) {
        cluster.tourSequence.forEach(task => {
            this.reservePallet(task.palletId, {
                droneId,
                mode: 'cluster',
                clusterId: cluster.id
            });
        });
    }

    private completePallet(palletId: string | undefined) {
        if (!palletId) return;
        this.palletAssignments.delete(palletId);
        this.completedPalletIds.add(palletId);
    }

    /**
     * Latest clock (tick) a drone may have to act in this cycle: the earliest clock among drones with
     * a leg to fly, plus a small sync window. With no leg pending, every idle drone may act.
     */
    private nextEventHorizon(): number {
        const pendingClocks = this.swarm.drones
            .filter(d => d.status !== 'STRANDED' && d.mission.getNextTarget() !== null)
            .map(d => d.path.length - 1);
        if (pendingClocks.length === 0) return Infinity;
        return Math.min(...pendingClocks) + SimulationManager.EVENT_SYNC_WINDOW_TICKS;
    }

    /**
     * Idle drones parked on their dock swap/charge their battery before the next dispatch. The
     * battery model recharges on a waiting tick at the dock (Drone.calculateStateAt), so a single
     * hover tick restores full capacity. Without it, drones returning below the task threshold
     * were never dispatched again and the fleet ran dry.
     */
    private rechargeDockedDrones(drones: Drone[]) {
        drones.forEach(drone => {
            if (drone.battery >= drone.maxBattery || !this.isAtDock(drone)) return;
            drone.path.push({ ...drone.path[drone.path.length - 1] });
            drone.battery = drone.maxBattery;
        });
    }

    private isAtDock(drone: Drone): boolean {
        const pos = drone.path[drone.path.length - 1];
        const dock = drone.mission.warehouseLocation;
        return !!pos && pos.x === dock.x && pos.y === dock.y && pos.z === dock.z;
    }

    /** Scans planned after a drone was lost (crash or dead battery) never happened. */
    private discardScansAfter(drone: Drone, tick: number) {
        drone.scanLog = drone.scanLog.filter(entry => entry.tick <= tick);
    }

    private getAvailablePallets(): Pallet[] {
        return this.world.pallets.filter(plt =>
            !this.completedPalletIds.has(plt.id) &&
            !this.palletAssignments.has(plt.id) &&
            !this.unreachablePalletIds.has(plt.id)
        );
    }

    public async runPathfinding(
        algorithmName: string,
        isRoundTrip: boolean,
        missionCount: number = 1,
        maxAltitude: number = 24,
        batteryEnabled: boolean = true,
        allocationMode: '1-to-1' | 'Cluster' = '1-to-1',
        clusterRadius: number = 5,
        maxClusterSize: number = 3,
        missionCompletionMode: MissionCompletionMode = 'count'
    ): Promise<{ agents: Drone[], incidents: SimulationIncident[], maxTicks: number, clusters: ClusterVisualization[] }> {

        const isAllPalletsMode = missionCompletionMode === 'all-pallets';
        const effectiveMissionCount = isAllPalletsMode
            ? Math.max(this.world.pallets.length, missionCount, 1)
            : missionCount;

        const strategy = this.algorithms[algorithmName];
        if (!strategy) throw new Error(`Algorithm ${algorithmName} not found`);

        const reservedSpaceTime = new SpaceTimeReservations(); // Persist reservations across legs with ownership
        const clusters: ClusterVisualization[] = [];
        const activeClustersByDrone = new Map<string, ClusterVisualization>();

        // 1. Setup Initial Missions using MissionController
        // Each drone docks at its own warehouse slot. A single shared dock cell would be
        // reserved by the first drone to land, leaving every other return leg unreachable.
        const dockFor = (index: number, drone: Drone): Position3D =>
            this.world.warehouse ? this.world.warehouse.getSpawnLocation(index) : { ...drone.start };
        this.swarm.drones.forEach((drone, index) => {
            // Every run starts from the scenario's first targets (set in initializeScenario)
            drone.restoreInitialAssignment();
            // sync MissionController with the correct pallet context and docking slot
            drone.setMissionConfig(drone.start, drone.goal, effectiveMissionCount, isRoundTrip, dockFor(index, drone));
            // Re-apply pallet metadata that initializeScenario set, since setMissionConfig resets mission
            if (drone.currentPalletId) {
                drone.mission.currentPalletId = drone.currentPalletId;
                drone.mission.currentScanType = drone.currentScanType || null;
            }
        });
        this.resetPalletTracking();
        if (isAllPalletsMode) {
            this.swarm.drones.forEach((drone, index) => {
                drone.mission.reset();
                drone.mission.warehouseLocation = dockFor(index, drone);
                drone.mission.configure(effectiveMissionCount, isRoundTrip);
                drone.goal = { ...drone.start };
                drone.currentPalletId = undefined;
                drone.currentScanType = undefined;
            });
        } else {
            this.swarm.drones.forEach(drone => {
                this.reservePallet(drone.currentPalletId, {
                    droneId: drone.id,
                    mode: 'single'
                });
            });
        }

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
                const h1 = (pos.x) + (pos.y * 64) + (pos.z * 4096) + (t * 262144);
                const h2 = (pos.x) + ((pos.y + 1) * 64) + (pos.z * 4096) + (t * 262144);
                reservedSpaceTime.addVertex(h1, 'FORKLIFT');
                reservedSpaceTime.addVertex(h2, 'FORKLIFT'); // Extra height block

                if (t > 0) {
                    const prevPos = fl.path[(t - 1) % fl.path.length];
                    // Directed edge at ground level
                    reservedSpaceTime.addEdge(
                        { x: prevPos.x, y: prevPos.y, z: prevPos.z },
                        { x: pos.x, y: pos.y, z: pos.z },
                        t - 1,
                        'FORKLIFT'
                    );
                    // Directed edge at height block level
                    reservedSpaceTime.addEdge(
                        { x: prevPos.x, y: prevPos.y + 1, z: prevPos.z },
                        { x: pos.x, y: pos.y + 1, z: pos.z },
                        t - 1,
                        'FORKLIFT'
                    );
                }
            }
        });

        // Maximum theoretical legs = missionCount * clusterCapacity * 2 (Outbound/Inbound padding)
        const maxLegTries = Math.max(effectiveMissionCount, this.world.pallets.length, 1) * 15;
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

            // A. Plan the next leg of the drones whose turn it is (earliest clocks first).
            // Planning every drone each cycle let clocks drift apart by hundreds of ticks, so a drone
            // that was free early could not pick up tasks another drone only took much later.
            const eventHorizon = this.nextEventHorizon();
            const isDue = (drone: Drone) => drone.path.length - 1 <= eventHorizon;
            const dueSwarm = new Swarm(0);
            dueSwarm.drones = this.swarm.drones.filter(d => d.status !== 'STRANDED' && d.mission.getNextTarget() !== null && isDue(d));
            strategy.planLeg(dueSwarm, this.world, 0, reservedSpaceTime, maxAltitude, batteryEnabled);
            const plannedIds = new Set(dueSwarm.drones.map(d => d.id));

            // B. Update Mission States and Batch Assign using Munkres
            const idleDrones: Drone[] = [];
            this.swarm.drones.forEach(drone => {
                if (drone.status === 'STRANDED') {
                    return;
                }

                if (drone.mission.state === 'IDLE') {
                    // Only allocate once no busy drone could still become free earlier
                    if (isDue(drone)) idleDrones.push(drone);
                    return;
                }

                if (!plannedIds.has(drone.id)) return; // its current leg is still in progress

                // No path this cycle: the drone hovered in place and keeps its leg for a retry.
                if (drone.lastLegFailed) {
                    drone.lastLegFailed = false;
                    const hasTask = drone.mission.state === 'OUTBOUND' || drone.mission.state === 'EXECUTING_TOUR';
                    if (!hasTask || drone.legFailures < MAX_LEG_RETRIES) return;

                    // Target stayed unreachable: drop the task instead of stranding the drone
                    const endTick = drone.path.length - 1;
                    const abandonedPallet = drone.mission.currentPalletId;
                    const lastLog = drone.assignedTasksLog[drone.assignedTasksLog.length - 1];
                    if (lastLog && lastLog.palletId === abandonedPallet) lastLog.endTick = endTick;
                    const activeCluster = activeClustersByDrone.get(drone.id);
                    if (activeCluster) {
                        activeCluster.endTick = endTick;
                        activeClustersByDrone.delete(drone.id);
                    }
                    console.warn(`[${drone.name}] Abandoned unreachable task ${abandonedPallet ?? ''} after ${drone.legFailures} failed plans`);

                    this.releaseDronePallets(drone.id);
                    drone.mission.abandonTask();
                    drone.legFailures = 0;
                    drone.currentPalletId = undefined;
                    drone.currentScanType = undefined;
                    // After abandoning, the drone either heads home (RETURNING) or is free (IDLE)
                    const nextTarget = drone.mission.getNextTarget();
                    if (nextTarget) drone.goal = { ...nextTarget };
                    else idleDrones.push(drone);
                    return;
                }

                const prevPallet = drone.mission.currentPalletId;
                const prevCluster = drone.mission.currentCluster;
                const readyForNew = drone.mission.completeLeg();
                this.completePallet(prevPallet);

                // Keep drone mirror properties in sync with mission controller
                drone.currentPalletId = drone.mission.currentPalletId || undefined;
                drone.currentScanType = drone.mission.currentScanType || undefined;
                const nextTarget = drone.mission.getNextTarget();
                if (nextTarget) {
                    drone.goal = { ...nextTarget };
                }

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

                if (readyForNew && drone.mission.state !== 'COMPLETED' && isDue(drone)) {
                    idleDrones.push(drone);
                }
            });

            if (idleDrones.length > 0) {
                // Synchronize residual battery for idle drones before evaluating assignment feasibility
                if (batteryEnabled) {
                    idleDrones.forEach(drone => {
                        const tick = drone.path.length > 0 ? drone.path.length - 1 : 0;
                        drone.battery = drone.calculateStateAt(tick, this.world.chargeStations, batteryEnabled).battery;
                    });
                    this.rechargeDockedDrones(idleDrones);
                }

                const dMax = this.world.size * 2; // Approximate valid maximum structural traversal
                const pBase = this.world.warehouse?.position || { x: 0, y: 0, z: 0 };

                if (allocationMode === 'Cluster' && this.world.pallets && this.world.pallets.length > 0) {
                    const unscanned = this.getAvailablePallets();

                    if (unscanned.length > 0) {
                        // Gather compatible pallets for idle drones based on payload requirements
                        const availablePayloads = new Set(idleDrones.flatMap(d => d.payload));
                        const compatiblePallets = unscanned.filter(plt => availablePayloads.has(plt.payload_type));
                        const pool = compatiblePallets.length > 0 ? compatiblePallets : unscanned;
                        const pendingClusters = this.buildLocalizedClusters(pool, clusterRadius, maxClusterSize, idleDrones.length);

                        // Fire the Munkres Cost Engine for spatial matching
                        if (pendingClusters.length > 0) {
                            const assignments = CostModel.executeClusterAllocation(idleDrones, pendingClusters, pBase, dMax);

                            assignments.forEach(a => {
                                const drone = idleDrones.find(d => d.id === a.drone.id);
                                if (drone) {
                                    drone.mission.assignClusterMission(a.cluster);
                                    drone.goal = { ...a.cluster.tourSequence[0].target };
                                    drone.currentPalletId = a.cluster.tourSequence[0].palletId;
                                    drone.currentScanType = a.cluster.tourSequence[0].req_payload;
                                    this.reserveCluster(a.cluster, drone.id);
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
                    const unscanned = this.world.pallets ? this.getAvailablePallets() : [];

                    if (unscanned.length > 0) {
                        // Gather compatible pallets for idle drones based on payload requirements
                        const availablePayloads = new Set(idleDrones.flatMap(d => d.payload));
                        const compatiblePallets = unscanned.filter(plt => availablePayloads.has(plt.payload_type));
                        
                        // Candidate pool: provide a wider window so Munkres is never starved by incompatible tasks
                        const candidateLimit = Math.max(idleDrones.length * 4, 20);
                        const pool = (compatiblePallets.length > 0 ? compatiblePallets : unscanned).slice(0, candidateLimit);

                        const pendingTasks: Task[] = pool.map(plt => ({
                            id: 'T-' + random().toString(36).substr(2, 9),
                            target: { ...plt.position },
                            req_payload: plt.payload_type,
                            palletId: plt.id,
                            pi_k: plt.weight / 100,
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
                                    this.reservePallet(a.task.palletId, {
                                        droneId: drone.id,
                                        mode: 'single'
                                    });

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

            if (isAllPalletsMode) {
                const resolvedPallets = this.completedPalletIds.size + this.unreachablePalletIds.size;
                const allPalletsChecked = this.world.pallets.length > 0 && resolvedPallets >= this.world.pallets.length;

                // Every pallet is done: idle drones land (complete on their dock, or fly home first)
                if (allPalletsChecked) {
                    this.swarm.drones.forEach(drone => {
                        if (drone.status === 'STRANDED' || drone.mission.state !== 'IDLE') return;
                        if (this.isAtDock(drone)) {
                            drone.mission.state = 'COMPLETED';
                        } else {
                            drone.mission.returnToDock();
                            drone.goal = { ...drone.mission.warehouseLocation };
                        }
                    });
                }
            }

            // Break early if everyone is finished/blocked
            const everyoneDone = this.swarm.drones.every(d => d.mission.state === 'COMPLETED' || d.status === 'STRANDED');
            if (everyoneDone) break;

            // Idle drones that got no task and are away from their dock fly home: a drone never
            // waits (or finishes) airborne.
            idleDrones
                .filter(d => d.mission.state === 'IDLE' && !this.isAtDock(d))
                .forEach(d => {
                    d.mission.returnToDock();
                    d.goal = { ...d.mission.warehouseLocation };
                });

            // Stop once nothing can progress: no drone has a leg to fly, no idle drone is still
            // waiting for its turn, and allocation found no feasible task.
            const anyActiveLeg = this.swarm.drones.some(d => d.status !== 'STRANDED' && d.mission.getNextTarget() !== null);
            const idleAwaitingTurn = this.swarm.drones.some(d =>
                d.status !== 'STRANDED' && d.mission.state === 'IDLE' && !idleDrones.includes(d)
            );
            if (!anyActiveLeg && !idleAwaitingTurn) break;
        }

        // Ensure any drone completing flight at ground/clearance level in a forklift aisle ascends to safe hover altitude (y >= 2)
        this.swarm.drones.forEach(drone => {
            if (drone.path.length > 0 && drone.status !== 'STRANDED') {
                const last = drone.path[drone.path.length - 1];
                const isForkliftCorridor = last.y <= 1 && (this.world.forklifts || []).some(fl => 
                    fl.path && fl.path.some(p => p.x === last.x && p.z === last.z)
                );
                if (isForkliftCorridor) {
                    for (let safeY = last.y + 1; safeY <= 2; safeY++) {
                        drone.path.push({ x: last.x, y: safeY, z: last.z });
                    }
                }
            }
        });

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
                    this.discardScansAfter(d, deathTick);
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
                    this.discardScansAfter(drone, col.time);
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
                drone.battery = Math.floor(random() * 50) + 50; // 50 to 100%
                drone.payload = [random() > 0.5 ? 'camera' : 'rfid']; // 1 item
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
                const consumedBat = (totalDist * MATH_CONSTANTS.GAMMA * MATH_CONSTANTS.BETA_FLY) + (alloc.task.t_hover * MATH_CONSTANTS.BETA_HOVER);
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
