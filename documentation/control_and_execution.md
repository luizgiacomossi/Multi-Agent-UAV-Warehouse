# Control and Execution Pipelines

VoxelSwarm distinguishes itself by strictly mapping the algorithmic Control Theory layers into a non-blocking browser execution pipeline. Understanding the temporal constraints and execution loops is critical to interpreting the output datasets.

## 1. The Pre-Computation execution model

Unlike interactive games where physics loops compute velocity integrals every 16ms, VoxelSwarm operates an **Asynchronous Pre-Computation Pipeline**. To accurately resolve multi-agent Time-Expanded Graphs (which require exploring thousands of permutations of $(x,y,z,t)$ coordinates), real-time evaluation is mathematically intractable within the 16ms budgeted for a 60 FPS presentation layer.

### 1.1 `runPathfinding()` Orchestration
1. Process triggered from the top-level React UI thread.
2. The `SimulationManager` iterates `MissionController` goals sequentially.
3. Path arrays `Position3D[]` are computationally populated for the entire operational timeframe $T=0 \to T_{final}$.
4. Post-processing steps evaluate anomalies (e.g., collisions, battery dead-states).

By computing the entire history state prior to visual execution, VoxelSwarm establishes an immutable tracking dataset that allows rigorous regression testing, Monte-Carlo scaling, and time-scrubbing.

## 2. Rendering and Interpolation

The Presentation loop (WebGL via React Three Fiber) is completely divested from agent logic.

React defines a single `globalTick` timer. Inside the WebGL canvas, `useFrame()` hooks bind directly to the browser's native `requestAnimationFrame`, intercepting the frame loop and updating the 3D translation matrices of the `InstancedMesh`.

```typescript
const agentLocalTransform = calculatedPath[globalTick]; 
// Translate Mesh without invoking React Tree Reconciliations
```

## 3. Real-Time Collision and Event Analysis

Post-trajectory resolution, the `CollisionAnalyzer` constructs a temporary hash-map evaluating global intersections.

$$ Map: (Time) \to List[Agent\_ID] $$

### 3.1 Inter-Agent Collisions
If `Map.get(tick_state).length > 1`, the specific coordinate represents a simultaneous collision. 
If the `NaivePlanner` strategy is utilized, collision states propagate a semantic `Destroyed` flag, forcibly truncating the respective agent array memories `< path.slice(0, collisionTime+1)`.

### 3.2 Dynamic Entity Collisions
The `World` tracks autonomous looped entities like Forklifts. These operate independently of the Drone pathfinding logic. The Analyzer performs secondary evaluations mapping the Forklift spatial footprint `(x, y=[0,1], z)` against the drone arrays, appending `SimulationIncident` metadata to the global React Store if overlapping logic triggers.
