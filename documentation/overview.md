# Project Overview

## 1. Introduction

The **VoxelSwarm** platform is a high-fidelity, web-based simulation environment designed for the rigorous analysis of Multi-Agent Path Finding (MAPF), task allocation, and autonomous swarm behaviors in complex, discretized 3D environments ($\mathbb{Z}^3$). 

Originating out of research in autonomous systems and swarm intelligence, the project serves as an executable testbed to evaluate trade-offs in computational tractability, sub-optimality, and energy constraints in multi-drone logistics operations (such as automated warehouse inventory inspection).

## 2. Research Context and Goals

State-of-the-art multi-agent planning often faces the curse of dimensionality. Coupled approaches to MAPF scale exponentially $O(|V|^k)$ with respect to the number of agents $k$. VoxelSwarm implements decoupled, heuristic-driven methods—namely Prioritized Planning on Time-Expanded Graphs (Cooperative A*)—to achieve polynomial-time resolution of complex spatial-temporal conflicts. 

The primary research objectives addressed by this repository are:
1. **Scalable Task Allocation**: Implementing globally optimal centralized assignment strategies utilizing the Hungarian algorithm (Munkres) coupled with composite multi-objective cost functions (distance minimization + non-linear battery degradation).
2. **Energy-Aware Pathing**: Exploring the impact of biologically inspired or strict operational constraints (e.g., flight vs. hover drain dynamics) on optimal routing through non-uniform cost functions.
3. **Fault Tolerance and Resilience**: Simulating dynamic task reallocation under simulated catastrophic agent failures (e.g., mid-flight battery exhaustion) with measurable recovery latencies.

## 3. Scope of the Implementation

The repository is structured to separate algorithmic logic purely in standard TypeScript, decoupled from the React 19 / React-Three-Fiber frontend. This ensures that the simulation can be run in headless environments or WebWorkers for large-scale Monte Carlo data gathering. 

Key features include:
* **Procedural Environments**: Stochastic Volumetric Generation supporting urban canyons, tunnel networks, and warehouse rack configurations.
* **Deterministic Execution State**: Physics and agent states are resolvable purely via discrete time ticks without side effects, enabling accurate replay and theoretical validation.
* **Algorithmic Extensibility**: A Strategy-pattern implementation allowing hot-swapping between solvers (Naive, Cooperative, Energy-Saver) and observing emergent macroscopic swarm properties.
