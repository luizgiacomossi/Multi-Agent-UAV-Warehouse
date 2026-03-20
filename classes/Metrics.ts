
import { Agent, MATH_CONSTANTS } from '../types';
import { Drone } from './Drone';

export interface SimulationStats {
    active: number;
    delivered: number;
    destroyed: number;
    distance: number;
    blocked: number;
    deadBattery: number;
    totalEnergyConsumed: number;
    totalLost: number;
    avgEnergy: number;
}

export class Metrics {
    /**
     * Calculates a snapshot of simulation statistics for a specific tick 
     */
    static calculate(agents: Agent[], tick: number, batteryEnabled: boolean = true): SimulationStats {
        let active = 0; // Number of active drones 
        let delivered = 0; // Number of checked packages 
        let destroyed = 0; // Number of destroyed drones 
        let distance = 0; // Total distance traveled by all drones 
        let blocked = 0; // Number of blocked drones 
        let deadBattery = 0; // Number of drones with dead batteries 
        let totalEnergyConsumed = 0; // Total energy consumed by all drones 

        agents.forEach(agent => {
            let isDeadBattery = false; // Whether the drone has a dead battery 
            let isDestroyedNow = false; // Whether the drone is destroyed 
            let effectiveTick = 0; // Effective tick for the drone 

            if (agent instanceof Drone) { // Check if the agent is a drone 

                // Check if the drone is destroyed 
                isDestroyedNow = agent.destructionTime !== undefined && tick >= agent.destructionTime;

                // Dead Battery check mimics Drone.ts falling logic
                // Only count as "Fell" if we are past the point where it ran out
                if (agent.status === 'STRANDED') {
                    const pathEnd = agent.path.length - 1;
                    if (tick >= pathEnd) isDeadBattery = true;
                }

                // Count pallet scans that have actually happened by this tick.
                // `scanLog` is the active source of truth; `deliveryTimes` is legacy.
                if (agent.scanLog) {
                    delivered += agent.scanLog.filter(entry => entry.tick <= tick).length;
                }

                effectiveTick = Math.min(tick, agent.path.length - 1);
            } else {
                effectiveTick = Math.min(tick, agent.path.length - 1);
            }

            // Blocked Check
            if (agent.status === 'STRANDED' || agent.path.length <= 1) {
                blocked++;
                return;
            }

            distance += Math.max(0, effectiveTick); // Add the distance traveled by the drone 

            // Energy Estimate Calculation
            // We iterate through the path taken SO FAR to sum up move vs wait costs
            if (batteryEnabled) { // Check if battery is enabled 
                for (let i = 1; i <= effectiveTick && i < agent.path.length; i++) { // Iterate through the path taken SO FAR to sum up move vs wait costs 
                    const prev = agent.path[i - 1]; // Get the previous position 
                    const curr = agent.path[i]; // Get the current position 
                    if (prev.x === curr.x && prev.y === curr.y && prev.z === curr.z) { // Check if the drone is hovering 
                        totalEnergyConsumed += MATH_CONSTANTS.BETA_HOVER; // Add the hover energy cost 
                    } else { // If the drone is not hovering 
                        totalEnergyConsumed += MATH_CONSTANTS.BETA_FLY; // Add the fly energy cost 
                    }
                }
            }

            if (isDestroyedNow) {
                destroyed++;
            } else if (isDeadBattery) {
                deadBattery++;
            } else {
                active++;
            }
        });

        const totalLost = destroyed + deadBattery; // Total number of lost drones 
        const avgEnergy = agents.length > 0 ? (totalEnergyConsumed / agents.length) : 0; // Average energy consumed by all drones 

        // log all metrics in one line
        console.log('active', active, 'delivered', delivered, 'destroyed', destroyed, 'distance', distance, 'blocked', blocked, 'deadBattery', deadBattery, 'totalEnergyConsumed', totalEnergyConsumed); // All metrics in one line 

        return {
            active, // Number of active drones 
            delivered, // Number of delivered packages 
            destroyed, // Number of destroyed drones 
            distance, // Total distance traveled by all drones 
            blocked, // Number of blocked drones 
            deadBattery, // Number of drones with dead batteries 
            totalEnergyConsumed, // Total energy consumed by all drones 
            totalLost, // Total number of lost drones 
            avgEnergy // Average energy consumed by all drones 
        };
    }
}
