import { World } from '../classes/World';
import { Drone, Swarm } from '../classes/Drone';
import { 
  CooperativePlanner, 
  NaivePlanner, 
  EnergySaverPlanner, 
  SpaceTimeReservations,
  CollisionAnalyzer
} from '../classes/PathPlanner';
import { Forklift, Position3D } from '../types';

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

export function runPathPlanningTests(): { passed: number; failed: number } {
  console.log('\n========================================');
  console.log('🧪 RUNNING PATH PLANNING & COLLISION TEST SUITE');
  console.log('========================================');

  // ─────────────────────────────────────────────────────────────
  // 1. SpaceTimeReservations Logic & Safe Hashing
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 1. Space-Time Reservation System ---');

  const reservations = new SpaceTimeReservations();
  const posA: Position3D = { x: 5, y: 1, z: 5 };
  const posB: Position3D = { x: 5, y: 1, z: 6 };

  // Add vertex reservation at t=10
  const hA = (posA.x) + (posA.y * 64) + (posA.z * 4096) + (10 * 262144);
  reservations.addVertex(hA, 'DRONE_1');
  assert(reservations.has(hA), 'Vertex reservation registered');
  assert(reservations.isVertexReserved(hA, 'DRONE_2'), 'Vertex conflict detected for another agent');
  assert(!reservations.isVertexReserved(hA, 'DRONE_1'), 'Self-vertex query does not conflict with self');

  // Directed edge reservation (posA -> posB from t=10 to t=11)
  reservations.addEdge(posA, posB, 10, 'DRONE_1');
  // Check head-on swap: DRONE_2 attempting posB -> posA at t=10
  assert(reservations.isEdgeConflict(posB, posA, 10, 'DRONE_2'), 'Head-on swap edge conflict detected for opposite move');
  assert(!reservations.isEdgeConflict(posA, posB, 10, 'DRONE_2'), 'Parallel move in same direction is not an edge swap');

  // Selective owner clearing
  reservations.clearOwnerFromTime('DRONE_1', 0);
  assert(!reservations.has(hA), 'Vertex reservation cleared for owner');

  // ─────────────────────────────────────────────────────────────
  // 2. Multi-Agent Head-On Conflict Resolution (Cooperative MAPF)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Cooperative MAPF (CBS) Multi-Agent Avoidance ---');

  const world = new World(12);
  const swarm = new Swarm(0);
  swarm.drones = [];

  // Two drones on direct collision course in a narrow 1D corridor
  // Drone 1: (2, 2, 5) -> Goal: (8, 2, 5)
  // Drone 2: (8, 2, 5) -> Goal: (2, 2, 5)
  const drone1 = new Drone('D1', 'Agent 1', '#3b82f6');
  drone1.start = { x: 2, y: 2, z: 5 };
  drone1.goal = { x: 8, y: 2, z: 5 };
  drone1.path = [{ ...drone1.start }];
  drone1.mission.assignNewMission(drone1.goal);

  const drone2 = new Drone('D2', 'Agent 2', '#10b981');
  drone2.start = { x: 8, y: 2, z: 5 };
  drone2.goal = { x: 2, y: 2, z: 5 };
  drone2.path = [{ ...drone2.start }];
  drone2.mission.assignNewMission(drone2.goal);

  swarm.drones.push(drone1, drone2);

  const cbsPlanner = new CooperativePlanner();
  const cbsReservations = new SpaceTimeReservations();

  cbsPlanner.planLeg(swarm, world, 0, cbsReservations, 6, false);

  assert(drone1.path.length > 1, 'Drone 1 planned a non-empty trajectory');
  assert(drone2.path.length > 1, 'Drone 2 planned a non-empty trajectory');

  const endPos1 = drone1.path[drone1.path.length - 1];
  const endPos2 = drone2.path[drone2.path.length - 1];
  assert(endPos1.x === 8 && endPos1.y === 2 && endPos1.z === 5, 'Drone 1 reached target goal');
  assert(endPos2.x === 2 && endPos2.y === 2 && endPos2.z === 5, 'Drone 2 reached target goal');

  // Verify Zero Collisions between the two crossing drones
  const collisions = CollisionAnalyzer.detect(swarm, [], undefined);
  assert(collisions.length === 0, 'Zero collisions or edge swaps between crossing drones', `Detected ${collisions.length} collisions`);

  // ─────────────────────────────────────────────────────────────
  // 3. Dynamic Forklift Kinematic Obstacle Avoidance
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Dynamic Forklift Collision Prevention ---');

  // Create a cyclic forklift patrol along X=4, Z=2..6, Y=0
  const forkliftPath: Position3D[] = [];
  for (let z = 2; z <= 6; z++) forkliftPath.push({ x: 4, y: 0, z });
  for (let z = 5; z >= 3; z--) forkliftPath.push({ x: 4, y: 0, z });

  const forklift: Forklift = {
    id: 'FL_1',
    name: 'Forklift 1',
    path: forkliftPath,
    color: '#eab308'
  };

  // Pre-allocate forklift in space-time across horizon
  const forkliftReservations = new SpaceTimeReservations();
  for (let t = 0; t < 100; t++) {
    const pos = forkliftPath[t % forkliftPath.length];
    const h1 = (pos.x) + (pos.y * 64) + (pos.z * 4096) + (t * 262144);
    const h2 = (pos.x) + ((pos.y + 1) * 64) + (pos.z * 4096) + (t * 262144);
    forkliftReservations.addVertex(h1, 'FORKLIFT');
    forkliftReservations.addVertex(h2, 'FORKLIFT');

    if (t > 0) {
      const prev = forkliftPath[(t - 1) % forkliftPath.length];
      forkliftReservations.addEdge(prev, pos, t - 1, 'FORKLIFT');
      forkliftReservations.addEdge({ x: prev.x, y: prev.y + 1, z: prev.z }, { x: pos.x, y: pos.y + 1, z: pos.z }, t - 1, 'FORKLIFT');
    }
  }

  // Drone path across the forklift patrol corridor:
  // Starts at (1, 0, 4) and wants to cross to (7, 0, 4)
  const crossSwarm = new Swarm(0);
  const crossingDrone = new Drone('D_cross', 'Crosser', '#8b5cf6');
  crossingDrone.start = { x: 1, y: 0, z: 4 };
  crossingDrone.goal = { x: 7, y: 0, z: 4 };
  crossingDrone.path = [{ ...crossingDrone.start }];
  crossingDrone.mission.assignNewMission(crossingDrone.goal);
  crossSwarm.drones = [crossingDrone];

  cbsPlanner.planLeg(crossSwarm, world, 0, forkliftReservations, 6, false);

  const forkliftCollisions = CollisionAnalyzer.detect(crossSwarm, [forklift], undefined);
  assert(forkliftCollisions.length === 0, 'Zero drone-forklift collisions during corridor traversal');

  // ─────────────────────────────────────────────────────────────
  // 4. EnergySaverPlanner Relaxation & Battery Bounding
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. EnergySaverPlanner Minimum Cost Relaxation ---');

  const energyPlanner = new EnergySaverPlanner();
  const energySwarm = new Swarm(0);
  const ecoDrone = new Drone('D_eco', 'Eco Drone', '#06b6d4');
  ecoDrone.start = { x: 1, y: 1, z: 1 };
  ecoDrone.goal = { x: 5, y: 1, z: 1 };
  ecoDrone.path = [{ ...ecoDrone.start }];
  ecoDrone.battery = 100;
  ecoDrone.maxBattery = 100;
  ecoDrone.mission.assignNewMission(ecoDrone.goal);
  energySwarm.drones = [ecoDrone];

  energyPlanner.planLeg(energySwarm, world, 0, new SpaceTimeReservations(), 6, true);
  assert(ecoDrone.path.length > 1, 'EnergySaverPlanner found valid path');
  const finalEcoPos = ecoDrone.path[ecoDrone.path.length - 1];
  assert(finalEcoPos.x === 5 && finalEcoPos.y === 1 && finalEcoPos.z === 1, 'Eco Drone reached target with optimal energy path');

  return { passed, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runPathPlanningTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
