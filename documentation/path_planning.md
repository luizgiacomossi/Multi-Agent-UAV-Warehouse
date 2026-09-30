# Path Planning

## 1. Search Space

The planners operate on a time-expanded voxel graph. A search state is

\[
n = (x,y,z,t),
\]

with accumulated path cost \(g(n)\), heuristic \(h(n)\), and evaluation

\[
f(n)=g(n)+h(n).
\]

The successor relation uses the six cardinal moves plus wait.

## 2. Reservation Encoding

The implemented `SpaceTimeReservations` table stores:

- **Vertex reservations** in a `Map<number, string>`, mapping safe 53-bit spatio-temporal integer keys to their `ownerId`.
- **Directed edge reservations** in a `Map<string, string>`, mapping directed transitions `${time}:${fromKey}->${toKey}` to their `ownerId`.

The spatio-temporal hash function uses safe JavaScript double-precision arithmetic to avoid 32-bit signed integer overflow at large \(t\):

\[
\operatorname{key}(x,y,z,t)
=
x + 64y + 4096z + 262144t.
\]

Given grid dimensions \(x,y,z < 64\), the time coordinate is recovered uniquely by \(\lfloor \operatorname{key} / 262144 \rfloor\).

The reservation table supports selective clearing by owner ID (`clearOwnerFromTime(ownerId, fromTime)`) and owner filtering (`cloneForOwner(ownerId)`), ensuring agent re-planning never wipes out other drones' or forklifts' space-time commitments.

## 3. Blocked-Goal Repair & Forklift Corridor Safety

Warehouse pallets occupy blocked voxels. To make those tasks reachable, `nearestFreeNeighbor(...)` performs a bounded breadth-first search around the requested goal until a free adjacent voxel is found.

The search:

- expands only non-wait neighbors,
- respects the flight ceiling constraint (`ny <= maxAltitude`),
- actively identifies dynamic forklift patrol corridors and rejects ground-level/cage-height cells (\(y \le 1\)), steering drones to hover at a safe altitude (\(y \ge 2\)) directly overlooking bottom pallets,
- stops after at most 200 visited states,
- returns the safest unblocked neighbor or original position.

## 4. Implemented A* Variants

### 4.1 `NaivePlanner`

`NaivePlanner` simulates selfish baseline behavior: agents plan paths independently without coordinating with other drones. However, dynamic ground machinery (forklifts) represents physical environment hazards; `NaivePlanner` copies forklift reservations (`cloneForOwner('FORKLIFT')`) while ignoring other drones. Drone-drone collisions are analyzed post hoc.

Its A* objective is time-step minimization:

\[
g(n)=\text{number of elapsed actions from the leg start}.
\]

The heuristic is Manhattan distance:

\[
h(n)=\lVert pos(n)-goal \rVert_1.
\]

### 4.2 `CooperativePlanner`

`CooperativePlanner` uses prioritized time-expanded A* with joint vertex and directed edge reservation.

For each previously planned trajectory \(\pi_i\), the planner registers:

- every occupied vertex-time pair on the path,
- every directed edge transition \((p_i(t-1) \to p_i(t))\),
- the arrival voxel for an idle tail duration (up to 500 ticks), preventing other drones from colliding into resting or scanning agents.

### 4.3 `EnergySaverPlanner`

`EnergySaverPlanner` minimizes total flight and hover energy.

For a move action:

\[
c_{move}=\beta_{fly} = 0.10,
\]

and for a wait action:

\[
c_{wait}=\beta_{hover} = 0.05.
\]

The accumulated path cost is:

\[
g(n)=\sum_{\ell \le n} c_{\ell}.
\]

The heuristic is:

\[
h(n)=\beta_{fly}\lVert pos(n)-goal \rVert_1.
\]

Unlike naive binary closed-set pruning, `EnergySaverPlanner` tracks minimal cost-to-reach via a continuous `bestG` map (`Map<number, number>`). Nodes arriving at the same space-time voxel with strictly lower energy are permitted to relax and re-expand, guaranteeing optimal energy paths are preserved.

### 4.4 `CBSPlanner` (Conflict-Based Search)

