
import { World } from './World';
import { Swarm, Drone } from './Drone';
import { Warehouse } from './Warehouse';
import { CollisionEvent, GenerationTheme, Position3D } from '../types';
import { ReservedZone } from './WorldGenerator';
import { 
    PathFindingStrategy, 
    NaivePlanner, 
    CooperativePlanner, 
    EnergySaverPlanner, 
    CollisionAnalyzer 
} from './PathPlanner';

export class SimulationManager {
    public world: World;
    public swarm: Swarm;
    private algorithms: Record<string, PathFindingStrategy>;

    constructor(defaultSize: number = 24, defaultAgentCount: number = 8) {
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

    public generateWorld(theme: string, size: number, enableStations: boolean, deployFromBase: boolean, agentCount: number) {
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

        this.world.generate(theme, reservedZone);
        
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

    public async runPathfinding(
        algorithmName: string, 
        isRoundTrip: boolean,
        isInfiniteMode: boolean = false,
        maxAltitude: number = 24,
        batteryEnabled: boolean = true
    ): Promise<{ agents: Drone[], collisions: CollisionEvent[], maxTicks: number }> {
        
        const strategy = this.algorithms[algorithmName];
        if (!strategy) throw new Error(`Algorithm ${algorithmName} not found`);

        // Reset status
        this.swarm.drones.forEach(d => {
            d.destructionTime = undefined;
            d.status = 'idle';
            d.path = [];
        });

        // In infinite mode, we generate a sequence of missions (loops).
        // 5 loops usually provides enough "infinite" feel before the user resets or we could regenerate.
        const missionCount = isInfiniteMode ? 5 : 1;
        
        // If infinite mode, we need to generate extra random goals for each agent
        const missionQueues = new Map<string, Position3D[]>();
        
        if (isInfiniteMode) {
            const warehouse = this.world.warehouse;
            const yLimit = Math.min(this.world.size - 1, maxAltitude);
            
            this.swarm.drones.forEach(drone => {
                const queue: Position3D[] = [drone.goal]; // First goal is the one set in initialize
                
                for(let i = 0; i < missionCount - 1; i++) {
                    let nextGoal: Position3D;
                    let attempts = 0;
                    
                    while (attempts < 100) {
                        nextGoal = {
                            x: Math.floor(Math.random() * this.world.size),
                            y: Math.floor(Math.random() * yLimit),
                            z: Math.floor(Math.random() * this.world.size)
                        };
                        
                        // Avoid obstacles and warehouse interior
                        const inWarehouse = warehouse ? 
                            (nextGoal.x >= warehouse.position.x && nextGoal.x < warehouse.position.x + warehouse.baseSize && 
                             nextGoal.z >= warehouse.position.z && nextGoal.z < warehouse.position.z + warehouse.baseSize && 
                             nextGoal.y < 3) : false;

                        if (!this.world.isBlocked(nextGoal.x, nextGoal.y, nextGoal.z) && !inWarehouse) {
                            break;
                        }
                        attempts++;
                    }
                    queue.push(nextGoal!);
                }
                missionQueues.set(drone.id, queue);
            });
        }

        const baseMaxTime = Math.max(200, this.world.size * this.world.size / 2);
        // Extend time budget for multiple loops
        strategy.setMaxTimeSteps(baseMaxTime * (missionCount * 2)); // *2 for round trips

        // Execute Planning
        // Pass maxBattery as undefined if battery simulation is disabled, so pathfinders don't prune based on energy
        const effectiveBattery = batteryEnabled ? undefined : Number.MAX_SAFE_INTEGER; // undefined means usage defaults to drone.maxBattery in logic, we want to override
        
        strategy.plan(this.swarm, this.world, isRoundTrip || isInfiniteMode, missionQueues, maxAltitude, batteryEnabled);

        // Detect Collisions
        let collisions = CollisionAnalyzer.detect(this.swarm);

        // Handle Unsafe Destruction
        if (!strategy.isSafe) {
            collisions.sort((a, b) => a.time - b.time);
            const destroyedIds = new Set<string>();
            
            collisions.forEach(col => {
                col.agentIds.forEach(id => {
                    if(destroyedIds.has(id)) return;
                    const drone = this.swarm.drones.find(d => d.id === id);
                    if (drone) {
                        drone.destructionTime = col.time;
                        drone.status = 'destroyed';
                        destroyedIds.add(id);
                    }
                });
            });
        }

        // Return a deep copy for React state stability
        const agents = this.swarm.drones.map(d => d.clone());
        const maxTicks = Math.max(...agents.map(a => a.path.length), 0);

        return { agents, collisions, maxTicks };
    }
}
