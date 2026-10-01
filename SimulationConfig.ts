/**
 * SimulationConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized configuration for the Cooperative Multi-Drone Inventory
 * Inspection Simulation. Every tunable constant used across the cost model,
 * path planner, battery model and world generator lives here.
 *
 * Variable names are intentionally kept consistent with the paper's LaTeX
 * notation so that the code is a direct, executable representation of the
 * mathematical model.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── World / Warehouse Geometry ───────────────────────────────────────────────

/** Default voxel-grid side length (cubed → world is N×N×N). */
export const GRID_SIZE = 12;

/**
 * Upper bound on generated tasks (the "Total Initial Tasks" slider maximum). Themes without
 * fixed pallet slots (everything but Warehouse) use it when every pallet is requested.
 */
export const MAX_TASKS = 200;

// ─── Swarm / Agent Defaults ────────────────────────────────────────────────────

/** Default number of drones spawned in the simulation. */
export const DEFAULT_AGENT_COUNT = 2;

/**
 * Warehouse footprint in voxels [X rows of racks × Z aisles × Y rack height].
 * Used by WorldGenerator to layout the racks and spawn zone.
 */
export const WAREHOUSE = {
  BASE_SIZE: 12,    // footprint side length (voxels)
  RACK_HEIGHT: 1,   // rack column height (voxels)
  AISLE_WIDTH: 2,   // gap between rack rows (voxels)
};

/**
 * $D_{max}$ — Maximum Euclidean distance reachable inside the warehouse.
 * For a 50 × 30 × 10 m physical space this equals Math.sqrt(50²+30²+10²).
 * In voxel space we approximate with the diagonal of the default grid.
 *
 * Equation reference: normalisation denominator of $c_{dist}$.
 *
 * NOTE: currently unused. SimulationManager.runPathfinding passes
 * `world.size * 2`, and the Monte Carlo / fault-tolerance experiments pass
 * `world.size * 1.732` (the grid diagonal of the *current* world size).
 */
export const D_MAX = Math.sqrt(
  GRID_SIZE ** 2 + GRID_SIZE ** 2 + GRID_SIZE ** 2
); // ≈ 41.57 for 24³, or override for 50×30×10 → 59.16


// ─── Battery Model Parameters ─────────────────────────────────────────────────

/**
 * $\beta_{fly}$ — Linear battery consumption rate while moving (% per step).
 *
 * Each voxel traversal in the A* planner costs this many percent of maximum
 * battery capacity. Moving incurs motor propulsion and translational power costs.
 *
 * Equation reference: Eq. 13  $E_{req} = \beta_{fly} \cdot \gamma \cdot d_{Eucl}$
 */
export const BETA_FLY = 0.10;

/**
 * $\beta_{hover}$ — Battery drain per tick while the drone waits/hovers (% per tick).
 *
 * Hovering/waiting consumes less power than active translational flight.
 *
 * Equation reference: Eq. 13 hover term.
 */
export const BETA_HOVER = 0.05;

/**
 * $\gamma$ — Path-complexity factor applied to the straight-line Euclidean
 * distance to obtain a realistic energy estimate given rack-induced detours.
 *
 * A value of 1.3 means that actual traversal paths are on average 30% longer
 * than the straight-line distance due to aisle geometry.
 *
 * Equation reference: Eq. 13  $E_{req} = \beta_{fly} \cdot \gamma \cdot d_{Eucl}$
 */
export const GAMMA = 1.3;

/**
 * $\delta_{safe}$ — Critical battery safety margin (%).
 *
 * A drone is excluded from the feasible set $\mathcal{F}_k$ for any task whose
 * projected energy requirement would leave it with less than this percentage
 * of battery remaining.  Prevents stranding/crash incidents.
 *
 * Equation reference: Eq. 14  $B_i - E_{req,ik} \geq \delta_{safe}$
 */
export const DELTA_SAFE = 20.0;