[`classes/CBSPlanner.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/CBSPlanner.ts) implements Conflict-Based Search (Sharon et al., 2015) over each planning leg. Every drone that has a target in the current cycle is planned jointly.

**High level.** A constraint tree is searched best-first by the sum of leg durations
\[
\text{SOC} = \sum_i \left(|\pi_i| - 1\right).
\]
The root plans each drone alone. For a node, `ConflictDetector` finds the earliest conflict between two drones, over all ticks \(t \ge \max(t^{start}_i, t^{start}_j)\). A drone stays parked on its last cell after arriving. Conflicts are either

- a **vertex conflict** \(\pi_i(t) = \pi_j(t)\), branched into the constraints \(\langle i, v, t\rangle\) and \(\langle j, v, t\rangle\), or
- an **edge (swap) conflict**, branched into \(\langle i, u \to v, t\rangle\) and \(\langle j, v \to u, t\rangle\).

Each child re-plans only the constrained drone. The first conflict-free node is committed through the same `commitLeg(...)` path as the prioritized planners.

**Low level.** The shared time-expanded A* (`findPath`) is reused unchanged. `ConstrainedReservationView` decorates the shared `SpaceTimeReservations` with the drone's `ConstraintTable`, through the `ReservationView` interface. It also implements `canHoldGoal`: a goal only counts as reached if no constraint, and no committed reservation of another drone, needs the cell during the drone's *hold time* after arrival. This is what removes the goal-parking conflicts left over by prioritized planning.

**Hold time.** `MissionController.continuesAfterCurrentLeg()` tells whether the drone departs again right after the leg. Since drones never finish airborne, that is true for every pallet stop.
- In that case its next leg (the next task, or the flight home) is planned from the arrival tick, so it holds its goal for only 1 tick.
- Only a flight to the dock is a parking goal, held for the whole look-ahead window (`world.size * 4` ticks).

`ConflictDetector` applies the same hold time. Assuming every drone parks forever over-constrained round trips: it pushed required arrivals past the search depth, causing exhaustive failed searches of about 2.5 s each on 24³ grids.

**Scope rules.**
- Committed traffic (forklifts, and drones not re-planned this cycle) is treated as fixed obstacles, as in the other planners.
- Drones' start cells stay reserved, and a constraint on a drone's fixed start prunes that branch.
- The dock floor (`Warehouse.isOnDockFloor`) is not deconflicted, matching `CollisionAnalyzer`.

**Budget and fallback.** A leg whose search exceeds `maxExpansions` (default 500 constraint-tree nodes) or `timeBudgetMs` (default 2000 ms) is delegated to an injected fallback strategy, `CooperativePlanner` by default. Drones with no path even unconstrained go through the normal retry/abandon handling.

**Measured behaviour** (`npm run bench -- --preset full --runs 3`: 432 runs over 12³–24³ grids, 2–8 drones, both allocation modes, both completion modes; see [`benchmark.md`](benchmark.md)):
- zero collisions, zero stranded drones and 100% pallet coverage in full-coverage missions. After the parking-tail fix below, `Cooperative` and `Energy Saver` reach the same;
- the fallback was never triggered;
- makespan was the same as `Cooperative` (1171 ticks in full-coverage missions), because CBS minimises the sum of leg durations rather than the makespan;
- planning took 299 ms per full-coverage mission on average (at most 0.94 s), against 190 ms for `Cooperative`.

**Parking tails.** `commitLeg` reserves the goal cell after arrival, so that later plans avoid the resting drone. The tail stops at the first tick another drone already holds. Overwriting that reservation, and clearing it again when the parked drone left, used to erase the other drone's path from the table. That was the source of the remaining collisions in all collision-avoiding planners.

## 5. Battery Constraint During Planning

Each search state tracks an `energy` field representing accumulated consumption along that leg. Successors are pruned if `energy > maxEnergy`.

At the start of each mission leg, the planner computes the drone's true residual battery by simulating its complete flight and recharge history up to `startTime` via `drone.calculateStateAt(...)`. This residual battery is passed as `availableEnergy`, ensuring that multi-leg flights accurately reflect battery depletion across consecutive dispatches.

## 6. Safety Constraints and Edge Conflict Prevention

The planning stack enforces both vertex and directed edge conflict prevention:

1. **Vertex Conflict:**
   No two agents may occupy the same voxel at the same time:
   \[
   \pi_i(t) \neq \pi_j(t) \quad \forall i \neq j.
   \]

2. **Directed Edge Swapping Conflict:**
   Head-on swaps across adjacent cells are forbidden:
   \[
   \neg \left(\pi_i(t) = \pi_j(t+1) \land \pi_i(t+1) = \pi_j(t)\right).
   \]

Both constraints are enforced during A* expansion against previously planned drones as well as moving forklifts (at both body and clearance height levels). `CBSPlanner` additionally resolves them jointly among the drones planned in the same leg (Section 4.4).

## 7. Complexity

If the search horizon is capped by \(T\) and the free-space volume is \(|V|\), then the time-expanded state space is \(O(|V|T)\). With a standard sorted open list, one leg search is roughly

\[
O(|V|T \log(|V|T))
\]

in the usual A* sense.

The multi-drone cooperative approach multiplies this by the number of planned drones, but remains a decoupled rather than coupled solver.
