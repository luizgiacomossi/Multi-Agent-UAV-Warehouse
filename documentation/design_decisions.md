# Design Decisions and Tradeoffs

## 1. Decoupled Prioritized Planning Instead Of Coupled MAPF

The repository chooses decoupled prioritized planning because it is implementable, inspectable, and responsive in a browser setting.

The price is standard:

- incompleteness,
- order sensitivity,
- suboptimality relative to coupled solvers.

This tradeoff is justified if the goal is a practical experimental platform rather than a complete optimal MAPF benchmark.

## 2. Flat Voxel Storage

The use of a flattened `Uint8Array` is a sound engineering choice for JavaScript and TypeScript.

Advantages:

- constant-time occupancy checks,
- compact memory layout,
- lower object allocation pressure than pointer-heavy graph structures.

## 3. Precomputed Histories Instead Of Online Control

The engine plans full path histories first and replays them later. This keeps the visualization deterministic and simplifies incident analysis.

The cost is that the runtime model is closer to offline planning than to a reactive onboard autonomy stack.

## 4. Centralization Instead Of Distributed Protocols

The code focuses on allocation and planning quality under perfect information. That makes centralization a reasonable first abstraction.

It also means the current simulator does not answer questions about:

- communication delays,
- packet loss,
- consensus,
- decentralized negotiation.

## 5. Heuristic Clustering

Cluster mode uses local grouping plus greedy touring because it is fast and easy to inspect. This is a good prototyping decision, but it should be presented as heuristic batching rather than as exact clustered routing.

## 6. Post Hoc Incident Analysis

The system performs strong analysis after planning rather than enforcing every physically relevant constraint during planning.

That choice is defensible for an exploratory simulator, but it should not be conflated with formal safety guarantees.
