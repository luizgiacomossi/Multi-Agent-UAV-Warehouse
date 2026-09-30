import { Position3D } from '../types';
import { World } from './World';
import { Swarm, Drone } from './Drone';
import {
  PathFindingStrategy,
  SpaceTimeReservations,
  ReservationView,
  LegContext,
  MinHeap,
  cellKey,
  spaceTimeKey
} from './PathPlanner';
import { PATHFINDER_TIMEOUT_MS } from '../SimulationConfig';

// ─── Constraint model ─────────────────────────────────────────────────────────

/** Forbids one agent from occupying a cell, or traversing a directed edge, at a time step. */
export type Constraint =
  | { kind: 'vertex'; agentId: string; pos: Position3D; time: number }
  | { kind: 'edge'; agentId: string; from: Position3D; to: Position3D; time: number };

/** Two agents in the same cell at `time`, or swapping cells between `time` and `time + 1`. */
export type Conflict =
  | { kind: 'vertex'; agentA: string; agentB: string; pos: Position3D; time: number }
  | { kind: 'edge'; agentA: string; agentB: string; from: Position3D; to: Position3D; time: number };

const edgeKey = (from: Position3D, to: Position3D, time: number): string =>
  `${time}:${cellKey(from)}->${cellKey(to)}`;

const samePos = (a: Position3D, b: Position3D): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z;

/** Cells where drones are not deconflicted (e.g. the dock floor). */
export type ExemptCellPredicate = (pos: Position3D) => boolean;
const NO_EXEMPT_CELLS: ExemptCellPredicate = () => false;

/** One agent's constraints, indexed for constant-time lookups inside the low-level search. */
export class ConstraintTable {
  private readonly vertices = new Set<number>();
  private readonly edges = new Set<string>();
  /** Latest constrained time per cell: an agent may only park on a cell after that time. */
  private readonly latestVertexTime = new Map<number, number>();

  constructor(constraints: Constraint[]) {
    for (const c of constraints) {
      if (c.kind === 'vertex') {
        this.vertices.add(spaceTimeKey(c.pos, c.time));
        const cell = cellKey(c.pos);
        this.latestVertexTime.set(cell, Math.max(this.latestVertexTime.get(cell) ?? -1, c.time));
      } else {
        this.edges.add(edgeKey(c.from, c.to, c.time));
      }
    }
  }

  public hasVertex(key: number): boolean {
    return this.vertices.has(key);
  }

  public hasEdge(from: Position3D, to: Position3D, time: number): boolean {
    return this.edges.has(edgeKey(from, to, time));
  }

  /** Whether a constraint still applies to this cell at or after `time`. */
  public isConstrainedFrom(pos: Position3D, time: number): boolean {
    return (this.latestVertexTime.get(cellKey(pos)) ?? -1) >= time;
  }
}

/**
 * Decorates the shared reservations with one agent's CBS constraints (open/closed: the A* search
 * is reused unchanged). A goal may only be held if no constraint or committed reservation
 * needs the cell within `holdHorizon` ticks after arrival; exempt cells can always be held.
 */
export class ConstrainedReservationView implements ReservationView {
  constructor(
    private readonly base: ReservationView,
    private readonly constraints: ConstraintTable,
    private readonly holdHorizon: number,
    private readonly isExempt: ExemptCellPredicate = NO_EXEMPT_CELLS
  ) {}

  public isVertexReserved(key: number, requesterId?: string): boolean {
    return this.constraints.hasVertex(key) || this.base.isVertexReserved(key, requesterId);
  }

  public isEdgeConflict(fromPos: Position3D, toPos: Position3D, time: number, requesterId?: string): boolean {
    return this.constraints.hasEdge(fromPos, toPos, time) ||
      this.base.isEdgeConflict(fromPos, toPos, time, requesterId);
  }

  public canHoldGoal(pos: Position3D, arrivalTime: number, requesterId?: string): boolean {
    if (this.isExempt(pos)) return true;
    if (this.constraints.isConstrainedFrom(pos, arrivalTime + 1)) return false;
    for (let t = arrivalTime + 1; t <= arrivalTime + this.holdHorizon; t++) {
      if (this.base.isVertexReserved(spaceTimeKey(pos, t), requesterId)) return false;
    }
    return true;
  }
}

