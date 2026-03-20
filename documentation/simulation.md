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

If the simulation is configured to deploy from base, `World.setupWarehouse(...)` clears a protected spawn and airspace region near the origin. Optional charging stations can also be generated.

This means the warehouse base is not just a visual convention; it actively modifies the occupancy map.

## 5. Dynamic Obstacles

Forklifts are represented as periodic paths at ground level, with an additional occupied voxel one unit above the base pose. In `SimulationManager.runPathfinding(...)`, these positions are inserted into the reservation table for the full planning horizon, so the planners treat them as time-indexed obstacles.

## 6. Modeling Assumptions

The environment model makes the following assumptions.

- perfect global state knowledge,
- exact localization,
- synchronous transitions,
- no aerodynamic interaction,
- no continuous-time control dynamics,
- no perception uncertainty,
- no geometric body volume beyond the voxel occupancy abstraction.
