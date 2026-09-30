import { CostModel } from '../classes/CostModel';
import { TaskCluster } from '../classes/TaskCluster';
import { Drone } from '../classes/Drone';
import { Agent, Task, Position3D, Pallet } from '../types';
import { MATH_CONSTANTS } from '../SimulationConfig';

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

export function runAllocationTests(): { passed: number; failed: number } {
  console.log('\n========================================');
  console.log('🧪 RUNNING TASK ALLOCATION TEST SUITE');
  console.log('========================================');

  const pBase: Position3D = { x: 0, y: 0, z: 0 };
  const dMax = 50;

  // ─────────────────────────────────────────────────────────────
  // 1. Math Formula Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 1. Mathematical Formulas (CostModel) ---');

  const dummyDrone: Agent = {
    id: 'D0',
    name: 'Test Drone',
    color: '#3b82f6',
    start: { x: 0, y: 0, z: 0 },
    goal: { x: 0, y: 0, z: 0 },
    path: [],
    status: 'IDLE',
    battery: 100,
    maxBattery: 100,
    payload: ['camera', 'rfid']
  };

  const dummyTask: Task = {
    id: 'T0',
    target: { x: 10, y: 0, z: 0 },
    req_payload: 'camera',
    pi_k: 0.8,
    t_hover: 5,
    status: 'PENDING'
  };

  // Eq 13: e_req = beta_fly * gamma * (dist_to_task + dist_to_base) + beta_hover * t_hover
  // dist_to_task = 10, dist_to_base = 10, total dist = 20
  // e_req = 0.10 * 1.3 * 20 + 0.05 * 5 = 2.6 + 0.25 = 2.85
  const expectedEreq = MATH_CONSTANTS.BETA_FLY * MATH_CONSTANTS.GAMMA * 20 + MATH_CONSTANTS.BETA_HOVER * 5;
  const calculatedEreq = CostModel.calculate_e_req(dummyDrone, dummyTask, pBase);
  assert(Math.abs(calculatedEreq - expectedEreq) < 1e-4, 'Eq 13 Required Energy Calculation', `Expected ${expectedEreq}, got ${calculatedEreq}`);

  // Eq 14: Feasibility Set (Battery & Payload)
  assert(CostModel.is_feasible(dummyDrone, dummyTask, calculatedEreq), 'Eq 14 Drone with 100% battery and matching payload is feasible');

  const lowBatteryDrone: Agent = { ...dummyDrone, battery: 22 }; // 22 < 2.85 + 20 (delta_safe = 20)
  assert(!CostModel.is_feasible(lowBatteryDrone, dummyTask, calculatedEreq), 'Eq 14 Drone with battery below e_req + DELTA_SAFE is infeasible');

  const wrongPayloadDrone: Agent = { ...dummyDrone, payload: ['thermal'] };
  assert(!CostModel.is_feasible(wrongPayloadDrone, dummyTask, calculatedEreq), 'Eq 14 Drone without required payload is infeasible');

  // Eq 15: Priority Weighting in Hungarian Cost Minimization
  // Hungarian minimizes cost, so higher priority (pi_k = 1.0) must produce lower cost than low priority (pi_k = 0.1)
  const cDist = CostModel.calculate_c_dist(dummyDrone, dummyTask, dMax);
  const cBatt = CostModel.calculate_c_batt(dummyDrone);
  const costHighPriority = CostModel.calculate_C_ik(cDist, cBatt, 1.0);
  const costLowPriority = CostModel.calculate_C_ik(cDist, cBatt, 0.2);
  assert(costHighPriority < costLowPriority, 'Eq 15 Higher priority task produces lower assignment cost');

  // Eq 17-18: Exponential Battery Barrier
  const droneFullBatt: Agent = { ...dummyDrone, battery: 100 };
  const droneCriticalBatt: Agent = { ...dummyDrone, battery: 20.5 };
  const cBattFull = CostModel.calculate_c_batt(droneFullBatt);
  const cBattCritical = CostModel.calculate_c_batt(droneCriticalBatt);
  assert(cBattFull < 0.01, 'Eq 17/18 Battery penalty is negligible for full battery (~0)');
  assert(cBattCritical > cBattFull * 50, 'Eq 17/18 Battery barrier penalty steeply penalizes near-critical battery');

  // ─────────────────────────────────────────────────────────────
  // 2. 1-to-1 Hungarian Task Allocation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. 1-to-1 Hungarian Optimization (Munkres) ---');

  const droneA = new Drone('D1', 'Drone Alpha', '#3b82f6');
  droneA.start = { x: 2, y: 0, z: 2 };
  droneA.battery = 90;
  droneA.payload = ['camera'];

  const droneB = new Drone('D2', 'Drone Beta', '#10b981');
  droneB.start = { x: 18, y: 0, z: 18 };
  droneB.battery = 90;
  droneB.payload = ['camera'];

  // Task near Alpha (target: 3, 0, 2)
  const taskNearA: Task = {
    id: 'T_near_A',
    target: { x: 3, y: 0, z: 2 },
    req_payload: 'camera',
    pi_k: 0.5,
    t_hover: 5,
    status: 'PENDING'
  };

  // Task near Beta (target: 17, 0, 18)
  const taskNearB: Task = {
    id: 'T_near_B',
    target: { x: 17, y: 0, z: 18 },
    req_payload: 'camera',
    pi_k: 0.5,
    t_hover: 5,
    status: 'PENDING'
  };

  const assignments = CostModel.executeOptimalAllocation([droneA, droneB], [taskNearA, taskNearB], pBase, dMax);
  assert(assignments.length === 2, 'Hungarian matches 2 drones to 2 tasks');

  const assignedToA = assignments.find(a => a.drone.id === 'D1')?.task.id;
  const assignedToB = assignments.find(a => a.drone.id === 'D2')?.task.id;
  assert(assignedToA === 'T_near_A', 'Drone Alpha assigned to proximate task A', `Got ${assignedToA}`);
  assert(assignedToB === 'T_near_B', 'Drone Beta assigned to proximate task B', `Got ${assignedToB}`);

  // Test Payload Exclusion
  const rfidTask: Task = {
    id: 'T_rfid',
    target: { x: 2, y: 0, z: 3 },
    req_payload: 'rfid',
    pi_k: 1.0,
    t_hover: 5,
    status: 'PENDING'
  };
  const rfidAssignments = CostModel.executeOptimalAllocation([droneA], [rfidTask], pBase, dMax);
  assert(rfidAssignments.length === 0, 'Camera-only drone rejected from RFID task (Feasibility Screening)');

  // ─────────────────────────────────────────────────────────────
  // 3. Clustered Task Allocation & mTSP Tour
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Clustered Allocation & mTSP Tour ---');

  const clusterTasks: Task[] = [
    { id: 'T_C1', target: { x: 5, y: 1, z: 5 }, req_payload: 'camera', pi_k: 0.8, t_hover: 5, status: 'PENDING' },
    { id: 'T_C2', target: { x: 6, y: 1, z: 5 }, req_payload: 'camera', pi_k: 0.6, t_hover: 5, status: 'PENDING' },
    { id: 'T_C3', target: { x: 7, y: 1, z: 6 }, req_payload: 'camera', pi_k: 0.9, t_hover: 5, status: 'PENDING' }
  ];

  const cluster = new TaskCluster(clusterTasks);
  assert(cluster.tourSequence.length === 3, 'TaskCluster visits all 3 tasks in sequence');
  assert(cluster.tourCost > 0, 'TaskCluster tourCost is positive');

  // Verify tour cost includes gamma path complexity factor
  let actualTourDist = 0;
  for (let i = 0; i < cluster.tourSequence.length - 1; i++) {
    const cur = cluster.tourSequence[i].target;
    const nxt = cluster.tourSequence[i + 1].target;
    actualTourDist += Math.abs(cur.x - nxt.x) + Math.abs(cur.y - nxt.y) + Math.abs(cur.z - nxt.z);
  }
  const expectedTourCost = (actualTourDist * MATH_CONSTANTS.BETA_FLY * MATH_CONSTANTS.GAMMA) + (cluster.tourSequence.length * 5 * MATH_CONSTANTS.BETA_HOVER);
  assert(Math.abs(cluster.tourCost - expectedTourCost) < 1e-4, 'TaskCluster tourCost incorporates gamma scaling', `Expected ${expectedTourCost.toFixed(4)}, got ${cluster.tourCost.toFixed(4)}`);

  // Cluster Assignment
  const clusterAssignments = CostModel.executeClusterAllocation([droneA], [cluster], pBase, dMax);
  assert(clusterAssignments.length === 1, 'Drone successfully allocated to feasible cluster');
  assert(clusterAssignments[0].cluster.id === cluster.id, 'Allocated cluster ID matches');

  return { passed, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runAllocationTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