// ─── Conflict detection ───────────────────────────────────────────────────────

/** A drone taking part in this leg's joint search, with its fixed start. */
interface CBSAgent {
  drone: Drone;
  leg: LegContext;
}

/** Candidate leg plans for a set of agents, indexed by agent (drone) id. */
type PlanSet = Map<string, Position3D[]>;

/** Finds the earliest vertex or swap conflict between the agents' candidate paths, ignoring exempt cells. */
export class ConflictDetector {
  /** Position at `time`; a drone stays parked on its last cell after its path ends. */
  private static positionAt(path: Position3D[], startTime: number, time: number): Position3D {
    return path[Math.min(Math.max(time - startTime, 0), path.length - 1)];
  }

  public static findFirst(agents: CBSAgent[], plans: PlanSet, isExempt: ExemptCellPredicate = NO_EXEMPT_CELLS): Conflict | null {
    let earliest: Conflict | null = null;

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const conflict = this.findBetween(agents[i], agents[j], plans, earliest?.time ?? Infinity, isExempt);
        if (conflict) earliest = conflict;
      }
    }
    return earliest;
  }

  /** Earliest conflict between two agents strictly before `before`, or null. */
  private static findBetween(
    a: CBSAgent,
    b: CBSAgent,
    plans: PlanSet,
    before: number,
    isExempt: ExemptCellPredicate
  ): Conflict | null {
    const pathA = plans.get(a.drone.id)!;
    const pathB = plans.get(b.drone.id)!;
    const startA = a.leg.startTime;
    const startB = b.leg.startTime;
    // Before the later start, the later agent is still on its committed (already reserved) path
    const from = Math.max(startA, startB);
    const until = Math.min(Math.max(startA + pathA.length, startB + pathB.length), before);

    for (let t = from; t < until; t++) {
      const posA = this.positionAt(pathA, startA, t);
      const posB = this.positionAt(pathB, startB, t);
      if (isExempt(posA) || isExempt(posB)) continue;
      if (samePos(posA, posB)) {
        return { kind: 'vertex', agentA: a.drone.id, agentB: b.drone.id, pos: posA, time: t };
      }
      if (t > from) {
        const prevA = this.positionAt(pathA, startA, t - 1);
        const prevB = this.positionAt(pathB, startB, t - 1);
        if (!samePos(prevA, posA) && samePos(prevA, posB) && samePos(posA, prevB)) {
          return { kind: 'edge', agentA: a.drone.id, agentB: b.drone.id, from: prevA, to: posA, time: t - 1 };
        }
      }
    }
    return null;
  }

  /** The two constraints CBS branches on to resolve a conflict (one per involved agent). */
  public static constraintsFor(conflict: Conflict): [Constraint, Constraint] {
    if (conflict.kind === 'vertex') {
      return [
        { kind: 'vertex', agentId: conflict.agentA, pos: conflict.pos, time: conflict.time },
        { kind: 'vertex', agentId: conflict.agentB, pos: conflict.pos, time: conflict.time }
      ];
    }
    return [
      { kind: 'edge', agentId: conflict.agentA, from: conflict.from, to: conflict.to, time: conflict.time },
      { kind: 'edge', agentId: conflict.agentB, from: conflict.to, to: conflict.from, time: conflict.time }
    ];
  }
}

// ─── High-level search ────────────────────────────────────────────────────────

/** A node of the constraint tree: a constraint set and the paths planned under it. */
interface ConstraintTreeNode {
  constraints: Constraint[];
  plans: PlanSet;
  cost: number; // sum of leg durations (ticks)
}

export interface CBSOptions {
  /** Constraint-tree nodes expanded per leg before handing the leg to the fallback planner. */
  maxExpansions: number;
  /** Wall-clock budget per leg (ms) before handing the leg to the fallback planner. */
  timeBudgetMs: number;
}