/**
 * $\lambda$ — Exponential penalty sharpness for the battery cost term $c_{batt}$.
 *
 * Controls how steeply the cost rises as the drone's battery approaches
 * $\delta_{safe}$.  Higher → more aggressive avoidance of low-battery states.
 *
 * At $B_i = \delta_{safe} + 1$: $c_{batt} = e^{-0.15} \approx 0.86$
 * At $B_i = 100\%$:             $c_{batt} = e^{-12.0} \approx 0.00$
 *
 * Equation reference: $c_{batt,i} = e^{-\lambda(B_i - \delta_{safe})}$
 * (see CostModel.calculate_c_batt)
 */
export const LAMBDA_PEN = 0.15;


// ─── Cost Function Weights ────────────────────────────────────────────────────

/**
 * $w_1$ — Weight for the normalised distance cost term.
 *
 * $w_1 + w_2 = 1$ keeps the numerator a convex combination of the two terms;
 * the final cost is not bounded to [0,1] because it is divided by $\pi_k$.
 *
 * Equation reference: $C_{ik} = (w_1 c_{dist,ik} + w_2 c_{batt,i}) / \max(0.01, \pi_k)$
 * (see CostModel.calculate_C_ik)
 */
export const WEIGHT_DIST = 0.5;   // w₁

/**
 * $w_2$ — Weight for the battery degradation cost term.
 *
 * Equation reference: $C_{ik} = (w_1 c_{dist,ik} + w_2 c_{batt,i}) / \max(0.01, \pi_k)$
 */
export const WEIGHT_BATT = 0.5;   // w₂


// ─── Planner / Solver Settings ────────────────────────────────────────────────

/** A* / CBS per-drone search timeout in milliseconds. */
export const PATHFINDER_TIMEOUT_MS = 10_000;

/** Maximum path length (in ticks) before the planner gives up on a leg. */
export const MAX_TIMESTEPS = 10_000;

/** Number of forward simulation cycles in Infinite mode (Out + Return = 2 legs each). */
export const INFINITE_MISSION_CYCLES = 3;

/** Default initial battery capacity for each drone (% units). */
export const DEFAULT_BATTERY = 50;

/**
 * Charging speed at the base and at charging stations, in % of battery capacity per waiting tick.
 * `Infinity` is instant charging: one waiting tick restores a full battery (the original model,
 * kept so earlier results stay comparable).
 */
export const INSTANT_CHARGE_RATE = Infinity;
export const DEFAULT_CHARGE_RATE = 2;

/**
 * Battery drain multiplier: scales the energy a drone uses per move (β_fly) and per hover tick
 * (β_hover). 1 is the nominal drain; 2 empties the battery twice as fast.
 */
export const DEFAULT_DRAIN_MULTIPLIER = 1;

/**
 * Drain multiplier the simulator UI starts with. Higher than nominal so drones need to recharge
 * mid-mission and charging stations come into play; the model and benchmark default stay at 1.
 */
export const SIMULATOR_DRAIN_MULTIPLIER = 3;

/**
 * Charging sites, counting the base: 1 means base only; each extra site is a charging station.
 * The base charges any number of drones at once (one dock per drone); a station holds one drone.
 */
export const MAX_CHARGING_SITES = 5;

/** Default maximum flight altitude (voxel Y ceiling). */
export const DEFAULT_MAX_ALTITUDE = 8;


// ─── Backward-compatible aggregate export (used by legacy imports) ─────────────

/**
 * @deprecated Prefer importing named constants directly from SimulationConfig.
 * Kept for backward compatibility with files that still import MATH_CONSTANTS.
 */
export const MATH_CONSTANTS = {
  BETA_FLY,
  BETA_HOVER,
  GAMMA,
  DELTA_SAFE,
  LAMBDA_PEN,
  W1: WEIGHT_DIST,
  W2: WEIGHT_BATT,
} as const;
