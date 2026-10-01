import { Agent, Position3D } from '../types';
import { Drone, ChargingSession } from './Drone';

/** A charging session of one drone, labelled for display. */
export interface ScheduledCharge extends ChargingSession {
  droneId: string;
  droneName: string;
  color: string;
  /** "Base" or "Station n" (1-based, in the order of World.chargeStations). */
  site: string;
  maxBattery: number;
}

export type ChargeStatus = 'upcoming' | 'active' | 'done';

/** Label of a charging site: the base, or the station's 1-based number. */
export function siteLabel(session: ChargingSession, chargeStations: Position3D[]): string {
  if (session.charger === 'base') return 'Base';
  const index = chargeStations.findIndex(s => s.x === session.position.x && s.y === session.position.y && s.z === session.position.z);
  return `Station ${index + 1}`;
}

/**
 * Every charging session of the fleet, in time order. Paths are planned before playback, so the
 * schedule is known in full: sessions later than the current tick are upcoming.
 */
export function buildChargingSchedule(agents: Agent[], chargeStations: Position3D[], batteryEnabled: boolean): ScheduledCharge[] {
  const schedule: ScheduledCharge[] = [];
  for (const agent of agents) {
    if (!(agent instanceof Drone)) continue;
    for (const session of agent.chargingSessions(chargeStations, batteryEnabled)) {
      schedule.push({
        ...session,
        droneId: agent.id,
        droneName: agent.name,
        color: agent.color,
        site: siteLabel(session, chargeStations),
        maxBattery: agent.maxBattery,
      });
    }
  }
  return schedule.sort((a, b) => a.startTick - b.startTick || a.droneName.localeCompare(b.droneName));
}

export function chargeStatusAt(session: ChargingSession, tick: number): ChargeStatus {
  if (tick > session.endTick) return 'done';
  if (tick >= session.startTick) return 'active';
  return 'upcoming';
}
