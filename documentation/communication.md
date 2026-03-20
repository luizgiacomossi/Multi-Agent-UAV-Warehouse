# Coordination and Communication Model

## 1. Centralized Coordination

VoxelSwarm is a centralized simulator. There is no explicit peer-to-peer communication protocol between drones.

Coordination happens through shared centralized data structures owned by the planner:

- the world state,
- the task list,
- the reservation table,
- the mission allocator.

Therefore the correct conceptual analogue is a fleet-management server or ground-station planner, not a decentralized swarm protocol.

## 2. Implicit Information Sharing

The main coordination structure is the reservation table

\[
\mathcal{R} \subset \mathcal{V} \times \mathbb{N}.
\]

When a higher-priority drone is planned first, its path states are inserted into \(\mathcal{R}\). Later drones treat those states as unavailable.

Thus information sharing is implicit and perfect:

- no packet loss,
- no latency,
- no bandwidth limit,
- no asynchronous disagreement.

This is mathematically clean for algorithm comparison, but it is also a strong abstraction.

## 3. Priority Rule

The cooperative planners enforce a strict plan-order priority. Earlier drones acquire spatiotemporal rights first, later drones adapt.

This removes some negotiation complexity, but it also means:

- the system is order-sensitive,
- lower-priority drones may become stranded,
- a feasible joint solution can still be missed.

## 4. Dynamic Obstacles

Forklifts are also inserted into the reservation structure before drone planning begins. From the drone planner's perspective, they are deterministic moving obstacles with full future observability.

## 5. Fault Handling

Battery incidents and collisions are not negotiated between drones. They are detected centrally after planning, then exposed to the UI as incidents. The separate fault-tolerance experiment also performs reassignment from a centralized viewpoint.
