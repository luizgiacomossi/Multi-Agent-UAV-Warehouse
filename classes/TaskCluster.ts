import { Task, Position3D, MATH_CONSTANTS } from '../types';
import { random } from '../utils/Random';

/** Clusters up to this size are ordered exactly (all permutations, 6! = 720); larger ones greedily. */
export const EXACT_TOUR_MAX_TASKS = 6;

/** A visiting order for a cluster's tasks and its internal energy cost. */
export interface TourPlan {
    sequence: Task[];
    cost: number;
}

export class TaskCluster {
    public id: string;
    public tasks: Task[];
    public centroid: Position3D;
    public tourSequence: Task[] = [];
    public tourCost: number = 0; // Battery cost of the tour itself: flight between tasks plus hovering at each

    constructor(tasks: Task[]) {
        if (tasks.length === 0) throw new Error("Cluster initialized with no tasks");
        this.id = `cluster-${random().toString(36).slice(2, 10)}`;
        this.tasks = tasks;
        this.centroid = this.calculateCentroid();
        // Provisional order until a drone is assigned (see orderTourFrom)
        this.orderTourFrom(this.centroid);
    }

    private calculateCentroid(): Position3D { // Calculate the geometric center of the cluster of tasks
        const sum = this.tasks.reduce((acc, task) => ({ // Reduce the tasks to a single point ( centroid)
            x: acc.x + task.target.x,
            y: acc.y + task.target.y,
            z: acc.z + task.target.z
        }), { x: 0, y: 0, z: 0 }); // Start with a point at the origin

        return {
            x: Math.round(sum.x / this.tasks.length),
            y: Math.round(sum.y / this.tasks.length),
            z: Math.round(sum.z / this.tasks.length)
        };
    }

    private dist(p1: Position3D, p2: Position3D): number {
        return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y) + Math.abs(p1.z - p2.z);
    }

    /**
     * Visiting order (a small open TSP) that minimises the flight distance
     * start -> tasks -> end, where `end` is optional. Pure: the cluster is not modified.
     * Exact by enumeration up to EXACT_TOUR_MAX_TASKS, nearest neighbour from `start` beyond.
     */
    public planTour(start: Position3D, end?: Position3D): TourPlan {
        const sequence = this.tasks.length <= EXACT_TOUR_MAX_TASKS
            ? this.exactOrder(start, end)
            : this.nearestNeighbourOrder(start);
        return { sequence, cost: this.internalCost(sequence) };
    }

    /** Fixes the tour for a drone departing from `start` (and heading to `end` afterwards). */
    public orderTourFrom(start: Position3D, end?: Position3D) {
        const plan = this.planTour(start, end);
        this.tourSequence = plan.sequence;
        this.tourCost = plan.cost;
    }

    private routeLength(sequence: Task[], start: Position3D, end?: Position3D): number {
        let length = this.dist(start, sequence[0].target);
        for (let i = 1; i < sequence.length; i++) length += this.dist(sequence[i - 1].target, sequence[i].target);
        if (end) length += this.dist(sequence[sequence.length - 1].target, end);
        return length;
    }

    private exactOrder(start: Position3D, end?: Position3D): Task[] {
        let best = this.tasks;
        let bestLength = Infinity;
        for (const order of permutations(this.tasks)) {
            const length = this.routeLength(order, start, end);
            if (length < bestLength) {
                bestLength = length;
                best = order;
            }
        }
        return best;
    }

    private nearestNeighbourOrder(start: Position3D): Task[] {
        const unvisited = [...this.tasks];
        const sequence: Task[] = [];
        let current = start;
        while (unvisited.length > 0) {
            let nearest = 0;
            for (let i = 1; i < unvisited.length; i++) {
                if (this.dist(current, unvisited[i].target) < this.dist(current, unvisited[nearest].target)) nearest = i;
            }
            const [next] = unvisited.splice(nearest, 1);
            sequence.push(next);
            current = next.target;
        }
        return sequence;
    }

    /** Kinetic cost between consecutive tasks (scaled by path complexity gamma) plus hover cost at every task. */
    private internalCost(sequence: Task[]): number {
        let cost = 0;
        for (let i = 1; i < sequence.length; i++) {
            cost += this.dist(sequence[i - 1].target, sequence[i].target) * MATH_CONSTANTS.BETA_FLY * MATH_CONSTANTS.GAMMA;
        }
        for (const task of sequence) cost += task.t_hover * MATH_CONSTANTS.BETA_HOVER;
        return cost;
    }
}

function* permutations<T>(items: T[]): Generator<T[]> {
    if (items.length <= 1) {
        yield [...items];
        return;
    }
    for (let i = 0; i < items.length; i++) {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const tail of permutations(rest)) yield [items[i], ...tail];
    }
}
