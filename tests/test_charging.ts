import { Drone } from '../classes/Drone';
import { MissionController } from '../classes/MissionController';
import { World } from '../classes/World';
import { CostModel } from '../classes/CostModel';
import { SimulationManager } from '../classes/SimulationManager';
import { withSeed } from '../utils/Random';
import { Position3D, Task } from '../types';

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

const samePos = (a: Position3D, b: Position3D) => a.x === b.x && a.y === b.y && a.z === b.z;

export async function runChargingTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n========================================');
  console.log('🧪 RUNNING CHARGING TEST SUITE');
  console.log('========================================');

  // ─────────────────────────────────────────────────────────────
  // 1. Battery model: charge rate
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 1. Charge Rate ---');

  const dock = { x: 0, y: 0, z: 0 };
  const flyAndWait = (drone: Drone, waits: number) => {
    // 10 moves away and back (0.1 each = 2.0 used), then `waits` ticks on the dock
    const out = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 0, z: 0 }));
    drone.path = [dock, ...out, ...[...out].reverse().slice(1), dock, ...Array.from({ length: waits }, () => dock)];
    drone.mission.warehouseLocation = dock;
  };

  const slow = new Drone('C1', 'Slow', '#fff', 10);
  slow.chargeRatePercent = 5; // 0.5 units per tick
  flyAndWait(slow, 5);
  const arrival = 20;
  const atArrival = slow.calculateStateAt(arrival, [], true).battery;
  assert(Math.abs(atArrival - 8) < 1e-9, 'Flying costs battery', `got ${atArrival}`);
  assert(Math.abs(slow.calculateStateAt(arrival + 2, [], true).battery - 9) < 1e-9, 'Each waiting tick on the dock adds the charge rate');
  assert(Math.abs(slow.calculateStateAt(arrival + 4, [], true).battery - 10) < 1e-9, 'Charging stops at full capacity');
  assert(slow.ticksToFullCharge(atArrival) === 4, 'ticksToFullCharge matches the rate', `got ${slow.ticksToFullCharge(atArrival)}`);
  assert(slow.calculateStateAt(arrival + 1, [], true).isRecharging && !slow.calculateStateAt(arrival + 5, [], true).isRecharging,
    'A drone is shown charging only while its battery is filling up');

  const instant = new Drone('C2', 'Instant', '#fff', 10);
  flyAndWait(instant, 1);
  assert(instant.calculateStateAt(arrival + 1, [], true).battery === 10, 'Instant charging restores a full battery in one tick');
  assert(instant.ticksToFullCharge(3) === 1 && instant.ticksToFullCharge(10) === 0, 'Instant charging needs one tick (none when full)');

  const station = { x: 5, y: 0, z: 0 };
  const visitor = new Drone('C3', 'Visitor', '#fff', 10);
  visitor.chargeRatePercent = 10;
  visitor.path = [dock, ...[1, 2, 3, 4, 5].map(x => ({ x, y: 0, z: 0 })), station, station];
  visitor.mission.warehouseLocation = dock;
  assert(Math.abs(visitor.calculateStateAt(7, [station], true).battery - 10) < 1e-9, 'Waiting on a charging station recharges too');

  // ─────────────────────────────────────────────────────────────
  // 2. Recharge job
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Recharge Job ---');

  const job = new MissionController(dock);
  job.configure(5, false);
  job.assignRecharge(station);
  assert(job.state === 'RECHARGING' && !!job.getNextTarget() && samePos(job.getNextTarget()!, station), 'Recharge job targets the station');
  assert(!job.continuesAfterCurrentLeg(), 'The station is a goal the drone stays on (while charging)');
  const free = job.completeLeg();
  assert(free && job.state === 'IDLE' && job.missionsCompleted === 0, 'After arriving the drone is free again; a recharge is not a mission');
  job.assignRecharge(station);
  job.cancelRecharge();
  assert(job.state === 'RETURNING' && samePos(job.getNextTarget()!, dock), 'An unreachable station falls back to charging on the dock');

  // ─────────────────────────────────────────────────────────────
  // 3. Station placement
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Station Placement ---');

  const baseZone = { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 };
  const world = new World(16);
  world.forklifts = [{ id: 'F', path: Array.from({ length: 16 }, (_, z) => ({ x: 8, y: 0, z })) } as any];
  world.generateStations(3, baseZone);
  const placed = [...world.chargeStations];
  world.generateStations(3, baseZone);
  assert(placed.length === 3, 'Places the requested number of stations');
  assert(JSON.stringify(placed) === JSON.stringify(world.chargeStations), 'Placement is deterministic');
  assert(placed.every(s => s.y === 0 && !world.isBlocked(s.x, 0, s.z)), 'Stations sit on free floor cells');
  assert(placed.every(s => s.x > baseZone.maxX || s.z > baseZone.maxZ), 'Stations stay outside the base zone');
  assert(placed.every(s => s.x !== 8), 'Stations avoid forklift lanes');
  const spread = Math.min(...placed.flatMap((a, i) => placed.slice(i + 1).map(b => Math.abs(a.x - b.x) + Math.abs(a.z - b.z))));
  assert(spread >= 8, 'Stations are spread over the map', `closest pair ${spread} cells apart`);

  // ─────────────────────────────────────────────────────────────
  // 4. Energy feasibility counts on the nearest charger
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. Feasibility With Stations ---');

  const farTask: Task = { id: 'far', target: { x: 20, y: 2, z: 20 }, req_payload: 'camera', pi_k: 0.5, t_hover: 5, status: 'PENDING' };
  const nearby = { x: 20, y: 0, z: 21 };
  const field = new Drone('C4', 'Field', '#fff', 100);
  field.path = [{ x: 18, y: 2, z: 20 }];
  const toBase = CostModel.calculate_e_req(field, farTask, dock);
  const toStation = CostModel.calculate_e_req(field, farTask, dock, [nearby]);
  assert(toStation < toBase, 'A nearby station lowers the energy a task requires', `${toStation.toFixed(2)} vs ${toBase.toFixed(2)}`);
  field.battery = (toStation + toBase) / 2 + 20; // between the two requirements, plus δ_safe
  assert(CostModel.is_feasible(field, farTask, toStation) && !CostModel.is_feasible(field, farTask, toBase),
    'A task out of reach of the base becomes feasible with a station nearby');

  // ─────────────────────────────────────────────────────────────
  // 5. End to end: one-drone stations, no queueing, no collisions
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 5. Full Mission With Stations ---');

  const runMission = (sites: number) => withSeed(11, async () => {
    const manager = new SimulationManager(24, 2);
    manager.generateWorld('Warehouse', 24, sites - 1, true, 2, 200, 3, 'mixed');
    manager.initializeAgents(2, 30, true, 24);
    const original = { log: console.log, warn: console.warn };
    console.log = console.warn = () => {};
    try {
      const result = await manager.runPathfinding('Cooperative', false, 1, 24, true, '1-to-1', 5, 3, 'all-pallets', 2);
      return { result, manager };
    } finally {
      Object.assign(console, original);
    }
  });

  const { result, manager } = await runMission(3);
  const stations = manager.world.chargeStations;
  const onStation = (p: Position3D) => stations.some(s => samePos(s, p));
  const stationTicks = result.agents.flatMap(a => a.path.map((p, t) => ({ id: a.id, t, p })).filter(e => onStation(e.p)));
  const scanned = new Set(result.agents.flatMap(a => (a.scanLog ?? []).map(e => e.palletId)));
  assert(stationTicks.length > 0, 'Drones low on battery recharge at stations', `${stationTicks.length} station ticks`);
  const shared = stationTicks.filter(e => stationTicks.some(o => o.id !== e.id && o.t === e.t && samePos(o.p, e.p)));
  assert(shared.length === 0, 'A station holds one drone at a time');
  assert(result.incidents.length === 0, 'No collisions and no battery deaths', result.incidents.map(i => i.type).join(', '));
  assert(scanned.size === manager.world.pallets.length, 'Every pallet is scanned', `${scanned.size}/${manager.world.pallets.length}`);
  assert(result.agents.every(a => samePos(a.path[a.path.length - 1], (a as Drone).mission.warehouseLocation)), 'Every drone lands on its dock at the end');

  const baseOnly = await runMission(1);
  assert(baseOnly.manager.world.chargeStations.length === 0 && baseOnly.result.incidents.length === 0, 'Base only: no stations, and the mission still completes safely');
  assert(result.maxTicks < baseOnly.result.maxTicks, 'Stations shorten the mission when drones must recharge', `${result.maxTicks} vs ${baseOnly.result.maxTicks} ticks`);

  return { passed, failed };
}
