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

Each pallet holds one kind of bus spare part (`Pallet.contents`, defined in [`classes/PalletContents.ts`](../classes/PalletContents.ts)):

| Code | Part | Units per pallet |
|---|---|---|
| `BRK` | Brake pads | 40–120 |
| `FLT` | Oil filters | 60–200 |
| `TYR` | Tyres | 4–12 |

The part and quantity come from a hash of the pallet's cell, not from the simulation's random source, so contents do not change any seeded scenario or benchmark result, and the same warehouse always holds the same parts. The planner ignores contents. The UI reveals them at the scan tick: the Completed Scans table shows each scanned pallet's part and quantity, with running totals per part above it.

**Inventory mission (voice).** The operator assistant ([`services/slm/SimulationToolRegistry.ts`](../services/slm/SimulationToolRegistry.ts)) has two inventory tools:

- `start_inventory_mission` ("update the inventory"): switches the mission end condition to *All Pallets* while keeping the current warehouse, plans a mission that scans every pallet, and starts playback. When playback reaches the end of that plan, the assistant shows and speaks the result, e.g. "Inventory complete: all 77 pallets scanned. Found 1,719 brake pads, 3,354 oil filters and 221 tyres." Pallets the fleet could not reach are named in the summary. No announcement is made if another plan replaced the mission.
- `get_inventory` ("how is the inventory?"): the units of each part found on the pallets scanned up to the current tick.

Both also work without LM Studio, through the rule-based fallback (commands containing "inventory"). The summary is built by `buildInventoryReport` and `describeInventory` ([`classes/InventoryReport.ts`](../classes/InventoryReport.ts)).

### 3.2 City

The city generator creates a structured obstacle field with roads, block interiors, and varying building heights derived from geometric rules and pseudo-random local variation.

### 3.3 Tunnel

The tunnel generator creates a highly constrained obstacle field with preserved cross-like corridors and additional random occupancy, producing narrow passages that stress prioritized planning.

### 3.4 Open and Random

The open generator creates sparse pillars. The random generator creates voxel occupancy with a uniform Bernoulli rule.

## 4. Warehouse Base and Stations

If the simulation is configured to deploy from base (`deployFromBase = true`), `World.setupWarehouse(...)` clears a protected spawn and airspace region near the origin. The base has one dock per drone, so it charges every drone at once.

The number of **charging sites** counts the base: 1 means base only, and each extra site is a charging station that holds **one drone at a time** (up to `MAX_CHARGING_SITES` = 5). `World.generateStations(...)` places stations on free floor cells by farthest-point sampling: each station is the cell farthest from the base and from the stations already placed. Cells in the base zone, under forklift lanes, or not reachable from the base are skipped. Placement uses no randomness, so the same seed gives the same warehouse for every station count.

In `CollisionAnalyzer.detect(...)`, base exclusion is strictly scoped to resting floor level (\(y = \text{warehouse.position.y}\)), ensuring resting drones on charge pads are not falsely flagged as colliding with each other while all mid-air flight collisions over the base structure are detected.

## 5. Dynamic Obstacles (Forklifts)

Forklifts patrol along warehouse aisles with periodic trajectories. `WorldGenerator` gives each forklift one aisle along \(z\) and drives it over the whole length of the warehouse, so it passes every rack row; only an aisle beside the dock starts after the dock. The path holds exactly one round trip, and the planner, the collision check and the 3D view all replay it with `t % length`, so it loops without a jump. Each forklift occupies:

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
