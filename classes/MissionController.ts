
import { Position3D, MissionState } from '../types';

export class MissionController {
    public state: MissionState = 'IDLE';
    public warehouseLocation: Position3D;
    public currentGoal: Position3D | null = null;
    public isInfiniteMode: boolean = false;
    public mustReturnToBase: boolean = false;
    public missionsCompleted: number = 0;

    constructor(warehouseLocation: Position3D) {
        this.warehouseLocation = warehouseLocation;
    }

    public configure(isInfinite: boolean, mustReturn: boolean) {
        this.isInfiniteMode = isInfinite;
        this.mustReturnToBase = mustReturn;
    }

    public assignNewMission(goal: Position3D) {
        this.currentGoal = goal;
        this.state = 'OUTBOUND';
    }

    /**
     * Determines the target for the next leg of travel based on current state.
     * Returns null if the drone is finished.
     */
    public getNextTarget(): Position3D | null {
        if (this.state === 'OUTBOUND') {
            return this.currentGoal;
        }
        
        if (this.state === 'RETURNING') {
            return this.warehouseLocation;
        }

        return null;
    }

    /**
     * Called when a leg of the journey is finished.
     * Updates the state machine.
     * Returns true if the drone is ready for a new random mission assignment.
     */
    public completeLeg(): boolean {
        if (this.state === 'OUTBOUND') {
            // Finished delivering
            this.missionsCompleted++;
            
            if (this.mustReturnToBase) {
                this.state = 'RETURNING';
                return false; // Not ready for new mission yet, must return first
            } else {
                // Milk Run logic: If infinite, immediately ready for new mission from current spot
                if (this.isInfiniteMode) {
                    this.state = 'IDLE'; 
                    return true; // Ready for new mission
                } else {
                    this.state = 'COMPLETED';
                    return false;
                }
            }
        } else if (this.state === 'RETURNING') {
            // Returned to base
            if (this.isInfiniteMode) {
                this.state = 'IDLE';
                return true; // Ready for new mission starting from base
            } else {
                this.state = 'COMPLETED';
                return false;
            }
        }

        return false;
    }

    public reset() {
        this.state = 'IDLE';
        this.currentGoal = null;
        this.missionsCompleted = 0;
    }
}
