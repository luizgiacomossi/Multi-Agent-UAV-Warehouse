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

The implemented reservation table stores occupied vertex-time pairs in a `Set<number>`. The hash function is

\[
\operatorname{key}(x,y,z,t)
=
x + (y \ll 6) + (z \ll 12) + (t \ll 18).
\]

This encoding assumes the relevant coordinate ranges fit within those bit fields.

The reservation table is used by the cooperative planners to reject successor states already claimed by previously planned drones or by forklifts.

## 3. Blocked-Goal Repair

Warehouse pallets occupy blocked voxels. To make those tasks reachable, `nearestFreeNeighbor(...)` performs a bounded breadth-first search around the requested goal until a free adjacent voxel is found.

The search:

- expands only non-wait neighbors,
- stops after at most 200 visited states,
- returns the original blocked goal if no repair is found.

Thus reachability is improved heuristically, not guaranteed.

## 4. Implemented A* Variants

### 4.1 `NaivePlanner`

`NaivePlanner` ignores the shared reservation table and runs A* independently for each drone. It therefore does not attempt dynamic deconfliction between drones. Collisions are detected after planning.

Its A* objective is time-step minimization:

\[
g(n)=\text{number of elapsed actions from the leg start}.
\]

The heuristic is Manhattan distance:

\[
h(n)=\lVert pos(n)-goal \rVert_1.
\]

### 4.2 `CooperativePlanner`

`CooperativePlanner` uses the same A* cost function as the naive planner, but it rejects reserved vertex-time states.

For each previously planned path \(\pi_i\), the planner inserts:

- every occupied vertex-time pair on the path,
- the goal voxel for four extra time steps after arrival.

This introduces a simple yielding mechanism for later-planned drones.

### 4.3 `EnergySaverPlanner`

`EnergySaverPlanner` changes the A* objective to an energy-like additive cost.

For a move action:

\[
c_{move}=\beta_{fly},
\]

and for a wait action:

\[
c_{wait}=\beta_{hover}.
\]

The accumulated path cost becomes

\[
g(n)=\sum_{\ell \le n} c_{\ell}.
\]

The heuristic is

\[
h(n)=\beta_{fly}\lVert pos(n)-goal \rVert_1.
\]

Because \(\beta_{hover} > \beta_{fly}\) in the current configuration, waiting is actually more expensive than moving. That is the opposite of what the older documentation claimed.

## 5. Battery Constraint During Planning

Each search state also tracks an `energy` field. Successors are pruned if this exceeds `maxEnergy`.

However, the runtime planners currently pass `drone.maxBattery`, not the drone's actual residual battery at the current mission stage. So the search horizon is energy-bounded only by nominal full capacity, not by exact remaining charge after earlier legs.

This is one of the most important implementation gaps between the mathematical intention and the current planner behavior.

## 6. What Safety Is Actually Enforced

The current planners enforce only vertex-time avoidance through reservations. They do not explicitly reserve directed edges, so the standard MAPF edge-swap constraint

\[
\pi_i(t)=\pi_j(t+1), \quad
\pi_i(t+1)=\pi_j(t)
\]

is not directly prevented for drone-drone interactions.

Therefore the code should not be described as implementing the full classical MAPF conflict model. It implements a weaker reservation scheme that works well in many cases but is not complete with respect to all pairwise conflicts.

## 7. Complexity

If the search horizon is capped by \(T\) and the free-space volume is \(|V|\), then the time-expanded state space is \(O(|V|T)\). With a standard sorted open list, one leg search is roughly

\[
O(|V|T \log(|V|T))
\]

in the usual A* sense.

The multi-drone cooperative approach multiplies this by the number of planned drones, but remains a decoupled rather than coupled solver.
