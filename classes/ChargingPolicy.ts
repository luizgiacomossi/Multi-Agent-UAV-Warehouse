import { Position3D, Task } from '../types';
import { Drone } from './Drone';
import { CostModel } from './CostModel';
import { SpaceTimeReservations, spaceTimeKey } from './PathPlanner';
import { MAX_TIMESTEPS } from '../SimulationConfig';
import { positionKey, samePosition, manhattanDistance } from '../utils/Position';

/** A charging site chosen for a drone: its own dock, or a charging station. */
export interface ChargerChoice {
    site: Position3D;
    isStation: boolean;
}

/** What the charger choice needs to know about the current allocation round. */
export interface ChargingRound {
    pBase: Position3D;
    /** Chargers the energy feasibility may count on (none when drones return to the base). */
    feasibilityChargers: Position3D[];
    /** Tasks offered to the drones in this round (the candidate pool). */
    offered: Task[];
    /** Every open pallet as a task. */
    open: Task[];
    /** Committed space-time reservations of every drone. */
    reservations: SpaceTimeReservations;
    /** Last tick any reservation can reach. */
    horizon: number;
}

/** Where the drone's planned path currently ends. */
const lastPosition = (drone: Drone): Position3D | undefined => drone.path[drone.path.length - 1];

export function isAtDock(drone: Drone): boolean {
    const pos = lastPosition(drone);
    return !!pos && samePosition(pos, drone.mission.warehouseLocation);
}

/**
 * Decides where and when drones charge, and owns the station bookings. The base charges any number
 * of drones (each on its own dock); a charging station holds one drone, booked from dispatch until
 * the drone leaves, so drones never queue in the air.
 */
export class ChargingPolicy {
    /** Charging station (by cell) -> the one drone holding it. */
    private bookings = new Map<string, string>();

    /** @param stations the world's charging stations (read on every call, the world can be regenerated) */
    constructor(private readonly stations: () => Position3D[]) {}

    reset() {
        this.bookings.clear();
    }

    isAtStation(drone: Drone): boolean {
        const pos = lastPosition(drone);
        return !!pos && this.stations().some(s => samePosition(s, pos));
    }

    /** Frees stations whose drone has left (it is neither flying there nor standing on it). */
    releaseBookings(drones: Drone[]) {
        for (const [key, droneId] of [...this.bookings.entries()]) {
            const drone = drones.find(d => d.id === droneId);
            const pos = drone && lastPosition(drone);
            const holding = !!drone && (drone.mission.state === 'RECHARGING' || (!!pos && positionKey(pos) === key));
            if (!holding) this.bookings.delete(key);
        }
    }

    /**
     * Idle drones parked on their dock charge to full before the next dispatch. Without it, drones
     * returning below the task threshold were never dispatched again and the fleet ran dry.
     */
    rechargeDocked(drones: Drone[]) {
        drones.forEach(drone => {
            if (drone.battery >= drone.maxBattery || !isAtDock(drone)) return;
            this.chargeInPlace(drone, null);
        });
    }

    /**
     * Charges a drone to full where it stands by appending waiting ticks: one tick with instant
     * charging, otherwise as many as the charge rate needs. On a station (`reservations` given) each
     * tick is reserved for the drone, and charging stops early if another drone already holds the
     * cell. Docks are not reserved: each drone has its own dock and the dock floor is exempt from
     * conflicts (this keeps instant-charging results identical to the original model).
     */
    chargeInPlace(drone: Drone, reservations: SpaceTimeReservations | null) {
        const stations = this.stations();
        const tick = drone.path.length - 1;
        const battery = drone.calculateStateAt(tick, stations, true).battery;
        const pos = drone.path[tick];
        const end = tick + drone.batteryModel.ticksToFullCharge(battery);
        for (let t = tick + 1; t <= end && t < MAX_TIMESTEPS; t++) {
            if (reservations) {
                const key = spaceTimeKey(pos, t);
                if (reservations.isVertexReserved(key, drone.id)) break;
                reservations.addVertex(key, drone.id);
            }
            drone.path.push({ ...pos });
        }
        drone.battery = drone.calculateStateAt(drone.path.length - 1, stations, true).battery;
    }

