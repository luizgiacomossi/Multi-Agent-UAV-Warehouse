
import { World } from './World';
import { Swarm, Drone } from './Drone';
import { Warehouse } from './Warehouse';
import { SimulationIncident, Position3D } from '../types';
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

    private generateRandomGoal(warehouse: Warehouse | null, maxAltitude: number): Position3D {
        const yLimit = Math.min(this.world.size - 1, maxAltitude);
        let attempts = 0;
        let goal: Position3D;

        while (attempts < 200) {
            goal = {
                x: Math.floor(Math.random() * this.world.size),
                y: Math.floor(Math.random() * yLimit),
                z: Math.floor(Math.random() * this.world.size)
            };
            
            const inWarehouse = warehouse ? 
                (goal.x >= warehouse.position.x && goal.x < warehouse.position.x + warehouse.baseSize && 
                 goal.z >= warehouse.position.z && goal.z < warehouse.position.z + warehouse.baseSize && 
                 goal.y < 3) : false;

            if (!this.world.isBlocked(goal.x, goal.y, goal.z) && !inWarehouse) {
                return goal;
            }
            attempts++;
        }
        return { x: 0, y: 0, z: 0 }; // Fallback
    }

    public async runPathfinding(
        algorithmName: string, 
        isRoundTrip: boolean,
        isInfiniteMode: boolean = false,
        maxAltitude: number = 24,
        batteryEnabled: boolean = true
    ): Promise<{ agents: Drone[], incidents: SimulationIncident[], maxTicks: number }> {
        
        const strategy = this.algorithms[algorithmName];
        if (!strategy) throw new Error(`Algorithm ${algorithmName} not found`);

        const missionCount = isInfiniteMode ? 3 : 1; // Reduced loops for better performance
        const reservedSpaceTime = new Set<number>(); // Persist reservations across legs for consistency

        // 1. Setup Initial Missions using MissionController
        this.swarm.drones.forEach(drone => {
            // We use the goal previously assigned in initializeScenario as the FIRST goal
            drone.setMissionConfig(drone.start, drone.goal, isInfiniteMode, isRoundTrip);
        });

        // 2. Iterative Simulation Loop
        // Instead of one giant plan, we plan leg-by-leg (Outbound -> Return -> Outbound...)
        
        // Maximum global ticks for safety
        const MAX_GLOBAL_TIME = 10000;
        strategy.setMaxTimeSteps(MAX_GLOBAL_TIME);

        for (let cycle = 0; cycle < missionCount * 2; cycle++) { // *2 because Out + Back = 2 legs
            
            // A. Plan Current Leg for all agents
            // The planner now just looks at where they are (end of current path) and where MissionController says to go.
            strategy.planLeg(this.swarm, this.world, 0, reservedSpaceTime, maxAltitude, batteryEnabled);

            // B. Update Mission States
            this.swarm.drones.forEach(drone => {
                const readyForNew = drone.mission.completeLeg();
                
                if (readyForNew) {
                    const newGoal = this.generateRandomGoal(this.world.warehouse, maxAltitude);
                    drone.mission.assignNewMission(newGoal);
                }
            });

            // Break early if everyone is finished/blocked
            const everyoneDone = this.swarm.drones.every(d => d.mission.state === 'COMPLETED' || d.status === 'blocked' || d.status === 'out_of_battery' || d.status === 'destroyed');
            if (everyoneDone) break;
        }

        // 3. Detect Collisions
        let collisions = CollisionAnalyzer.detect(this.swarm);
        
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
                     d.status = 'out_of_battery'; 
                }
            });
        }

        // Merge and Sort
        const incidents = [...collisions, ...batteryIncidents].sort((a, b) => a.time - b.time);

        // Handle Unsafe Destruction (Naive)
        if (!strategy.isSafe) {
            // Filter for collisions only
            const collisionIncidents = incidents.filter(i => i.type === 'collision');
            const destroyedIds = new Set<string>();
            
            collisionIncidents.forEach(col => {
                col.agentIds.forEach(id => {
                    if(destroyedIds.has(id)) return;
                    const drone = this.swarm.drones.find(d => d.id === id);
                    if (drone) {
                        drone.destructionTime = col.time;
                        drone.status = 'destroyed';
                        // Truncate path after destruction so they stop moving logically
                        if (drone.path.length > col.time + 1) {
                            drone.path = drone.path.slice(0, col.time + 1);
                        }
                        destroyedIds.add(id);
                    }
                });
            });
        }

        // Return a deep copy for React state stability
        const agents = this.swarm.drones.map(d => d.clone());
        const maxTicks = Math.max(...agents.map(a => a.path.length), 0);

        return { agents, incidents, maxTicks };
    }
}
