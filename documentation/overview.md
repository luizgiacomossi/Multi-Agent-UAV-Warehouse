# Project Overview

## 1. Purpose

VoxelSwarm is an executable research prototype for studying centralized coordination of multiple drones in a discretized 3D environment. The system combines:

- task allocation,
- path planning,
- mission execution,
- battery bookkeeping,
- and interactive visualization.

The core research question represented in the codebase is not "how to solve general MAPF optimally," but rather:

How far can a browser-hosted, centralized, heuristic planning stack go while remaining interpretable, inspectable, and computationally tractable?

## 2. Problem Setting

Let the environment be a finite voxel grid

\[
\mathcal{V} = \{0,\dots,S-1\}^3 \subset \mathbb{Z}^3,
\]

with obstacle set \(\mathcal{O} \subset \mathcal{V}\), drone set

\[
\mathcal{A} = \{a_1,\dots,a_N\},
\]

and task set

\[
\mathcal{T} = \{\tau_1,\dots,\tau_M\}.
\]

Each drone has:

- a start state \(s_i \in \mathcal{V}\),
- a battery level \(B_i\),
- a payload capability set \(P_i\),
- a precomputed path \(\pi_i : \{0,\dots,T_i\} \to \mathcal{V}\).

Each task has:

- a target voxel \(g_k \in \mathcal{V}\),
- a required payload type \(r_k\),
- a hover duration \(t_k^{hover}\),
- a scalar priority \(\pi_k > 0\).

The implemented workflow decomposes the overall problem into two coupled subproblems:

1. Assign currently idle drones to tasks or task clusters.
2. Plan collision-avoiding legs sequentially using a prioritized space-time reservation table.

## 3. What Is Implemented

The repository currently implements the following stack.

### 3.1 Allocation

`CostModel` builds a dense cost matrix and solves a linear assignment problem using the Hungarian algorithm through `munkres-js`; see [`classes/CostModel.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/CostModel.ts).

### 3.2 Path planning

`PathPlanner` provides:

- `NaivePlanner`,
- `CooperativePlanner`,
- `EnergySaverPlanner`.

These planners search a time-expanded grid and append one mission leg at a time; see [`classes/PathPlanner.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/PathPlanner.ts).

### 3.3 Mission control

`MissionController` manages the mission state machine:

- `IDLE`
- `OUTBOUND`
- `EXECUTING_TOUR`
- `RETURNING`
- `COMPLETED`

This is implemented in [`classes/MissionController.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/MissionController.ts).

### 3.4 Clustered warehouse inspection

The code supports a cluster allocation mode. Clusters are built locally from nearby pallets using a KD-tree range query, and each cluster is internally ordered by a greedy nearest-neighbor tour heuristic. This is important: the implementation is heuristic, not an exact mTSP or TSP solver.

## 4. What Is Not Implemented

The code should not be described as containing any of the following, because it does not.

- Conflict-Based Search
- optimal coupled MAPF
- decentralized inter-agent communication
- exact TSP optimization inside clusters
- full benchmark baselines for Monte Carlo experiments
- full online replanning from actual residual battery during search

## 5. Documentation Philosophy

The revised documentation aims at a PhD-appropriate standard in two senses:

1. The mathematical notation is explicit enough to support a methods section.
2. The claims are constrained to what the code actually does.

Where the implementation uses a heuristic or approximation, this is stated directly rather than framed as a stronger result.
