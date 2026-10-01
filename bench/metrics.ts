import { Agent, SimulationIncident, MATH_CONSTANTS, Position3D } from '../types';

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
  /** Battery consumed by flight and hover, scaled by the drain multiplier (charging not subtracted), summed over drones. */
  energyConsumed: number;
  /** Grid cells travelled, summed over drones. */
  distance: number;
  /** Charging sessions at charging stations (arrivals followed by waiting on a station). */
  stationVisits: number;
  /** Ticks drones spent waiting on charging stations. */
  stationTicks: number;
}

/** Computes mission metrics from a planned result. */
export function computeMissionMetrics(
  agents: Agent[],
  incidents: SimulationIncident[],
  makespan: number,
  palletCount: number,
  chargeStations: Position3D[] = []
): MissionMetrics {
  const stationCells = new Set(chargeStations.map(s => `${s.x},${s.y},${s.z}`));
  let stationVisits = 0;
  let stationTicks = 0;
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
      energyConsumed += (moved ? MATH_CONSTANTS.BETA_FLY : MATH_CONSTANTS.BETA_HOVER) * (agent.drainMultiplier ?? 1);
      if (moved) distance++;
      if (!moved && stationCells.has(`${curr.x},${curr.y},${curr.z}`)) {
        stationTicks++;
        const before = agent.path[i - 2];
        const arrivedLastTick = !before || before.x !== prev.x || before.y !== prev.y || before.z !== prev.z;
        if (arrivedLastTick) stationVisits++;
      }
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
    stationVisits,
    stationTicks,
  };
}
