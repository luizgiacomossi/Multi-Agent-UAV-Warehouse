import { MATH_CONSTANTS } from '../types';

/** Which charger a drone is waiting on, if any. */
export type ChargerKind = 'base' | 'station';

/** Result of one tick of the battery model. */
export interface BatteryStep {
    battery: number;
    /** True while the battery is actually filling up (below full on a charger). */
    charging: boolean;
}

/**
 * The battery of one drone: capacity, charge rate and drain. Pure arithmetic, no knowledge of
 * paths or the world, so the battery replay, the charger choice and the allocation agree.
 */
export class BatteryModel {
    constructor(
        public readonly capacity: number,
        /** Battery gained per waiting tick on a charger, in % of capacity (Infinity = instant full charge). */
        public readonly chargeRatePercent: number,
        /** Scales battery consumption per move and per hover tick (1 = nominal β_fly / β_hover). */
        public readonly drainMultiplier: number,
    ) {}

    /**
     * One tick: waiting on a charger charges, anything else consumes β_fly (move) or β_hover
     * (wait), scaled by the drain multiplier. With the battery disabled nothing changes.
     */
    step(battery: number, isWaiting: boolean, onCharger: ChargerKind | null, enabled: boolean): BatteryStep {
        if (onCharger) {
            const charging = battery < this.capacity;
            return { battery: enabled ? Math.min(this.capacity, battery + this.chargePerTick()) : battery, charging };
        }
        if (!enabled) return { battery, charging: false };
        const cost = isWaiting ? MATH_CONSTANTS.BETA_HOVER : MATH_CONSTANTS.BETA_FLY;
        return { battery: battery - cost * this.drainMultiplier, charging: false };
    }

    /** Battery gained per waiting tick on a charger. */
    chargePerTick(): number {
        return this.capacity * this.chargeRatePercent / 100;
    }

    /** Waiting ticks on a charger to go from `battery` to a full battery (1 tick when instant). */
    ticksToFullCharge(battery: number): number {
        const deficit = this.capacity - battery;
        if (deficit <= 0) return 0;
        return Math.max(1, Math.ceil(deficit / this.chargePerTick()));
    }

    /** Estimated energy to fly `cells` grid cells (Manhattan distance scaled by path complexity γ). */
    flightEnergy(cells: number): number {
        return cells * MATH_CONSTANTS.BETA_FLY * MATH_CONSTANTS.GAMMA * this.drainMultiplier;
    }
}
