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

Both constraints are enforced during A* expansion against previously planned drones as well as moving forklifts (at both body and clearance height levels).

## 7. Complexity

If the search horizon is capped by \(T\) and the free-space volume is \(|V|\), then the time-expanded state space is \(O(|V|T)\). With a standard sorted open list, one leg search is roughly

\[
O(|V|T \log(|V|T))
\]

in the usual A* sense.

The multi-drone cooperative approach multiplies this by the number of planned drones, but remains a decoupled rather than coupled solver.
