import { SimulationManager } from '../classes/SimulationManager';

async function testScenario() {
  const manager = new SimulationManager();
  console.log("Generating scenario: Warehouse, size=16, drones=2, pallets=35, forklifts=3");
  
  // Set random seed if possible or run multiple times
  for (let run = 1; run <= 10; run++) {
    manager.generateWorld('Warehouse', 16, false, true, 2, 35, 3, 'mixed');
    manager.initializeAgents(2, 100, true, 12);
    
    console.log(`\n--- Run ${run} ---`);
    console.log(`Pallets count: ${manager.world.pallets.length}`);
    console.log(`Forklifts count: ${manager.world.forklifts.length}`);
    
    const result = await manager.runPathfinding(
      'Cooperative',
      false, // isRoundTrip = false
      1,     // missionCount
      12,    // maxAltitude = 12
      true,  // batteryEnabled = true
      'Cluster', // allocationMode = Cluster
      5,     // clusterRadius = 5
      3,     // maxClusterSize = 3
      'all-pallets' // missionCompletionMode = all-pallets
    );
    
    const strandedDrones = result.agents.filter(a => a.status === 'STRANDED');
    console.log(`Completed scans: ${result.agents.flatMap(a => a.scanLog || []).length} / ${manager.world.pallets.length}`);
    console.log(`Stranded drones: ${strandedDrones.length}`);
    
    if (strandedDrones.length > 0) {
      for (const d of strandedDrones) {
        console.log(`Drone ${d.name} is STRANDED! Path length: ${d.path.length}, battery: ${d.battery}, destructionTime: ${d.destructionTime}`);
        console.log(`Last pos:`, d.path[d.path.length - 1]);
        console.log(`Mission state:`, d.missionState, `currentGoal:`, d.goal, `currentPallet:`, d.currentPalletId);
      }
      break;
    }
  }
}

testScenario().catch(err => console.error(err));
