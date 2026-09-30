import { createSeededRandom, random, withSeed } from '../utils/Random';
import { summarize } from '../bench/stats';
import { expandScenarios, PRESETS } from '../bench/scenarios';
import { runScenario } from '../bench/runScenario';
import { MissionController } from '../classes/MissionController';
import { TaskCluster } from '../classes/TaskCluster';
import { Task } from '../types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

const task = (id: string, x: number): Task => ({
  id, target: { x, y: 2, z: 2 }, req_payload: 'camera', palletId: `P-${id}`, pi_k: 0.5, t_hover: 5, status: 'PENDING',
});

export async function runBenchmarkTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n========================================');
  console.log('🧪 RUNNING BENCHMARK & REPRODUCIBILITY TEST SUITE');
  console.log('========================================');

  // ─────────────────────────────────────────────────────────────
  // 1. Seeded randomness
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 1. Seeded Random Source ---');

  const a = createSeededRandom(42);
  const b = createSeededRandom(42);
  const seqA = Array.from({ length: 5 }, a);
  const seqB = Array.from({ length: 5 }, b);
  assert(seqA.every((v, i) => v === seqB[i]), 'Same seed yields the same sequence');
  assert(seqA.every(v => v >= 0 && v < 1), 'Values lie in [0, 1)');

  const inside = await withSeed(7, () => [random(), random()]);
  const again = await withSeed(7, () => [random(), random()]);
  assert(inside[0] === again[0] && inside[1] === again[1], 'withSeed makes the simulation source reproducible');

  // ─────────────────────────────────────────────────────────────
  // 2. Statistics
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Summary Statistics ---');

  const s = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
  assert(s.mean === 5 && s.median === 4.5 && s.min === 2 && s.max === 9, 'Mean, median, min and max');
  assert(Math.abs(s.std - 2.138) < 1e-3, 'Sample standard deviation (n - 1)', `got ${s.std}`);
  assert(Math.abs(s.ci95 - 1.96 * s.std / Math.sqrt(8)) < 1e-12, '95% confidence half-width');

  // ─────────────────────────────────────────────────────────────
  // 3. Mission continuation (drives CBS goal-hold horizon)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Mission Continuation ---');

  const roundTrip = new MissionController({ x: 0, y: 0, z: 0 });
  roundTrip.configure(3, true);
  roundTrip.assignNewMission({ x: 5, y: 2, z: 2 });
  assert(roundTrip.continuesAfterCurrentLeg(), 'Round trip: drone leaves the pallet right after scanning');

  const oneWay = new MissionController({ x: 0, y: 0, z: 0 });
  oneWay.configure(3, false);
  oneWay.assignNewMission({ x: 5, y: 2, z: 2 });
  assert(!oneWay.continuesAfterCurrentLeg(), 'One way: drone may park at the pallet');

  const tour = new MissionController({ x: 0, y: 0, z: 0 });
  tour.configure(1, false);
  tour.assignClusterMission(new TaskCluster([task('a', 3), task('b', 5), task('c', 7)]));
  const stops: boolean[] = [];
  while (tour.getNextTarget()) {
    stops.push(tour.continuesAfterCurrentLeg());
    tour.completeLeg();
  }
  assert(stops.length === 3 && stops[0] && stops[1] && !stops[2], 'Cluster tour: only the last stop may be a parking goal', JSON.stringify(stops));

  // ─────────────────────────────────────────────────────────────
  // 4. End-to-end benchmark reproducibility
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. Benchmark Runner ---');

  const plan = { ...PRESETS.quick, droneCounts: [3], repetitions: 1, algorithms: ['Cooperative', 'CBS'] };
  const [scenario] = expandScenarios(plan);
  const first = await runScenario(scenario, plan);
  const second = await runScenario(scenario, plan);
  const strip = (records: typeof first) => JSON.stringify(records.map(({ planningMs, ...rest }) => rest));
  assert(first.every(r => r.ok), 'Every strategy completes the scenario', first.map(r => r.error).join('; '));
  assert(strip(first) === strip(second), 'Same scenario seed reproduces identical mission metrics');
  assert(first[1].cbsFallbacks !== undefined && first[0].cbsFallbacks === undefined, 'CBS-only counters are reported for CBS only');

  return { passed, failed };
}
