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
- `RETURNING`: moving back to the drone's own dock slot,
- `RECHARGING`: moving to a charging station to recharge (a recharge job, see Section 5 of [`task_allocation.md`](task_allocation.md)),
- `IDLE`: ready for a new allocation round,
- `COMPLETED`: no further missions to assign, landed on the dock.

Clustered missions keep an internal task index and advance through the tour sequence one leg at a time.

A drone never finishes, or waits for work, airborne:
- after its last mission it always flies back to its dock, even when "Return" (return between missions) is off;
- an idle drone that gets no task while away from its dock is sent home (`returnToDock()`);
- in full-coverage missions, idle drones land once every pallet is done.

Every pallet stop is therefore followed by another leg. Only the dock and a charging station (where the drone stays to charge) are parking goals (`continuesAfterCurrentLeg()`). CBS uses this to set how long a drone holds its goal.

The status shown for each drone in the UI and in the voice assistant is derived per tick by `describeDroneActivity` ([`classes/DroneActivity.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/DroneActivity.ts)), from the planned path, task log and scan log. The possible states are: en route, scanning, returning, to charger, holding, in transit, charging, docked, complete, crashed, depleted and blocked. "Charging" is shown only while the battery is actually filling up. `Agent.status` is only the final planning outcome.

## 3. Path Appending and Scan Registration

When a new leg is planned, `Drone.appendPath(...)` appends all path states except the duplicated starting state. If the leg corresponds to a scan target, the arrival tick is stored in `scanLog`.

This design is subtle:

- `scanLog` is used by the UI to color pallets as scanned at the correct playback tick;
- the allocation logic separately tracks in-flight tasks so that a pallet is not considered globally completed too early.

## 4. Battery Dynamics

The battery bookkeeping is reconstructed by iterating through the planned path in `calculateStateAt(...)`.

For each time step:

1. If the drone is waiting on its dock or on a charging station, it charges: the battery gains \(r \cdot B_{max}/100\) per tick, capped at `maxBattery`, where \(r\) is the charge rate in % of capacity per tick (`Drone.chargeRatePercent`). With instant charging (\(r = \infty\), the original model) one waiting tick restores a full battery. Idle drones parked on their dock charge to full before each allocation round (`SimulationManager.rechargeDockedDrones`), which takes \(\lceil (B_{max}-B)/(r B_{max}/100) \rceil\) ticks (`Drone.ticksToFullCharge`).
2. Otherwise a move consumes `BETA_FLY`.
3. A wait consumes `BETA_HOVER`.

Both costs are scaled by the **drain multiplier** \(m\) (`Drone.drainMultiplier`, UI "Battery drain", default 1): \(m = 2\) empties the battery twice as fast. Every energy estimate uses the same \(m\): the battery replay, the planner's energy budget (the battery divided by \(m\), since the search counts nominal β units), the allocation's \(e_{req}\), and the charger choice.

Formally, if \(p(t-1)\neq p(t)\), then

\[
B(t)=B(t-1)-m\,\beta_{fly},
\]

and if \(p(t-1)=p(t)\), then

\[
B(t)=B(t-1)-m\,\beta_{hover},
\]

except at charging states, where \(B(t)=\min(B_{max}, B(t-1) + r B_{max}/100)\).

`Drone.chargingSessions` lists every stay on a charger during which the battery fills up (start and end tick, battery before and after). The telemetry panel shows them for the whole fleet as the **Charging Schedule** (`classes/ChargingSchedule.ts`): since paths are planned before playback, the schedule is known in full, and each session is marked planned, charging or done at the current tick. Station numbers match the "CHARGE S*n*" labels in the 3D view.

The charge rate is set in the UI ("Instant" or "% per tick", default 2%/tick, i.e. a full charge in 50 ticks) and passed to `runPathfinding`. Instant charging keeps earlier results reproducible: with instant charging and the base only, the benchmark reproduces the earlier results exactly.

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
