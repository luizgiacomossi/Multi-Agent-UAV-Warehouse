import { Agent, SimulationIncident, MATH_CONSTANTS } from '../types';

/** Outcome metrics of one planned mission, independent of how it was produced. */
export interface MissionMetrics {
  /** Ticks until the last drone finishes. */
  makespan: number;
  /** Sum over drones of their path duration (ticks). */
  sumOfCosts: number;
  /** Completed pallet scans (a pallet scanned twice counts twice). */
  scans: number;
  /** Distinct pallets scanned divided by pallets in the warehouse. */
  palletCoverage: number;
  collisionsDroneDrone: number;
  collisionsDroneForklift: number;
  /** Drones destroyed in a collision. */
  lostDrones: number;
  batteryDeaths: number;
  /** Drones left without a path by the planner (neither crashed nor out of battery). */
  strandedDrones: number;
  /** Battery consumed by flight and hover (charging not subtracted), summed over drones. */
  energyConsumed: number;
  /** Grid cells travelled, summed over drones. */
  distance: number;
}

/** Computes mission metrics from a planned result. */
export function computeMissionMetrics(
  agents: Agent[],
  incidents: SimulationIncident[],
  makespan: number,
  palletCount: number
): MissionMetrics {
  const collisions = incidents.filter(i => i.type === 'collision');
  const batteryDead = new Set(
    incidents.filter(i => i.type === 'battery_dead').flatMap(i => i.agentIds)
  );
  const scanned = new Set(agents.flatMap(a => (a.scanLog ?? []).map(entry => entry.palletId)));

  let sumOfCosts = 0;
  let energyConsumed = 0;
  let distance = 0;
  for (const agent of agents) {
    sumOfCosts += Math.max(0, agent.path.length - 1);
    for (let i = 1; i < agent.path.length; i++) {
      const prev = agent.path[i - 1];
      const curr = agent.path[i];
      const moved = prev.x !== curr.x || prev.y !== curr.y || prev.z !== curr.z;
      energyConsumed += moved ? MATH_CONSTANTS.BETA_FLY : MATH_CONSTANTS.BETA_HOVER;
      if (moved) distance++;
    }
  }

  return {
    makespan,
    sumOfCosts,
    scans: agents.reduce((n, a) => n + (a.scanLog?.length ?? 0), 0),
    palletCoverage: palletCount > 0 ? scanned.size / palletCount : 0,
    // CollisionAnalyzer prefixes drone-forklift incidents with "fl-col-"
    collisionsDroneDrone: collisions.filter(i => !i.id.startsWith('fl-col-')).length,
    collisionsDroneForklift: collisions.filter(i => i.id.startsWith('fl-col-')).length,
    lostDrones: agents.filter(a => a.destructionTime !== undefined).length,
    batteryDeaths: batteryDead.size,
    strandedDrones: agents.filter(a =>
      a.status === 'STRANDED' && a.destructionTime === undefined && !batteryDead.has(a.id)
    ).length,
    energyConsumed,
    distance,
  };
}
