# Auxiliary Algorithms and Analytical Models

While Pathfinding (A*) and Task Allocation (Hungarian Munkres) form the core of VoxelSwarm, several auxiliary algorithms enforce the robustness required for PhD-level research validation.

## 1. Bounded Breadth-First-Search (Target Resolution)

**Problem**: Simulated environments organically generate blocked structures (e.g., Warehouses spawn Racks populated with Pallets). If a Pallet target resides strictly *inside* a solid obstacle voxel (representing physical containment), standard A* heuristics immediately flag the target as unreachable, expanding infinitely until memory exhaustion.

**Solution**: The `nearestFreeNeighbor` algorithm dynamically maps unreachable goals using a bounded BFS outward expansion.
$$ O(b^d) $$
Where $b = 6$ (Von Neumann neighborhood branch factor), constrained to a maximum memory footprint of 200 spatial iterations.
The BFS maps the contiguous blocked spaces and returns the closest adjacent valid space grid index $x,y,z$, allowing the Drone to pathfind correctly "in front" of the target pallet for payload interaction.

## 2. Monte Carlo Stochastic Simulations

To quantitatively validate Task Allocation efficiencies over random greedy models, the `runMonteCarloAllocations` pipeline iterates statistical significance tests ($n=50$ minimum sweeps).

**Algorithmic Sequence (Triggered via GUI "Run Exp 2")**:
1. Spawns 50 randomized iterations assigning synthetic Drones mapping variable payloads and $50-100\%$ initial batteries against 50 targeted warehouse tasks.
2. Injects varying $\beta$-degradations assigning disparate generic $Battery$ initial states.
3. Evaluates Hungarian matrix resolution against non-optimal sets, logging systemic Standard Deviations of aggregate fleet battery percentages and global operational makespan times.
4. Identifies constraint-stranding factors (Agents completely trapped by $\Omega$ infeasibility penalty curves).
5. Outputs high-fidelity logging metrics identically formatted for graph extraction straight to the browser DevTools console.

## 3. Event-Triggered Fault Tolerance 

Experimentally measuring autonomous recovery latencies $t_{recovery}$ via the Control Panel ("Run Exp 3" button):
1. A static map is instantiated with $N$ drones correctly solving the Bipartite Matching algorithm.
2. The Execution loop operates until evaluating an instantaneous anomaly at $T=60s$, injecting a critical battery collapse on a specific drone (**Drone 2**):
$$ B_{agent\_2} = 10 \implies B \ll \delta_{safe} $$
3. The centralized loop automatically orphans the associated node-task.
4. Latency performance measurement benchmarks the instantaneous calculation time (in milliseconds) required for the `CostModel` to strip the agent, recalculate the Munkres matrix, and orchestrate the safe reassignment of the remaining fleet. Measurements are output directly to the DevTools console.
