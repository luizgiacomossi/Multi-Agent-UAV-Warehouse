import { Warehouse } from '../classes/Warehouse';
import { SimulationManager } from '../classes/SimulationManager';
import { setRandomSource, createSeededRandom } from '../utils/Random';
import { Position3D } from '../types';

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

// The three benchmark scales: grid size, pallets, requested forklifts, drones
const SCALES = [[12, 50, 3, 4], [16, 90, 4, 4], [24, 200, 6, 8]] as const;

export function runForkliftTests(): { passed: number; failed: number } {
  console.log('\n========================================');
  console.log('🧪 RUNNING FORKLIFT LANE TEST SUITE');
  console.log('========================================');

  for (const [size, pallets, requested, drones] of SCALES) {
    console.log(`\n--- Warehouse ${size}x${size}, ${requested} forklifts requested ---`);
    setRandomSource(createSeededRandom(42));
    const sm = new SimulationManager();
    sm.generateWorld('Warehouse', size, 1, true, drones, pallets, requested, 'mixed');
    const w: any = (sm as any).world;
    const dock = new Warehouse(drones).getBounds();
    const forklifts: { id: string; path: Position3D[] }[] = w.forklifts;

    assert(forklifts.length >= 1 && forklifts.length <= requested, 'At least one forklift is placed, never more than requested',
      `got ${forklifts.length}`);

    for (const f of forklifts) {
      const p = f.path;
      // Walk the loop twice so the wrap-around step from the last cell back to the first is checked too
      let jumps = 0;
      for (let t = 1; t <= 2 * p.length; t++) {
        const a = p[(t - 1) % p.length], b = p[t % p.length];
        if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 1) jumps++;
      }
      assert(jumps === 0, `${f.id} loops without jumping`, `${jumps} jumps`);

      assert(p.every(q => q.x === p[0].x), `${f.id} stays in one aisle`);

      const zs = p.map(q => q.z);
      assert(Math.max(...zs) === size - 1, `${f.id} lane reaches the far end of the aisle`, `max z ${Math.max(...zs)}`);

      const blocked = p.filter(q => w.isBlocked(q.x, 0, q.z) || w.isBlocked(q.x, 1, q.z)).length;
      assert(blocked === 0, `${f.id} never drives through a rack`, `${blocked} blocked cells`);

      const inDock = p.filter(q => q.x >= dock.minX && q.x <= dock.maxX && q.z >= dock.minZ && q.z <= dock.maxZ).length;
      assert(inDock === 0, `${f.id} keeps out of the dock`, `${inDock} cells in the dock`);

      const onLane = w.chargeStations.filter((s: Position3D) => p.some(q => q.x === s.x && q.z === s.z)).length;
      assert(onLane === 0, `${f.id} lane has no charging station on it`, `${onLane} stations`);
    }
  }

  console.log(`\nForklift tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
