import { Agent, Task, MATH_CONSTANTS, Position3D } from '../types';
import { TaskCluster } from './TaskCluster';
import Munkres from 'munkres-js';

export class CostModel {
  
  /**
   * Euclidean Distance between two 3D points
   */
  static distanceEuclidean(p1: Position3D, p2: Position3D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  /**
   * Equation 13: Required Energy
   * e_req = \beta_{fly} \gamma (||p_i - p_k|| + ||p_k - p_{base}||) + \beta_{hover} t_{task}
   */
  static calculate_e_req(drone: Agent, task: Task, p_base: Position3D): number {
    const dist_to_task = this.distanceEuclidean(drone.start, task.target); // Initial pos usually represented by .start early on, later we use current location
    const dist_to_base = this.distanceEuclidean(task.target, p_base);
    
    // Convert mathematical constants
    const beta_fly = MATH_CONSTANTS.BETA_FLY;
    const gamma = MATH_CONSTANTS.GAMMA;
    const beta_hover = MATH_CONSTANTS.BETA_HOVER;
    
    return beta_fly * gamma * (dist_to_task + dist_to_base) + (beta_hover * task.t_hover);
  }

  /**
   * Equation 14: Feasibility Set (F_k)
   * Is agent capable of executing the task?
   */
  static is_feasible(drone: Agent, task: Task, e_req: number): boolean {
    // 1. Check Payload capability
    if (!drone.payload.includes(task.req_payload)) {
      return false;
    }
    
    // 2. Check Strict Safety Margin constraint
    if (drone.battery < e_req + MATH_CONSTANTS.DELTA_SAFE) {
      return false;
    }
    
    return true;
  }

  /**
   * Equation 13 (Cluster variant): Calculates Required Energy for an mTSP Tour
   */
  static calculate_e_req_cluster(drone: Agent, cluster: TaskCluster, p_base: Position3D): number {
    const firstTask = cluster.tourSequence[0];
    const lastTask = cluster.tourSequence[cluster.tourSequence.length - 1];
    
    // Fly distance to the start of the tour, and return distance from the end of the tour
    const dist_outbound = this.distanceEuclidean(drone.start, firstTask.target);
    const dist_return = this.distanceEuclidean(lastTask.target, p_base);
    
    // The tourCost already contains the internal kinetic flight and structural hovering
    return MATH_CONSTANTS.BETA_FLY * MATH_CONSTANTS.GAMMA * (dist_outbound + dist_return) + cluster.tourCost;
  }

  /**
   * Equation 14 (Cluster variant): Verifies drone can execute the entire cluster sequentially
   */
  static is_cluster_feasible(drone: Agent, cluster: TaskCluster, e_req: number): boolean {
    // Payload capacity must cover *all* tasks within the cluster
    for (const task of cluster.tasks) {
      if (!drone.payload.includes(task.req_payload)) return false;
    }
    
    // Multi-task flight safety margin
    if (drone.battery < e_req + MATH_CONSTANTS.DELTA_SAFE) return false;
    
    return true;
  }

  /**
   * Equation 16: Distance Cost (Normalized)
   * c_{dist} = ||p_i - p_k|| / D_{max}
   */
  static calculate_c_dist(drone: Agent, task: Task, D_max: number): number {
    const dist = this.distanceEuclidean(drone.start, task.target);
    return dist / D_max;
  }

  /**
   * Equation 17 & 18: Battery Degradation Cost (Exponential Barrier)
   * c_{batt} = e^{-\lambda (b_i(t) - \delta_{safe})}
   */
  static calculate_c_batt(drone: Agent): number {
    const exponent = -MATH_CONSTANTS.LAMBDA_PEN * (drone.battery - MATH_CONSTANTS.DELTA_SAFE);
    return Math.exp(exponent);
  }

  /**
   * Equation 15: Final Cost Score
   * C_ik = (w_1 * c_dist + w_2 * c_batt) * pi_k
   */
  static calculate_C_ik(c_dist: number, c_batt: number, pi_k: number): number {
    return (MATH_CONSTANTS.W1 * c_dist + MATH_CONSTANTS.W2 * c_batt) * pi_k;
  }

  /**
   * Build the Cost Matrix for the Hungarian Algorithm
   * Dimensions: N (Drones) x M (Tasks)
   * Rows = Drones
   * Cols = Tasks
   */
  static buildCostMatrix(drones: Agent[], tasks: Task[], p_base: Position3D, D_max: number): number[][] {
    const OMEGA = 1e9; // 'Infinity' for infeasible assignments
    
    const matrix: number[][] = [];
    
    for (const drone of drones) {
      const row: number[] = [];
      for (const task of tasks) {
        const e_req = this.calculate_e_req(drone, task, p_base);
        
        if (!this.is_feasible(drone, task, e_req)) {
          row.push(OMEGA); // Hard mathematical penalty
        } else {
          const c_dist = this.calculate_c_dist(drone, task, D_max);
          const c_batt = this.calculate_c_batt(drone);
          const C_ik = this.calculate_C_ik(c_dist, c_batt, task.pi_k);
          row.push(C_ik);
        }
      }
      matrix.push(row);
    }
    
    return matrix;
  }
  
  /**
   * Execute Linear Assignment using Munkres (Hungarian)
   */
  static executeOptimalAllocation(drones: Agent[], tasks: Task[], p_base: Position3D, D_max: number): { drone: Agent, task: Task, cost: number }[] {
      // 1. Build N x M matrix
      // Crucial detail: Munkres JS requires N <= M (more columns than rows to assign all rows)
      // If there are more drones than tasks, we need to balance it or pad it. Usually tasks >= drones in MAPF.
      
      const matrix = this.buildCostMatrix(drones, tasks, p_base, D_max);

      if (matrix.length === 0 || matrix[0].length === 0) return [];

      // 2. Solve Matrix - munkres-js natively pads rectangular matrices
      const indices = Munkres(matrix);
      
      const assignments: { drone: Agent, task: Task, cost: number }[] = [];
      
      for (const [r, c] of indices) {
          // If assigned to a dummy task (c >= tasks.length), skip.
          if (c < tasks.length) {
              const assignedCost = matrix[r][c];
              if (assignedCost < 1e8) { // Only assign if feasible (cost < OMEGA)
                  assignments.push({
                      drone: drones[r],
                      task: tasks[c],
                      cost: assignedCost
                  });
              }
          }
      }
      
      return assignments;
  }
  
  /**
   * Executed Linear Assignment for K-D Clusters using Munkres (Hungarian)
   */
  static buildClusterCostMatrix(drones: Agent[], clusters: TaskCluster[], p_base: Position3D, D_max: number): number[][] {
    const OMEGA = 1e9;
    const matrix: number[][] = [];
    
    for (const drone of drones) {
      const row: number[] = [];
      for (const cluster of clusters) {
        const e_req = this.calculate_e_req_cluster(drone, cluster, p_base);
        
        if (!this.is_cluster_feasible(drone, cluster, e_req)) {
          row.push(OMEGA);
        } else {
          // Centroid distance used for Munkres geometrical bidding
          const dist_to_centroid = this.distanceEuclidean(drone.start, cluster.centroid);
          const c_dist = dist_to_centroid / D_max;
          const c_batt = this.calculate_c_batt(drone);
          
          // Averaged Priority
          const avg_pi = cluster.tasks.reduce((sum, t) => sum + t.pi_k, 0) / cluster.tasks.length;
          const C_ik = this.calculate_C_ik(c_dist, c_batt, avg_pi);
          
          row.push(C_ik);
        }
      }
      matrix.push(row);
    }
    return matrix;
  }

  static executeClusterAllocation(drones: Agent[], clusters: TaskCluster[], p_base: Position3D, D_max: number): { drone: Agent, cluster: TaskCluster, cost: number }[] {
      const matrix = this.buildClusterCostMatrix(drones, clusters, p_base, D_max);
      if (matrix.length === 0 || matrix[0].length === 0) return [];
      
      const indices = Munkres(matrix);
      const assignments: { drone: Agent, cluster: TaskCluster, cost: number }[] = [];
      
      for (const [r, c] of indices) {
          if (c < clusters.length) {
              const assignedCost = matrix[r][c];
              if (assignedCost < 1e8) {
                  assignments.push({ drone: drones[r], cluster: clusters[c], cost: assignedCost });
              }
          }
      }
      return assignments;
  }

  /**
   * Run automated tests to verify math formulas
   */
  static runVerification(): void {
      console.log("--- Running Math Verification (CostModel) ---");
      // Create Dummy Drone & Task
      const drone: Agent = {
          id: 'D0',
          name: 'Test Drone',
          color: '#ffffff',
          start: {x: 0, y: 0, z: 0},
          goal: {x: 0, y: 0, z: 0},
          path: [],
          status: 'IDLE',
          battery: 100,
          maxBattery: 100,
          payload: ['camera']
      };
      const task: Task = {
          id: 'T0',
          target: {x: 10, y: 0, z: 0},
          req_payload: 'camera',
          pi_k: 1.0,
          t_hover: 10,
          status: 'PENDING'
      };
      const p_base = {x: 0, y: 0, z: 0};
      
      const e_req = this.calculate_e_req(drone, task, p_base);
      console.log(`Eq 13 e_req: ${e_req.toFixed(2)} (Expected vs Paper Constants)`);
      
      const feasible = this.is_feasible(drone, task, e_req);
      console.log(`Eq 14 feasible: ${feasible}`);
      
      const c_dist = this.calculate_c_dist(drone, task, 100);
      console.log(`Eq 16 c_dist: ${c_dist.toFixed(4)}`);
      
      const c_batt = this.calculate_c_batt(drone);
      console.log(`Eq 17/18 c_batt: ${c_batt.toExponential(4)}`);
      
      const C_ik = this.calculate_C_ik(c_dist, c_batt, task.pi_k);
      console.log(`Eq 15 final C_ik: ${C_ik.toFixed(4)}`);
      console.log("------------------------------------------");
  }
}