    /**
     * Sends an idle drone that got no task to a charging station when that is where it should
     * charge (see chooseCharger), and books the station. Returns false when it should not go to a
     * station: the caller then sends it home (its dock is also its charger).
     */
    sendToStation(drone: Drone, round: ChargingRound): boolean {
        const charger = this.chooseCharger(drone, round);
        if (!charger?.isStation) return false;
        drone.mission.assignRecharge(charger.site);
        drone.goal = { ...charger.site };
        this.bookings.set(positionKey(charger.site), drone.id);
        return true;
    }

    /**
     * A station is free for a drone if no other drone holds it now: none is booked on it, and none
     * has reserved its cell from the drone's current tick on. Drones plan at different clocks, so
     * a drone that is behind may otherwise be sent to a station that others already use later in
     * time; it could then never park there to charge, and its legs failed until it gave up.
     */
    private isStationFree(station: Position3D, droneId: string, fromTick: number, round: ChargingRound): boolean {
        if (this.bookings.has(positionKey(station))) return false;
        for (let t = fromTick; t <= round.horizon; t++) {
            const owner = round.reservations.getVertexOwner(spaceTimeKey(station, t));
            if (owner && owner !== droneId) return false;
        }
        return true;
    }

    /**
     * Where an idle drone left without a task should charge, or null if charging would not help.
     * It applies when none of the tasks `offered` in this allocation round is affordable from where
     * it is (the energy check of the allocation). Tasks outside the round's candidate pool do not
     * count: the drone could not have been given them, and it must not fly home instead. Candidates
     * are its dock (one per drone, always free) and the stations no other drone holds (see
     * isStationFree), rated by
     * ready time: travel plus charging to full. A charger is preferred if some `open` task is
     * affordable from it on a full battery, which also lets a fully charged drone stage at a
     * station closer to pallets it cannot reach from where it is. Chargers the drone cannot reach
     * on its battery are skipped.
     */
    chooseCharger(drone: Drone, round: ChargingRound): ChargerChoice | null {
        const { pBase, feasibilityChargers, offered, open } = round;
        const battery = drone.batteryModel;
        const compatible = (task: Task) => drone.payload.includes(task.req_payload);
        const affordableFrom = (pos: Position3D, charge: number) => (task: Task) =>
            CostModel.isAffordable(charge, CostModel.requiredEnergyFrom(pos, task, pBase, feasibilityChargers, drone.drainMultiplier));

        const tasks = open.filter(compatible);
        const from = lastPosition(drone)!;
        const now = drone.path.length - 1;
        const workableHere = offered.some(task => compatible(task) && affordableFrom(from, drone.battery)(task));
        if (tasks.length === 0 || workableHere) return null;

        const candidates: ChargerChoice[] = [
            { site: drone.mission.warehouseLocation, isStation: false },
            ...this.stations()
                .filter(s => this.isStationFree(s, drone.id, now, round))
                .map(site => ({ site, isStation: true })),
        ].filter(c => !samePosition(c.site, from)); // already charged here

        let best: ChargerChoice | null = null;
        let bestRank = [Infinity, Infinity]; // [not useful, ready time]
        for (const candidate of candidates) {
            const travel = manhattanDistance(from, candidate.site);
            const energy = battery.flightEnergy(travel);
            if (energy >= drone.battery) continue;
            const useful = tasks.some(affordableFrom(candidate.site, drone.maxBattery));
            const rank = [useful ? 0 : 1, travel + battery.ticksToFullCharge(drone.battery - energy)];
            if (rank[0] < bestRank[0] || (rank[0] === bestRank[0] && rank[1] < bestRank[1])) {
                best = candidate;
                bestRank = rank;
            }
        }
        // A full battery gains nothing from a charger that does not make any pallet affordable
        if (bestRank[0] === 1 && drone.battery >= drone.maxBattery) return null;
        return best;
    }
}