const DEFAULT_CBS_OPTIONS: CBSOptions = { maxExpansions: 500, timeBudgetMs: 2000 };

/**
 * Conflict-Based Search (Sharon et al., 2015) over each planning leg.
 *
 * All drones with a target this cycle are planned jointly: each is first planned alone with
 * space-time A* (respecting forklifts and already-committed traffic), then conflicts between
 * them are resolved by branching on per-agent constraints, expanding the cheapest node first.
 * The result is conflict-free and minimises the sum of leg durations.
 *
 * CBS can blow up in dense conflicts, so a leg that exceeds its budget is delegated to an
 * injected fallback planner (e.g. prioritized A*).
 */
export class CBSPlanner extends PathFindingStrategy {
  name = "Conflict-Based Search";
  description = "Joint optimal planning: resolves conflicts by branching on constraints. Falls back to prioritized A* if the search budget runs out.";
  isSafe = true;

  private readonly options: CBSOptions;

  constructor(private readonly fallback: PathFindingStrategy, options: Partial<CBSOptions> = {}) {
    super();
    this.options = { ...DEFAULT_CBS_OPTIONS, ...options };
  }

  public setMaxTimeSteps(steps: number) {
    super.setMaxTimeSteps(steps);
    this.fallback.setMaxTimeSteps(steps);
  }

  planLeg(
    swarm: Swarm,
    world: World,
    globalStartTime: number,
    reservedSpaceTime: SpaceTimeReservations | Set<number>,
    maxAltitude: number,
    batteryEnabled: boolean
  ) {
    // Constraint views need ownership-aware reservations
    if (!(reservedSpaceTime instanceof SpaceTimeReservations)) {
      this.fallback.planLeg(swarm, world, globalStartTime, reservedSpaceTime, maxAltitude, batteryEnabled);
      return;
    }

    const agents = this.collectAgents(swarm, world, batteryEnabled);
    if (agents.length === 0) return;

    // The agents' old parking tails are stale once they are re-planned. Their start cells stay
    // reserved: those positions are fixed, and no other drone may take them.
    agents.forEach(a => reservedSpaceTime.clearOwnerFromTime(a.drone.id, a.leg.startTime + 1));

    const search = new LegSearch(this, agents, world, reservedSpaceTime, maxAltitude, this.options, this.exemptCells(world));
    const solution = search.run();

    search.failedAgents.forEach(a =>
      this.handleLegFailure(a.drone, a.leg.startPos, a.leg.startTime, reservedSpaceTime)
    );

    if (solution) {
      search.plannedAgents.forEach(a =>
        this.commitLeg(a.drone, solution.get(a.drone.id)!, a.leg.startTime, reservedSpaceTime)
      );
    } else if (search.plannedAgents.length > 0) {
      console.info(`[CBS] Search budget exhausted for ${search.plannedAgents.length} drones; using ${this.fallback.name}.`);
      const subSwarm = new Swarm(0);
      subSwarm.drones = search.plannedAgents.map(a => a.drone);
      this.fallback.planLeg(subSwarm, world, globalStartTime, reservedSpaceTime, maxAltitude, batteryEnabled);
    }
  }

  /** The dock floor is not deconflicted, matching CollisionAnalyzer. */
  private exemptCells(world: World): ExemptCellPredicate {
    const warehouse = world.warehouse;
    return warehouse ? (pos: Position3D) => warehouse.isOnDockFloor(pos) : NO_EXEMPT_CELLS;
  }

  private collectAgents(swarm: Swarm, world: World, batteryEnabled: boolean): CBSAgent[] {
    const agents: CBSAgent[] = [];
    for (const drone of swarm.drones) {
      const leg = this.getLegContext(drone, world, batteryEnabled);
      if (leg) agents.push({ drone, leg });
    }
    return agents;
  }

