# Simulation Environment

## 1. Spatial Model

The world is a finite cubic grid

\[
\mathcal{V} = \{0,\dots,S-1\}^3.
\]

Each voxel is either free or blocked. Occupancy is stored in a flattened `Uint8Array`, which makes obstacle lookup constant-time in the implemented model.

The planner treats any out-of-bounds location as blocked, so the boundary is closed.

## 2. Motion Model

The action set is the six-axis Von Neumann neighborhood plus a wait action:

\[
\mathcal{U} = \{
(\pm1,0,0),
(0,\pm1,0),
(0,0,\pm1),
(0,0,0)
\}.
\]

Thus the successor set of voxel \(v\) is

\[
\mathcal{N}(v)=\{v+u \mid u \in \mathcal{U}\},
\]

subject to obstacle and altitude constraints.

Movement is synchronous and discrete. One action consumes one time step.

## 3. Procedural Environments

World generation is implemented in [`classes/WorldGenerator.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/WorldGenerator.ts).

### 3.1 Warehouse

The warehouse generator creates:

- aisle regions,
- rack regions,
- pallets embedded in blocked rack voxels,
- optional forklifts with periodic trajectories.

Pallets are both logical targets and blocked cells. Because of that, the planner cannot route into a pallet voxel directly; it later resolves the target to a nearby free voxel with bounded BFS.

### 3.2 City

The city generator creates a structured obstacle field with roads, block interiors, and varying building heights derived from geometric rules and pseudo-random local variation.

### 3.3 Tunnel

The tunnel generator creates a highly constrained obstacle field with preserved cross-like corridors and additional random occupancy, producing narrow passages that stress prioritized planning.

### 3.4 Open and Random

The open generator creates sparse pillars. The random generator creates voxel occupancy with a uniform Bernoulli rule.

## 4. Warehouse Base and Stations

If the simulation is configured to deploy from base (`deployFromBase = true`), `World.setupWarehouse(...)` clears a protected spawn and airspace region near the origin. Optional charging stations can also be generated.

In `CollisionAnalyzer.detect(...)`, base exclusion is strictly scoped to resting floor level (\(y = \text{warehouse.position.y}\)), ensuring resting drones on charge pads are not falsely flagged as colliding with each other while all mid-air flight collisions over the base structure are detected.

## 5. Dynamic Obstacles (Forklifts)

Forklifts patrol along warehouse aisles with periodic trajectories. Each forklift occupies:

- a ground-level body at \(y = 0\),
- an overhead safety cage at \(y = 1\).

In [`classes/SimulationManager.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/SimulationManager.ts), forklifts are pre-allocated across the entire planning horizon with both:

- **Vertex reservations** at \(y = 0\) and \(y = 1\),
- **Directed edge reservations** \((u \to v)\) at \(y = 0\) and \(y = 1\), preventing head-on swapping through oncoming vehicles.

Furthermore:
- `nearestFreeNeighbor(...)` excludes forklift patrol corridors at \(y \le 1\), requiring drones to inspect low rack shelves from a safe hover altitude (\(y \ge 2\)).
- Drones completing their flight paths inside a forklift aisle automatically ascend to \(y = 2\) so they cannot be run over while idle.

## 6. Modeling Assumptions

The environment model makes the following assumptions.

- perfect global state knowledge,
- exact localization,
- synchronous transitions,
- no aerodynamic interaction,
- no continuous-time control dynamics,
- no perception uncertainty,
- no geometric body volume beyond the voxel occupancy abstraction.
