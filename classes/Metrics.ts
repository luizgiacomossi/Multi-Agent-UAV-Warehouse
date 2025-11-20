
import { Agent, ENERGY_COSTS } from '../types';
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
     * Calculates a snapshot of simulation statistics for a specific tick.
     */
    static calculate(agents: Agent[], tick: number, batteryEnabled: boolean = true): SimulationStats {
        let active = 0;
        let delivered = 0;
        let destroyed = 0;
        let distance = 0;
        let blocked = 0;
        let deadBattery = 0;
        let totalEnergyConsumed = 0;

        agents.forEach(agent => {
            let isDeadBattery = false;
            let isDestroyedNow = false;
            let effectiveTick = 0;

            if (agent instanceof Drone) {
                isDestroyedNow = agent.destructionTime !== undefined && tick >= agent.destructionTime;

                // Dead Battery check mimics Drone.ts falling logic
                // Only count as "Fell" if we are past the point where it ran out
                if (agent.status === 'out_of_battery') {
                    const pathEnd = agent.path.length - 1;
                    if (tick >= pathEnd) isDeadBattery = true;
                }

                // Count Deliveries: check all delivery timestamps against current tick
                if (!isDestroyedNow && !isDeadBattery && agent.deliveryTimes) {
                    delivered += agent.deliveryTimes.filter(t => tick >= t).length;
                }

                effectiveTick = Math.min(tick, agent.path.length - 1);
            } else {
                effectiveTick = Math.min(tick, agent.path.length - 1);
            }

            // Blocked Check
            if (agent.status === 'blocked' || agent.path.length <= 1) {
                blocked++;
                return;
            }

            distance += Math.max(0, effectiveTick);

            // Energy Estimate Calculation
            // We iterate through the path taken SO FAR to sum up move vs wait costs
            if (batteryEnabled) {
                for (let i = 1; i <= effectiveTick && i < agent.path.length; i++) {
                    const prev = agent.path[i - 1];
                    const curr = agent.path[i];
                    if (prev.x === curr.x && prev.y === curr.y && prev.z === curr.z) {
                        totalEnergyConsumed += ENERGY_COSTS.WAIT;
                    } else {
                        totalEnergyConsumed += ENERGY_COSTS.MOVE;
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

        const totalLost = destroyed + deadBattery;
        const avgEnergy = agents.length > 0 ? (totalEnergyConsumed / agents.length) : 0;

        return {
            active,
            delivered,
            destroyed,
            distance,
            blocked,
            deadBattery,
            totalEnergyConsumed,
            totalLost,
            avgEnergy
        };
    }
}
