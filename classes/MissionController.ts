
import { Position3D, MissionState } from '../types';
import { TaskCluster } from './TaskCluster';

export class MissionController {
    public state: MissionState = 'IDLE';
    public warehouseLocation: Position3D;
    public currentGoal: Position3D | null = null;
    public currentPalletId: string | null = null;   // Pallet being scanned
    public currentScanType: string | null = null;   // 'camera' | 'rfid'

    // mTSP Clustering additions
    public currentCluster: TaskCluster | null = null;
    public clusterTaskIndex: number = 0;

    public maxMissions: number = 1;
    public mustReturnToBase: boolean = false;
    public missionsCompleted: number = 0;

    constructor(warehouseLocation: Position3D) {
        this.warehouseLocation = warehouseLocation;
    }

    public configure(maxMissions: number, mustReturn: boolean) {
        this.maxMissions = maxMissions;
        this.mustReturnToBase = mustReturn;
    }

    /**
     * Assign an inventory inspection mission to a specific pallet.
     */
    public assignNewMission(goal: Position3D, palletId?: string, scanType?: string) {
        this.currentCluster = null;
        this.clusterTaskIndex = 0;
        this.currentGoal = goal;
        this.currentPalletId = palletId || null;
        this.currentScanType = scanType || null;
        this.state = 'OUTBOUND'; // outbound: drone is flying to the pallet
    }

    /**
     * Assign a clustered mTSP sequence inspection mission.
     */
    public assignClusterMission(cluster: TaskCluster) {
        this.currentCluster = cluster;
        this.clusterTaskIndex = 0;

        const firstTask = cluster.tourSequence[0]; // first task in the sequence array
        this.currentGoal = firstTask.target;
        this.currentPalletId = firstTask.palletId || null;
        this.currentScanType = firstTask.req_payload;
        this.state = 'OUTBOUND'; // outbound: drone is flying to the pallet
    }

    /**
     * Determines the target for the next leg of travel based on current state.
     * Returns null if the drone is finished.
     */
    public getNextTarget(): Position3D | null {
        if (this.state === 'OUTBOUND') {
            return this.currentGoal;
        }

        if (this.state === 'EXECUTING_TOUR' && this.currentCluster) {
            // Next target is the NEXT task in the clustered sequence array
            const nextTask = this.currentCluster.tourSequence[this.clusterTaskIndex + 1];
            this.currentPalletId = nextTask.palletId || null;
            this.currentScanType = nextTask.req_payload;
            return nextTask.target;
        }

        if (this.state === 'RETURNING') {
            return this.warehouseLocation;
        }

        return null;
    }

    /**
     * Called when a leg of the journey is finished.
     * a leg is defined as a single task completion  
     * a cluster is defined as a single mission dispatch 
     * relation of leg and cluster: a cluster is composed of multiple legs
     */
    public completeLeg(): boolean {

        if (this.state === 'OUTBOUND') {
            if (this.currentCluster && this.currentCluster.tourSequence.length > 1) {
                // Multi-task cluster execution logic
                this.state = 'EXECUTING_TOUR';
                return false;
            } else {
                this.currentCluster = null;
                this.clusterTaskIndex = 0;
                // Baseline 1-to-1 logic (1 leg = 1 mission)
                this.missionsCompleted++;

                if (this.mustReturnToBase) {
                    this.state = 'RETURNING';
                    return false;
                } else {
                    if (this.missionsCompleted < this.maxMissions) {
                        this.state = 'IDLE';
                        return true;
                    } else {
                        this.state = 'COMPLETED';
                        return false;
                    }
                }
            }
        } else if (this.state === 'EXECUTING_TOUR') {
            // Multi-task cluster execution logic
            this.clusterTaskIndex++;

            // Check if we reached the final item in the sequence array
            if (this.clusterTaskIndex >= this.currentCluster!.tourSequence.length - 1) {
                this.currentCluster = null;
                this.clusterTaskIndex = 0;
                this.missionsCompleted++; // The entire cluster counts as 1 "mission leg" completed, or we can count each one. We count the cluster as 1 mission dispatch.
                if (this.mustReturnToBase) {
                    this.state = 'RETURNING';
                    return false;
                } else {
                    if (this.missionsCompleted < this.maxMissions) {
                        this.state = 'IDLE';
                        return true;
                    } else {
                        this.state = 'COMPLETED';
                        return false;
                    }
                }
            } else {
                return false; // Still executing intra-cluster tour
            }
        } else if (this.state === 'RETURNING') {
            // Returned to base
            if (this.missionsCompleted < this.maxMissions) {
                this.state = 'IDLE';
                return true;
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
        this.currentCluster = null;
        this.clusterTaskIndex = 0;
        this.missionsCompleted = 0;
    }
}
