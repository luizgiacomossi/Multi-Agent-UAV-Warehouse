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

The loop is ordered by time. Each drone's clock is the last tick of its planned path. At each cycle:

1. the *event horizon* is the earliest clock among drones with a leg to fly, plus a sync window of `EVENT_SYNC_WINDOW_TICKS` (10). With no leg pending, the horizon is unbounded;
2. the planner appends one leg to each drone with a leg to fly whose clock is within the horizon. Planning them together lets CBS resolve their conflicts jointly;
3. each of those drones updates its mission-controller state through `completeLeg()`;
4. idle drones whose clock is within the horizon are allocated. An idle drone further ahead in time waits, because a busy drone may still become free earlier. Docked idle drones recharge first;
5. idle drones that got no task and are away from their dock never wait airborne. A drone whose battery cannot cover any pallet offered in this round gets a recharge job (the base or a station that is free in time, see [`task_allocation.md`](task_allocation.md)); any other drone flies home. A drone arriving at a station charges to full there. Charging decisions and station bookings are in `ChargingPolicy`;
6. the loop repeats until all drones are completed or stranded, nothing can progress, or the safety bound is reached.

Planning all drones every cycle, regardless of their clocks, let clocks drift apart by hundreds of ticks. A drone that was free early could then not pick up tasks another drone took much later, and full-coverage missions ended with one drone idle for up to 17% of the mission. With time ordering the gap is under about 5%.

This is a pragmatic decomposition that keeps the implementation inspectable.

## 3. Reservation Horizon

The reservation table persists across legs. Forklifts are inserted for the full global time horizon, while drone reservations accumulate as paths are appended.

This means a late-assigned drone still plans around paths generated much earlier in the global simulation.

The converse also holds: drone clocks differ, so a drone that is behind in time plans around legs other drones have already committed for its future. Anything shared, such as a charging station, has to be checked against the reservations from that drone's clock on, not against what other drones are doing in the current planning cycle.

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