  /** Low-level search: one agent's best leg under its constraints, or null if none exists. */
  public planAgent(
    agent: CBSAgent,
    constraints: Constraint[],
    world: World,
    base: ReservationView,
    maxAltitude: number,
    deadline: number,
    isExempt: ExemptCellPredicate = NO_EXEMPT_CELLS
  ): Position3D[] | null {
    const table = new ConstraintTable(constraints.filter(c => c.agentId === agent.drone.id));
    // A constraint on the fixed start makes this branch infeasible
    if (table.hasVertex(spaceTimeKey(agent.leg.startPos, agent.leg.startTime))) return null;

    const maxLegDepth = world.size * 4;
    const view = new ConstrainedReservationView(base, table, maxLegDepth, isExempt);
    const result = this.findPath(
      agent.leg.startPos,
      agent.leg.target,
      agent.leg.startTime,
      world,
      view,
      agent.leg.availableEnergy,
      deadline,
      maxAltitude,
      maxLegDepth,
      agent.drone.id
    );
    return result ? result.path : null;
  }
}

/**
 * One leg's constraint-tree search. Agents with no path even without inter-agent constraints
 * are split off as `failedAgents`; the rest are solved jointly.
 */
class LegSearch {
  public failedAgents: CBSAgent[] = [];
  public plannedAgents: CBSAgent[];
  private readonly lowLevelDeadline = performance.now() + PATHFINDER_TIMEOUT_MS;

  constructor(
    private readonly planner: CBSPlanner,
    agents: CBSAgent[],
    private readonly world: World,
    private readonly base: SpaceTimeReservations,
    private readonly maxAltitude: number,
    private readonly options: CBSOptions,
    private readonly isExempt: ExemptCellPredicate
  ) {
    this.plannedAgents = agents;
  }

  /** Returns conflict-free plans for `plannedAgents`, or null if the budget ran out. */
  public run(): PlanSet | null {
    const root = this.buildRoot();
    if (!root) return null;

    const open = new MinHeap<ConstraintTreeNode>((a, b) => a.cost - b.cost);
    open.push(root);
    const budgetEnd = performance.now() + this.options.timeBudgetMs;

    for (let expanded = 0; open.size > 0; expanded++) {
      if (expanded >= this.options.maxExpansions || performance.now() > budgetEnd) return null;

      const node = open.pop()!;
      const conflict = ConflictDetector.findFirst(this.plannedAgents, node.plans, this.isExempt);
      if (!conflict) return node.plans;

      for (const constraint of ConflictDetector.constraintsFor(conflict)) {
        const child = this.branch(node, constraint);
        if (child) open.push(child);
      }
    }
    return null; // no conflict-free solution within the leg horizon
  }

  /** Plans every agent alone. Agents without any path are moved to `failedAgents`. */
  private buildRoot(): ConstraintTreeNode | null {
    const plans: PlanSet = new Map();
    const planned: CBSAgent[] = [];

    for (const agent of this.plannedAgents) {
      const path = this.planAgent(agent, []);
      if (path) {
        plans.set(agent.drone.id, path);
        planned.push(agent);
      } else {
        this.failedAgents.push(agent);
      }
    }

    this.plannedAgents = planned;
    if (planned.length === 0) return null;
    return { constraints: [], plans, cost: this.costOf(plans) };
  }

  /** Child node with one extra constraint; only the constrained agent is re-planned. */
  private branch(parent: ConstraintTreeNode, constraint: Constraint): ConstraintTreeNode | null {
    const agent = this.plannedAgents.find(a => a.drone.id === constraint.agentId)!;
    const constraints = [...parent.constraints, constraint];
    const path = this.planAgent(agent, constraints);
    if (!path) return null;

    const plans: PlanSet = new Map(parent.plans);
    plans.set(agent.drone.id, path);
    return { constraints, plans, cost: this.costOf(plans) };
  }

  private planAgent(agent: CBSAgent, constraints: Constraint[]): Position3D[] | null {
    return this.planner.planAgent(
      agent, constraints, this.world, this.base, this.maxAltitude, this.lowLevelDeadline, this.isExempt
    );
  }

  private costOf(plans: PlanSet): number {
    let cost = 0;
    plans.forEach(path => { cost += path.length - 1; });
    return cost;
  }
}
