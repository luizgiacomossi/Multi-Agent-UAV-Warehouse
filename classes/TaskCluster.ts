import { Task, Position3D, MATH_CONSTANTS } from '../types';

export class TaskCluster {
    public id: string;
    public tasks: Task[];
    public centroid: Position3D;
    public tourSequence: Task[] = [];
    public tourCost: number = 0; // Total battery cost to execute the internal TSP (TSP=Travelinng Salesman Problem)

    constructor(tasks: Task[]) { // Lets start empty and add tasks later
        if (tasks.length === 0) throw new Error("Cluster initialized with no tasks");
        this.id = `cluster-${Math.random().toString(36).slice(2, 10)}`;
        this.tasks = tasks;
        this.centroid = this.calculateCentroid();
        this.calculateTour();
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
     * Executes a Greedy Nearest-Neighbor Traveling Salesman Problem (TSP).
     * Since K_max is intentionally kept small (< 10 for battery),
     * - greedy approach resolves almost instantly inside the cluster.
     */
    private calculateTour() { // Calculate the tour sequence and cost
        const unvisited = [...this.tasks]; // Create a copy of the tasks to not modify the original array

        // Start with the task physically closest to the geometric centroid
        unvisited.sort((a, b) => this.dist(a.target, this.centroid) - this.dist(b.target, this.centroid));

        let current = unvisited.shift()!;
        this.tourSequence.push(current);

        while (unvisited.length > 0) {
            unvisited.sort((a, b) => this.dist(current.target, a.target) - this.dist(current.target, b.target)); // Sort the remaining tasks by distance from the current task
            const next = unvisited.shift()!;

            // Add Kinetic energy cost of moving from Current to Next
            this.tourCost += (this.dist(current.target, next.target) * MATH_CONSTANTS.BETA_FLY);

            // Add structural Hover cost to stop and scan the Next pallet
            this.tourCost += (next.t_hover * MATH_CONSTANTS.BETA_HOVER);

            this.tourSequence.push(next);
            current = next;
        }

        // Add the structural hover cost for the very first task in the list
        this.tourCost += (this.tourSequence[0].t_hover * MATH_CONSTANTS.BETA_HOVER);
    }
}
