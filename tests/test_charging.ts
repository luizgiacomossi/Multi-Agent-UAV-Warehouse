import { Drone } from '../classes/Drone';
import { MissionController } from '../classes/MissionController';
import { World } from '../classes/World';
import { CostModel } from '../classes/CostModel';
import { SimulationManager } from '../classes/SimulationManager';
import { withSeed } from '../utils/Random';
import { buildChargingSchedule, chargeStatusAt } from '../classes/ChargingSchedule';
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

  const runMission = (sites: number, drain = 1) => withSeed(11, async () => {
    const manager = new SimulationManager(24, 2);
    manager.generateWorld('Warehouse', 24, sites - 1, true, 2, 200, 3, 'mixed');
    manager.initializeAgents(2, 30, true, 24);
    const original = { log: console.log, warn: console.warn };
    console.log = console.warn = () => {};
    try {
      const result = await manager.runPathfinding('Cooperative', false, 1, 24, true, '1-to-1', 5, 3, 'all-pallets', 2, drain);
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

  const drained = await runMission(3, 2);
  const drainedScanned = new Set(drained.result.agents.flatMap(a => (a.scanLog ?? []).map(e => e.palletId)));
  assert(drained.result.incidents.length === 0, 'Double battery drain: no collisions and no battery deaths', drained.result.incidents.map(i => i.type).join(', '));
  // With 30 units and the 20-unit safety margin, a few far pallets are out of reach even on a full
  // battery from the best charger: those (and only those) are left, and the drones land instead.
  const pBase = drained.manager.world.warehouse!.position;
  const sites = [{ x: 0, y: 0, z: 0 }, ...drained.manager.world.chargeStations];
  const leftOver = drained.manager.world.pallets.filter(p => !drainedScanned.has(p.id));
  const outOfReach = leftOver.every(p => sites.every(site => !CostModel.isAffordable(30, CostModel.requiredEnergyFrom(
    site, { id: p.id, target: p.position, req_payload: p.payload_type, pi_k: 0.5, t_hover: 5, status: 'PENDING' }, pBase, drained.manager.world.chargeStations, 2))));
  assert(outOfReach, 'Double battery drain: every pallet left unscanned is out of reach from every charger', `${leftOver.length} left`);
  assert(drained.result.agents.every(a => samePos(a.path[a.path.length - 1], (a as Drone).mission.warehouseLocation)), 'Double battery drain: every drone lands on its dock');
  const sessionsOf = (r: typeof result) => buildChargingSchedule(r.agents, stations, true).length;
  assert(sessionsOf(drained.result) > sessionsOf(result), 'Double drain means more charging sessions',
    `${sessionsOf(drained.result)} vs ${sessionsOf(result)}`);

  // ─────────────────────────────────────────────────────────────
  // 6. Battery drain multiplier
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 6. Battery Drain ---');

  const heavy = new Drone('C5', 'Heavy', '#fff', 10);
  heavy.drainMultiplier = 2;
  flyAndWait(heavy, 0);
  assert(Math.abs(heavy.calculateStateAt(arrival, [], true).battery - 6) < 1e-9, 'Drain ×2 doubles the battery used per move');
  const hoverer = new Drone('C6', 'Hover', '#fff', 10);
  hoverer.drainMultiplier = 0.5;
  hoverer.path = [{ x: 3, y: 2, z: 3 }, { x: 3, y: 2, z: 3 }, { x: 3, y: 2, z: 3 }];
  assert(Math.abs(hoverer.calculateStateAt(2, [], true).battery - 9.95) < 1e-9, 'Drain ×0.5 halves the battery used per hover tick');
  const task: Task = { id: 't', target: { x: 6, y: 2, z: 0 }, req_payload: 'camera', pi_k: 0.5, t_hover: 5, status: 'PENDING' };
  const nominalDrone = new Drone('C7', 'Nominal', '#fff', 100);
  const doubleDrone = new Drone('C8', 'Double', '#fff', 100);
  doubleDrone.drainMultiplier = 2;
  assert(Math.abs(CostModel.calculate_e_req(doubleDrone, task, dock) - 2 * CostModel.calculate_e_req(nominalDrone, task, dock)) < 1e-9,
    'The allocation energy estimate scales with the drain');

  // ─────────────────────────────────────────────────────────────
  // 7. Charging schedule
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 7. Charging Schedule ---');

  const [dockSession] = slow.chargingSessions([], true);
  assert(slow.chargingSessions([], true).length === 1 && dockSession.charger === 'base', 'One session on the dock');
  assert(dockSession.startTick === arrival + 1 && dockSession.endTick === arrival + 4, 'The session spans the ticks the battery fills up (not the idle tick after)',
    `${dockSession.startTick}-${dockSession.endTick}`);
  assert(Math.abs(dockSession.batteryFrom - 8) < 1e-9 && Math.abs(dockSession.batteryTo - 10) < 1e-9, 'Battery before and after the session');
  assert(chargeStatusAt(dockSession, arrival) === 'upcoming' && chargeStatusAt(dockSession, arrival + 2) === 'active' && chargeStatusAt(dockSession, arrival + 5) === 'done',
    'Session status follows the playback tick');
  const schedule = buildChargingSchedule([slow, visitor], [{ x: 9, y: 9, z: 9 }, station], true);
  assert(schedule.length === 2 && schedule[0].droneName === 'Visitor' && schedule[0].site === 'Station 2' && schedule[1].site === 'Base',
    'The fleet schedule is in time order and names each site', schedule.map(e => `${e.droneName}@${e.site}`).join(', '));
  const stationSchedule = buildChargingSchedule(result.agents, stations, true).filter(e => e.charger === 'station');
  assert(stationSchedule.length > 0 && stationSchedule.every(e => e.site.startsWith('Station ')), 'Mission schedule lists the station sessions');

  return { passed, failed };
}
