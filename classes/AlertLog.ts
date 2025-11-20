
import { SimulationIncident } from '../types';

export type AlertStatus = 'active' | 'past' | 'future';

export class AlertLog {
    /**
     * Formats the names of agents involved in a collision for display.
     */
    static formatAgentNames(incident: SimulationIncident): string {
        if (incident.agentNames && incident.agentNames.length > 0) {
            if (incident.type === 'battery_dead') {
                return incident.agentNames[0]; // Usually one agent per battery failure
            }
            return incident.agentNames.join(" & ");
        }
        return "Unknown Agents";
    }

    /**
     * Determines the temporal status of an alert relative to the current tick.
     */
    static getStatus(incident: SimulationIncident, currentTick: number): AlertStatus {
        if (incident.time === currentTick) return 'active';
        if (incident.time < currentTick) return 'past';
        return 'future';
    }

    /**
     * Sorts collisions chronologically.
     */
    static sort(incidents: SimulationIncident[]): SimulationIncident[] {
        return [...incidents].sort((a, b) => a.time - b.time);
    }

    /**
     * Gets a CSS style definition for a specific alert status.
     */
    static getStylesForStatus(status: AlertStatus, type: string): string {
        const isActive = status === 'active';
        const base = 'transition-all border';
        
        if (type === 'battery_dead') {
            if (isActive) return `${base} bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.2)]`;
            if (status === 'past') return `${base} bg-slate-800/50 border-amber-900/30 text-amber-700/70`;
            return `${base} bg-slate-800 border-slate-700 text-slate-500`;
        }

        // Collision
        if (isActive) return `${base} bg-red-500/20 border-red-500/50 text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.2)]`;
        if (status === 'past') return `${base} bg-slate-800/50 border-slate-800 text-slate-600`;
        return `${base} bg-slate-800 border-slate-700 text-slate-400`;
    }
}
