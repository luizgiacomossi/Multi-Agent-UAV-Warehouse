# Agent Model and Mission Dynamics

## 1. Drone State Representation

Each drone stores a discrete path

\[
\pi_i = [p_i(0), p_i(1), \dots, p_i(T_i)],
\]

where each \(p_i(t) \in \mathbb{Z}^3\).

The path is not generated online during playback. It is precomputed and later replayed.

The drone also stores:

- nominal and current battery values,
- payload types,
- scan logs,
- assignment logs,
- optional destruction time,
- mission-controller state.

## 2. Mission Controller

The mission logic is implemented in [`classes/MissionController.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/MissionController.ts).

The mission-state machine is:

- `IDLE`
- `OUTBOUND`
- `EXECUTING_TOUR`
- `RETURNING`
- `COMPLETED`

The semantics are:

- `OUTBOUND`: moving toward a single task or the first task of a cluster,
- `EXECUTING_TOUR`: traversing the remaining tasks of a cluster,
- `RETURNING`: moving back to the warehouse base,
- `IDLE`: ready for a new allocation round,
- `COMPLETED`: no further missions to assign.

Clustered missions keep an internal task index and advance through the tour sequence one leg at a time.

## 3. Path Appending and Scan Registration

When a new leg is planned, `Drone.appendPath(...)` appends all path states except the duplicated starting state. If the leg corresponds to a scan target, the arrival tick is stored in `scanLog`.

This design is subtle:

- `scanLog` is used by the UI to color pallets as scanned at the correct playback tick;
- the allocation logic separately tracks in-flight tasks so that a pallet is not considered globally completed too early.

## 4. Battery Dynamics

The battery bookkeeping is reconstructed by iterating through the planned path in `calculateStateAt(...)`.

For each time step:

1. If the drone is waiting at base or at a charge station, the battery is reset to `maxBattery`.
2. Otherwise a move consumes `BETA_FLY`.
3. A wait consumes `BETA_HOVER`.

Formally, if \(p(t-1)\neq p(t)\), then

\[
B(t)=B(t-1)-\beta_{fly},
\]

and if \(p(t-1)=p(t)\), then

\[
B(t)=B(t-1)-\beta_{hover},
\]

except at recharging states where \(B(t)=B_{max}\).

## 5. Battery Death And Falling Visualization

If the reconstructed battery reaches zero at tick \(t_d\), the drone records a `deathTick`.

For playback times \(t \ge t_d\), the rendered position becomes:

\[
x(t)=x(t_d), \quad
z(t)=z(t_d), \quad
y(t)=\max\{0, y(t_d)-0.8(t-t_d)\}.
\]

This is a visualization device rather than a physical flight-dynamics model.

## 6. Collision Destruction

If a collision incident is detected post hoc, `SimulationManager` sets `destructionTime` and truncates the remaining path from that tick onward. The drone then remains stranded for the rest of the replay.
