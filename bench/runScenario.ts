import { SimulationManager } from '../classes/SimulationManager';
import { CBSPlanner } from '../classes/CBSPlanner';
import { withSeed } from '../utils/Random';
import { BenchmarkPlan, ScenarioSpec } from './scenarios';
import { MissionMetrics, computeMissionMetrics } from './metrics';

/** One algorithm on one scenario: identifiers, success flag, runtime and mission metrics. */
export interface RunRecord extends Partial<MissionMetrics> {
  scale: string;
  gridSize: number;
  pallets: number;
  forklifts: number;
  drones: number;
  allocationMode: string;
  completionMode: string;
  repetition: number;
  seed: number;
  algorithm: string;
  ok: boolean;
  error?: string;
  planningMs: number;
  cbsNodesExpanded?: number;
  cbsFallbacks?: number;
}

/** Runs `fn` with console output suppressed (the engine logs every allocation). */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const { log, info, warn } = console;
  console.log = console.info = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, info, warn });
  }
}

/** Builds the scenario's world and swarm from its seed. */
async function buildScenario(spec: ScenarioSpec, plan: BenchmarkPlan): Promise<SimulationManager> {
  return withSeed(spec.seed, () => {
    const { gridSize, pallets, forklifts } = spec.scale;
    const manager = new SimulationManager(gridSize, spec.drones);
    manager.generateWorld('Warehouse', gridSize, false, true, spec.drones, pallets, forklifts, 'mixed');
    manager.initializeAgents(spec.drones, plan.batteryCapacity, true, gridSize);
    return manager;
  });
}

/**
 * Runs every algorithm of the plan on the same scenario. Each run re-seeds the random source with
 * the scenario seed, so in-run randomness (e.g. cluster seeding) is identical across algorithms.
 */
export async function runScenario(spec: ScenarioSpec, plan: BenchmarkPlan): Promise<RunRecord[]> {
  const manager = await quietly(() => buildScenario(spec, plan));
  const records: RunRecord[] = [];

  for (const algorithm of plan.algorithms) {
    const strategy = manager.getStrategy(algorithm);
    const cbs = strategy instanceof CBSPlanner ? strategy : null;
    cbs?.resetStats();

    const base: RunRecord = {
      scale: spec.scale.label,
      gridSize: spec.scale.gridSize,
      pallets: manager.world.pallets.length,
      forklifts: manager.world.forklifts.length,
      drones: spec.drones,
      allocationMode: spec.allocationMode,
      completionMode: spec.completionMode,
      repetition: spec.repetition,
      seed: spec.seed,
      algorithm,
      ok: false,
      planningMs: 0,
    };

    const started = performance.now();
    try {
      const result = await quietly(() => withSeed(spec.seed, () => manager.runPathfinding(
        algorithm,
        plan.roundTrip,
        plan.missionsPerDrone,
        spec.scale.gridSize,
        plan.batteryEnabled,
        spec.allocationMode,
        plan.clusterRadius,
        plan.maxClusterSize,
        spec.completionMode
      )));
      records.push({
        ...base,
        ok: true,
        planningMs: performance.now() - started,
        ...computeMissionMetrics(result.agents, result.incidents, result.maxTicks, manager.world.pallets.length),
        ...(cbs ? { cbsNodesExpanded: cbs.getStats().nodesExpanded, cbsFallbacks: cbs.getStats().fallbacks } : {}),
      });
    } catch (e: any) {
      records.push({ ...base, planningMs: performance.now() - started, error: e?.message ?? String(e) });
    }
  }
  return records;
}
