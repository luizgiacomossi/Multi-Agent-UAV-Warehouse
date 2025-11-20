import { World } from './World';
import { Swarm, Drone } from './Drone';
import { CollisionEvent, GenerationTheme } from '../types';
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

    public generateWorld(theme: string, size: number, enableStations: boolean) {
        this.world.setSize(size);
        this.world.generate(theme);
        
        if (enableStations) {
            const stationCount = size > 20 ? 3 : 1;
            this.world.generateStations(stationCount);
        }
    }

    public initializeAgents(count: number, battery: number, deployFromBase: boolean) {
        if (deployFromBase) {
             const baseSize = Math.ceil(Math.sqrt(count));
             this.world.clearZone(0, 0, 0, baseSize + 1, 3, baseSize + 1);
        }

        this.swarm.resize(count, battery);
        this.swarm.initializeScenario(this.world, deployFromBase);
    }

    public async runPathfinding(
        algorithmName: string, 
        isRoundTrip: boolean
    ): Promise<{ agents: Drone[], collisions: CollisionEvent[], maxTicks: number }> {
        
        const strategy = this.algorithms[algorithmName];
        if (!strategy) throw new Error(`Algorithm ${algorithmName} not found`);

        // Reset status
        this.swarm.drones.forEach(d => {
            d.destructionTime = undefined;
            d.status = 'idle';
            d.path = [];
        });

        const baseMaxTime = Math.max(200, this.world.size * this.world.size / 2);
        strategy.setMaxTimeSteps(isRoundTrip ? baseMaxTime * 2 : baseMaxTime);

        // Execute Planning
        // Strategy acts directly on the swarm instances
        strategy.plan(this.swarm, this.world, isRoundTrip);

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

        // Return a deep copy for React state stability if needed, 
        // or rely on the fact that the objects are updated.
        // We return clones to ensure React sees them as new objects if we replace the array.
        const agents = this.swarm.drones.map(d => d.clone());
        const maxTicks = Math.max(...agents.map(a => a.path.length), 0);

        return { agents, collisions, maxTicks };
    }
}