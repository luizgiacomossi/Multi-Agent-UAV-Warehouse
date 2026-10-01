import { MissionCompletionMode } from '../types';
import { INSTANT_CHARGE_RATE } from '../SimulationConfig';

export type AllocationMode = '1-to-1' | 'Cluster';

/** A warehouse size together with the workload that scales with it. */
export interface WarehouseScale {
  label: string;
  gridSize: number;
  pallets: number;
  forklifts: number;
}

/** A declarative experiment: the cartesian product of its dimensions, repeated with fixed seeds. */
export interface BenchmarkPlan {
  name: string;
  algorithms: string[];
  scales: WarehouseScale[];
  droneCounts: number[];
  allocationModes: AllocationMode[];
  completionModes: MissionCompletionMode[];
  /** Charging sites counting the base (1 = base only; each extra site is a one-drone station). */
  chargingSites: number[];
  repetitions: number;
  baseSeed: number;
  missionsPerDrone: number;
  batteryCapacity: number;
  batteryEnabled: boolean;
  roundTrip: boolean;
  /** Charging speed in % of capacity per tick; INSTANT_CHARGE_RATE restores a full battery in one tick. */
  chargeRate: number;
  clusterRadius: number;
  maxClusterSize: number;
}

/** One concrete scenario. Every algorithm is run on the same scenario (same seed). */
export interface ScenarioSpec {
  scale: WarehouseScale;
  drones: number;
  allocationMode: AllocationMode;
  completionMode: MissionCompletionMode;
  chargingSites: number;
  repetition: number;
  seed: number;
}

export const SCALES: Record<string, WarehouseScale> = {
  small: { label: 'S-12', gridSize: 12, pallets: 50, forklifts: 3 },
  medium: { label: 'M-16', gridSize: 16, pallets: 90, forklifts: 4 },
  large: { label: 'L-24', gridSize: 24, pallets: 200, forklifts: 6 },
};

const ALL_ALGORITHMS = ['Naive', 'Cooperative', 'Energy Saver', 'CBS'];

const BASE_PLAN: Omit<BenchmarkPlan, 'name'> = {
  algorithms: ALL_ALGORITHMS,
  scales: [SCALES.small],
  droneCounts: [2, 4],
  allocationModes: ['1-to-1'],
  completionModes: ['count'],
  chargingSites: [1],
  repetitions: 5,
  baseSeed: 1,
  missionsPerDrone: 3,
  batteryCapacity: 100,
  batteryEnabled: true,
  roundTrip: true,
  chargeRate: INSTANT_CHARGE_RATE,
  clusterRadius: 5,
  maxClusterSize: 3,
};

export const PRESETS: Record<string, BenchmarkPlan> = {
  /** Smoke test: one small warehouse, a few seconds. */
  quick: { ...BASE_PLAN, name: 'quick' },
  /** Strategy comparison across warehouse scales and swarm sizes. */
  standard: {
    ...BASE_PLAN,
    name: 'standard',
    scales: [SCALES.small, SCALES.medium, SCALES.large],
    droneCounts: [2, 4, 8],
    allocationModes: ['1-to-1', 'Cluster'],
    repetitions: 10,
  },
  /** Standard plus full-coverage missions (every pallet inspected). Slow. */
  full: {
    ...BASE_PLAN,
    name: 'full',
    scales: [SCALES.small, SCALES.medium, SCALES.large],
    droneCounts: [2, 4, 8],
    allocationModes: ['1-to-1', 'Cluster'],
    completionModes: ['count', 'all-pallets'],
    repetitions: 10,
  },
  /**
   * Charging infrastructure: full-coverage missions without returning to the base between tasks,
   * finite charge rate, base only vs. base plus one-drone charging stations.
   */
  charging: {
    ...BASE_PLAN,
    name: 'charging',
    algorithms: ['Cooperative', 'CBS'],
    scales: [SCALES.medium, SCALES.large],
    droneCounts: [2, 4, 8],
    completionModes: ['all-pallets'],
    chargingSites: [1, 2, 3, 5],
    roundTrip: false,
    chargeRate: 2,
    // Small enough that drones must recharge mid-mission (with 100%, 4 drones cover 24³ on one charge)
    batteryCapacity: 30,
    repetitions: 5,
  },
};

/**
 * Expands a plan into concrete scenarios. The seed depends only on the scenario's position in the
 * matrix, so a scenario keeps its seed when other dimensions are added or removed.
 */
export function expandScenarios(plan: BenchmarkPlan): ScenarioSpec[] {
  const scenarios: ScenarioSpec[] = [];
  for (const scale of plan.scales) {
    for (const drones of plan.droneCounts) {
      for (const allocationMode of plan.allocationModes) {
        for (const completionMode of plan.completionModes) {
          for (const chargingSites of plan.chargingSites) {
            for (let repetition = 0; repetition < plan.repetitions; repetition++) {
              // The site count is left out of the seed: station placement is deterministic, so every
              // site count gets the same warehouse and the comparison is paired.
              const seed = scenarioSeed(plan.baseSeed, scale.gridSize, drones, allocationMode, completionMode, repetition);
              scenarios.push({ scale, drones, allocationMode, completionMode, chargingSites, repetition, seed });
            }
          }
        }
      }
    }
  }
  return scenarios;
}

/** Stable 32-bit FNV-1a hash of the scenario coordinates. */
function scenarioSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
