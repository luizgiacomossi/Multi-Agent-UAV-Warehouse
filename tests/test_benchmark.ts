import { createSeededRandom, random, withSeed } from '../utils/Random';
import { summarize } from '../bench/stats';
import { expandScenarios, PRESETS } from '../bench/scenarios';
import { runScenario } from '../bench/runScenario';
import { MissionController } from '../classes/MissionController';
import { TaskCluster } from '../classes/TaskCluster';
import { Task } from '../types';
import { Drone } from '../classes/Drone';
import { describeDroneActivity } from '../classes/DroneActivity';

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
  assert(oneWay.continuesAfterCurrentLeg(), 'One way: drone still leaves the pallet (next task or home)');
  oneWay.completeLeg(); oneWay.completeLeg(); // 1st scan -> IDLE, re-dispatch below
  oneWay.missionsCompleted = oneWay.maxMissions - 1;
  oneWay.assignNewMission({ x: 6, y: 2, z: 2 });
  oneWay.completeLeg();
  assert(oneWay.state === 'RETURNING', 'One way: drone flies home after its last mission instead of hovering');
  oneWay.completeLeg();
  assert(oneWay.state === 'COMPLETED', 'One way: mission completes on arrival at the dock');

  const tour = new MissionController({ x: 0, y: 0, z: 0 });
  tour.configure(1, false);
  tour.assignClusterMission(new TaskCluster([task('a', 3), task('b', 5), task('c', 7)]));
  const stops: boolean[] = [];
  while (tour.getNextTarget()) {
    stops.push(tour.continuesAfterCurrentLeg());
    tour.completeLeg();
  }
  assert(stops.length === 4 && stops.slice(0, 3).every(Boolean) && !stops[3],
    'Cluster tour: every pallet stop is transit; only the final flight home ends at a parking goal', JSON.stringify(stops));

  // ─────────────────────────────────────────────────────────────
  // 4. Per-tick drone activity (scan manifest labels)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. Drone Activity Labels ---');

  // Dock (0,2,0) -> pallet stop (3,2,0) at t=3 -> hover -> home at t=7 -> charge tick
  const dock = { x: 0, y: 2, z: 0 };
  const drone = new Drone('ACT', 'Activity', '#fff', 100);
  drone.path = [0, 1, 2, 3, 3, 2, 1, 0, 0].map(x => ({ x, y: 2, z: 0 }));
  drone.assignedTasksLog = [{ startTick: 0, endTick: 3, palletId: 'PLT-ABC123', position: { x: 3, y: 2, z: 0 }, type: 'rfid', priority: 0.5 }];
  drone.scanLog = [{ tick: 3, palletId: 'PLT-ABC123' }];
  const at = (tick: number, recharging = false) =>
    describeDroneActivity(drone, tick, dock, { isDeadBattery: false, isRecharging: recharging });

  assert(at(1).kind === 'enRoute' && at(1).palletId === 'PLT-ABC123' && at(1).scanNumber === 1, 'Mid-flight to a pallet shows en route, not idle');
  assert(at(3).kind === 'scanning' && at(3).scanType === 'rfid', 'Arrival tick shows scanning');
  assert(at(5).kind === 'returning', 'Flying home after the task shows returning');
  assert(at(4).kind === 'returning', 'A hover on the way home still counts as returning');
  assert(at(8).kind === 'complete', 'Landed after the last tick shows complete');
  assert(at(7, true).kind === 'charging', 'Waiting on the dock while recharging shows charging');

  drone.destructionTime = 2;
  assert(at(2).kind === 'crashed' && at(1).kind === 'enRoute', 'Crash is shown only from the collision tick');
  drone.destructionTime = undefined;

  // ─────────────────────────────────────────────────────────────
  // 5. End-to-end benchmark reproducibility
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 5. Benchmark Runner ---');

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
