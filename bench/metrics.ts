import { Agent, SimulationIncident, MATH_CONSTANTS, Position3D } from '../types';
import { SCAN_TICKS } from '../SimulationConfig';

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
  /**
   * Flight to a pallet against the allocation's estimate: battery used on the leg into each scan
   * (moves at β_fly, waits at β_hover) over β_fly times the grid (Manhattan) distance of the leg,
   * averaged over all scans. The allocation assumes γ.
   */
  legEnergyRatio: number;
  /** Share of scan legs whose ratio exceeds γ, i.e. legs the allocation underestimated. */
  legsAboveGamma: number;
}

/**
 * Energy ratio of every leg into a pallet scan (see MissionMetrics.legEnergyRatio). A leg starts
 * where the drone last ended a scan or last waited on a charger (its dock or a station), and ends
 * when it arrives at the pallet. Legs that cover no distance are skipped.
 */
export function scanLegEnergyRatios(agent: Agent, chargerCells: Set<string>): number[] {
  const key = (p: Position3D) => `${p.x},${p.y},${p.z}`;
  const dock = (agent as { mission?: { warehouseLocation?: Position3D } }).mission?.warehouseLocation ?? agent.start;
  const isCharger = (p: Position3D) => chargerCells.has(key(p)) || key(p) === key(dock);
  const ratios: number[] = [];
  let previousScanEnd = 0;
  for (const scan of [...(agent.scanLog ?? [])].sort((a, b) => a.tick - b.tick)) {
    const arrival = scan.tick - SCAN_TICKS;
    let start = previousScanEnd;
    for (let t = arrival - 1; t > start; t--) {
      if (isCharger(agent.path[t]) && key(agent.path[t]) === key(agent.path[t - 1])) { start = t; break; }
    }
    previousScanEnd = scan.tick;
    const from = agent.path[start];
    const to = agent.path[arrival];
    if (!from || !to) continue;
    const grid = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + Math.abs(to.z - from.z);
    if (grid === 0) continue;
    let used = 0;
    for (let t = start + 1; t <= arrival; t++) {
      const moved = key(agent.path[t]) !== key(agent.path[t - 1]);
      used += moved ? MATH_CONSTANTS.BETA_FLY : MATH_CONSTANTS.BETA_HOVER;
    }
    ratios.push(used / (MATH_CONSTANTS.BETA_FLY * grid));
  }
  return ratios;
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
  const legRatios = agents.flatMap(a => scanLegEnergyRatios(a, stationCells));

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
    legEnergyRatio: legRatios.length > 0 ? legRatios.reduce((a, b) => a + b, 0) / legRatios.length : 0,
    legsAboveGamma: legRatios.length > 0 ? legRatios.filter(r => r > MATH_CONSTANTS.GAMMA).length / legRatios.length : 0,
    stationTicks,
  };
}
