# Control and Execution Pipeline

## 1. Precomputation First

The engine computes mission histories before playback. This is the key execution principle of the repository.

`SimulationManager.runPathfinding(...)` performs:

1. mission-controller initialization,
2. forklift reservation-table insertion,
3. repeated allocation and leg planning,
4. post hoc incident detection,
5. cloning of final agent histories for UI consumption.

The UI does not run the planner in the frame loop.

## 2. Leg-By-Leg Planning

Planning is not done as one monolithic route from start to terminal mission completion. Instead the engine iterates over mission legs.

At each cycle:

1. the current planner appends one leg to each active drone,
2. each drone updates its mission-controller state through `completeLeg()`,
3. newly idle drones are reallocated,
4. the loop repeats until all drones are completed or stranded, or the safety bound is reached.

This is a pragmatic decomposition that keeps the implementation inspectable.

## 3. Reservation Horizon

The reservation table persists across legs. Forklifts are inserted for the full global time horizon, while drone reservations accumulate as paths are appended.

This means a late-assigned drone still plans around paths generated much earlier in the global simulation.

## 4. Playback

Playback is handled in [`App.tsx`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/App.tsx) with a discrete `tick` incremented by `setInterval(..., 150)`.

At each playback tick:

- drone pose is read from the precomputed path,
- battery and recharge state are reconstructed,
- pallet status is derived from scan logs and assignment logs,
- collisions already detected by the engine are visualized if their incident time has been reached.

## 5. Incident Detection

After planning completes, `CollisionAnalyzer.detect(...)` checks:

- drone-drone same-voxel collisions,
- drone-forklift occupancy collisions,
- drone-forklift swap-through collisions.

Battery incidents are checked separately by replaying each planned path through the battery model and recording the first tick at which charge reaches zero.

## 6. Important Caveat

Because many safety checks are post hoc rather than enforced as hard constraints during every phase of planning, the simulator should be described as a centralized planning-and-analysis framework, not as a formally verified execution system.
