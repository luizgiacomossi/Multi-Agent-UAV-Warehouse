import { Agent, Pallet, Position3D, SimulationIncident } from '../../types';
import { OpenAITool } from './SLMService.types';
import { MATH_CONSTANTS } from '../../SimulationConfig';

export interface SimulationContext {
  getAgents: () => Agent[];
  getPallets: () => Pallet[];
  getCurrentTick: () => number;
  getMaxTicks?: () => number;
  getChargeStations: () => Position3D[];
  getIncidents: () => SimulationIncident[];
  getScannedPalletIds: () => Set<string>;
  getActivePalletIds: () => Set<string>;
  onTogglePlay?: () => void;
  onReset?: () => void;
  onSetTick?: (tick: number) => void;
  onNewMissions?: () => void;
  onChangeAlgorithm?: (algo: string) => void;
  getAvailableAlgorithms?: () => string[];
  onControlCamera?: (action: { mode: 'overview' | 'drone' | 'zoom_in' | 'zoom_out'; droneId?: string }) => void;
  onChangeTheme?: (themeId: string) => void;
  isPlaying?: boolean;
}

/**
 * Registry of executable simulation tools and their OpenAI function calling schemas.
 * Adheres to Single Responsibility Principle (SRP) by decoupling simulation state query logic from LLM transports.
 */
export class SimulationToolRegistry {
  constructor(private context: SimulationContext) {}

  public updateContext(context: SimulationContext) {
    this.context = context;
  }

  /**
   * Returns tool schemas formatted for OpenAI function calling (LM Studio).
   */
  public getToolDefinitions(): OpenAITool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_task_statistics',
          description:
            'Get high-level summary statistics of warehouse inspection tasks: total, completed, in-progress, pending, completion percentage, and breakdown by sensor type (camera vs rfid).',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_tasks',
          description:
            'Retrieve warehouse inspection tasks filtered by status. Allows querying completed tasks, pending tasks, or tasks currently in progress.',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'all'],
                description:
                  'Filter tasks by status. Default is "all". "pending" = not yet inspected; "in_progress" = drone currently en route/scanning; "completed" = successfully scanned.'
              },
              limit: {
                type: 'number',
                description: 'Optional maximum number of tasks to return (default: 20 to avoid large prompt sizes).'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_fleet_summary',
          description:
            'Get fleet overview: total count of drones, counts by operational status (idle, flying, charging, stranded), average battery percentage, lowest battery drone, and low-battery warning alerts.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_drone_details',
          description:
            'Get detailed telemetry, position, current pallet inspection, and payload capabilities of a specific drone by ID or name.',
          parameters: {
            type: 'object',
            properties: {
              droneId: {
                type: 'string',
                description: 'The unique ID or name of the drone (e.g. "D0", "Agent 1").'
              }
            },
            required: ['droneId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_safety_incidents',
          description:
            'Retrieve any recorded simulation incidents (drone-to-drone collisions, forklift collisions, or drones stranded due to battery exhaustion).',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'control_playback',
          description: 'Control simulation execution state: play, pause, or reset.',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['play', 'pause', 'reset'],
                description: 'Action to perform on simulation playback.'
              }
            },
            required: ['action']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'emergency_stop',
          description: 'Instantly pause the simulation and halt active drone flight for safety.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'jump_to_tick',
          description: 'Jump to a specific simulation time step (tick). Useful for rewinding to tick 0 or fast-forwarding to a specific point in time.',
          parameters: {
            type: 'object',
            properties: {
              tick: {
                type: 'number',
                description: 'The target simulation tick number (integer).'
              }
            },
            required: ['tick']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'change_algorithm',
          description: 'Change the multi-agent pathfinding algorithm (e.g. "Cooperative", "Independent", "Energy Saver", "Enhanced CBS") and recalculate drone paths.',
          parameters: {
            type: 'object',
            properties: {
              algorithm: {
                type: 'string',
                description: 'Name of the algorithm to switch to.'
              }
            },
            required: ['algorithm']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_new_missions',
          description: 'Regenerate pallet inspection tasks and plan new multi-drone missions in the warehouse.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'control_camera',
          description:
            'Control the 3D viewport camera: zoom in, zoom out, focus/zoom in on a specific drone, or reset to global overview.',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['zoom_in', 'zoom_out', 'focus_drone', 'reset_overview'],
                description:
                  'Camera action: "zoom_in" to move closer, "zoom_out" to move further away, "focus_drone" to track and zoom in on an agent, or "reset_overview" for global warehouse view.'
              },
              droneId: {
                type: 'string',
                description:
                  'The unique ID or name of the drone to focus on (e.g. "D0", "Agent 1"). Required if action is "focus_drone".'
              }
            },
            required: ['action']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'change_interface_theme',
          description:
            'Change the visual interface color theme and HUD contrast palette. Options include "cyan" (NexTArc Cyan), "amber" (Industrial Amber), "emerald" (Emerald Ops), "violet" (Midnight Violet), "crimson" (Crimson Tactical), and "high-contrast" (OLED High-Contrast).',
          parameters: {
            type: 'object',
            properties: {
              theme: {
                type: 'string',
                enum: ['cyan', 'amber', 'emerald', 'violet', 'crimson', 'high-contrast'],
                description: 'The theme name or ID to apply.'
              }
            },
            required: ['theme']
          }
        }
      }
    ];
  }

  /**
   * Execute a tool call and return JSON-serializable result.
   */
  public async executeTool(name: string, args: Record<string, any> = {}): Promise<any> {
    switch (name) {
      case 'get_task_statistics':
        return this.getTaskStatistics();
      case 'get_tasks':
        return this.getTasks(args.status || 'all', args.limit || 20);
      case 'get_fleet_summary':
        return this.getFleetSummary();
      case 'get_drone_details':
        return this.getDroneDetails(args.droneId);
      case 'get_safety_incidents':
        return this.getSafetyIncidents();
      case 'control_playback':
        return this.controlPlayback(args.action);
      case 'emergency_stop':
        return this.emergencyStop();
      case 'jump_to_tick':
        return this.jumpToTick(args.tick);
      case 'change_algorithm':
        return this.changeAlgorithm(args.algorithm);
      case 'generate_new_missions':
        return this.generateNewMissions();
      case 'control_camera':
        return this.controlCamera(args.action, args.droneId);
      case 'change_interface_theme':
        return this.changeInterfaceTheme(args.theme);
      default:
        return { error: `Tool "${name}" is not implemented.` };
    }
  }

  // --- Tool Implementations ---

  private getTaskStatistics() {
    const pallets = this.context.getPallets();
    const scannedIds = this.context.getScannedPalletIds();
    const activeIds = this.context.getActivePalletIds();

    const total = pallets.length;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;

    const sensorBreakdown = {
      camera: { total: 0, completed: 0, inProgress: 0, pending: 0 },
      rfid: { total: 0, completed: 0, inProgress: 0, pending: 0 }
    };

    pallets.forEach((plt) => {
      const type = plt.payload_type === 'rfid' ? 'rfid' : 'camera';
      sensorBreakdown[type].total++;

      if (scannedIds.has(plt.id)) {
        completed++;
        sensorBreakdown[type].completed++;
      } else if (activeIds.has(plt.id)) {
        inProgress++;
        sensorBreakdown[type].inProgress++;
      } else {
        pending++;
        sensorBreakdown[type].pending++;
      }
    });

    const completionRatePct = total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0;

    return {
      totalTasks: total,
      completedCount: completed,
      inProgressCount: inProgress,
      pendingCount: pending,
      completionRatePct,
      currentSimulationTick: this.context.getCurrentTick(),
      breakdownBySensor: sensorBreakdown
    };
  }

  private getTasks(status: 'pending' | 'in_progress' | 'completed' | 'all', limit: number = 20) {
    const pallets = this.context.getPallets();
    const scannedIds = this.context.getScannedPalletIds();
    const activeIds = this.context.getActivePalletIds();
    const agents = this.context.getAgents();
    const currentTick = this.context.getCurrentTick();

    const taskList = pallets.map((plt) => {
      let taskStatus: 'pending' | 'in_progress' | 'completed' = 'pending';
      if (scannedIds.has(plt.id)) {
        taskStatus = 'completed';
      } else if (activeIds.has(plt.id)) {
        taskStatus = 'in_progress';
      }

      // Find assigned drone if active
      let assignedDrone: { id: string; name: string } | null = null;
      if (taskStatus === 'in_progress') {
        const drone = agents.find((a) => {
          if (a.currentPalletId === plt.id) return true;
          return (a.assignedTasksLog || []).some(
            (t) => t.palletId === plt.id && currentTick >= t.startTick && currentTick <= t.endTick
          );
        });
        if (drone) {
          assignedDrone = { id: drone.id, name: drone.name };
        }
      }

      return {
        palletId: plt.id,
        position: plt.position,
        requiredSensor: plt.payload_type,
        priority: Number((plt.weight / 100).toFixed(2)),
        status: taskStatus,
        assignedDrone
      };
    });

    const filtered = status === 'all' ? taskList : taskList.filter((t) => t.status === status);
    const countTotal = filtered.length;
    const items = filtered.slice(0, limit);

    return {
      filterStatus: status,
      totalMatchingTasks: countTotal,
      showingCount: items.length,
      tasks: items
    };
  }

  private getFleetSummary() {
    const agents = this.context.getAgents();
    const currentTick = this.context.getCurrentTick();

    const statusCounts = {
      idle: 0,
      flying: 0,
      charging: 0,
      stranded: 0
    };

    let totalBattery = 0;
    let lowestBatteryDrone: { name: string; battery: number } | null = null;
    let highestBatteryDrone: { name: string; battery: number } | null = null;
    const lowBatteryAlerts: string[] = [];

    agents.forEach((a) => {
      // Calculate active battery at tick
      let batt = a.battery;
      if (a.path && a.path.length > 0) {
        const step = Math.min(currentTick, a.path.length - 1);
        const flySteps = Math.max(0, step);
        batt = Math.max(0, a.maxBattery - flySteps * MATH_CONSTANTS.BETA_FLY);
      }

      totalBattery += batt;

      const normStatus = a.status ? a.status.toLowerCase() : 'idle';
      if (normStatus in statusCounts) {
        (statusCounts as any)[normStatus]++;
      } else {
        statusCounts.idle++;
      }

      if (!lowestBatteryDrone || batt < lowestBatteryDrone.battery) {
        lowestBatteryDrone = { name: a.name, battery: Math.round(batt) };
      }
      if (!highestBatteryDrone || batt > highestBatteryDrone.battery) {
        highestBatteryDrone = { name: a.name, battery: Math.round(batt) };
      }

      if (batt < MATH_CONSTANTS.DELTA_SAFE) {
        lowBatteryAlerts.push(
          `${a.name} battery is critical: ${Math.round(batt)}% (safety threshold is ${MATH_CONSTANTS.DELTA_SAFE}%)`
        );
      }
    });

    const avgBattery = agents.length > 0 ? Number((totalBattery / agents.length).toFixed(1)) : 0;

    return {
      totalDrones: agents.length,
      statusCounts,
      averageBatteryPct: avgBattery,
      lowestBatteryDrone,
      highestBatteryDrone,
      lowBatteryAlerts,
      currentSimulationTick: currentTick
    };
  }

  private getDroneDetails(droneId: string) {
    const agents = this.context.getAgents();
    const target = agents.find(
      (a) =>
        a.id.toLowerCase() === droneId.toLowerCase() ||
        a.name.toLowerCase() === droneId.toLowerCase()
    );

    if (!target) {
      return { error: `Drone "${droneId}" was not found in the fleet.` };
    }

    const currentTick = this.context.getCurrentTick();
    const pos = (target.path && target.path.length > 0)
      ? target.path[Math.min(currentTick, target.path.length - 1)]
      : target.start;

    return {
      id: target.id,
      name: target.name,
      status: target.status,
      currentPosition: pos,
      battery: Math.round(target.battery),
      maxBattery: target.maxBattery,
      payloadCapabilities: target.payload,
      currentPalletId: target.currentPalletId || null,
      scannedCount: (target.scanLog || []).length
    };
  }

  private getSafetyIncidents() {
    const incidents = this.context.getIncidents();
    const currentTick = this.context.getCurrentTick();

    const occurred = incidents.filter((i) => i.time <= currentTick);

    return {
      totalIncidentsToDate: occurred.length,
      incidents: occurred.map((inc) => ({
        id: inc.id,
        type: inc.type,
        time: inc.time,
        position: inc.position,
        involvedDrones: inc.agentNames
      }))
    };
  }

  private controlPlayback(action: 'play' | 'pause' | 'reset') {
    if (action === 'reset') {
      if (this.context.onReset) this.context.onReset();
      return { success: true, message: 'Simulation reset to tick 0.' };
    }

    const isPlaying = !!this.context.isPlaying;
    if (action === 'play' && !isPlaying && this.context.onTogglePlay) {
      this.context.onTogglePlay();
      return { success: true, message: 'Simulation playback started.' };
    }
    if (action === 'pause' && isPlaying && this.context.onTogglePlay) {
      this.context.onTogglePlay();
      return { success: true, message: 'Simulation playback paused.' };
    }

    return { success: true, message: `Playback is already in state: ${action}` };
  }

  private emergencyStop() {
    if (this.context.isPlaying && this.context.onTogglePlay) {
      this.context.onTogglePlay();
    }
    return {
      success: true,
      message: 'EMERGENCY STOP TRIGGERED: Simulation paused. All active trajectories held.'
    };
  }

  private jumpToTick(targetTick: number) {
    if (typeof targetTick !== 'number' || isNaN(targetTick)) {
      return { success: false, error: 'Invalid tick number specified.' };
    }
    const max = this.context.getMaxTicks ? this.context.getMaxTicks() : 1000;
    const clamped = Math.max(0, Math.min(Math.round(targetTick), max));
    if (this.context.onSetTick) {
      this.context.onSetTick(clamped);
      return { success: true, message: `Simulation timeline scrubbed to tick ${clamped}/${max}.` };
    }
    return { success: false, error: 'Timeline scrub not supported in current context.' };
  }

  private changeAlgorithm(algorithm: string) {
    if (!algorithm) return { success: false, error: 'No algorithm specified.' };
    const available = this.context.getAvailableAlgorithms ? this.context.getAvailableAlgorithms() : [];
    const match = available.find((a) => a.toLowerCase() === algorithm.toLowerCase()) || algorithm;
    if (this.context.onChangeAlgorithm) {
      this.context.onChangeAlgorithm(match);
      return { success: true, message: `Swarm path planning algorithm set to "${match}". Recalculating paths.` };
    }
    return { success: false, error: 'Algorithm switching not supported in current context.' };
  }

  private generateNewMissions() {
    if (this.context.onNewMissions) {
      this.context.onNewMissions();
      return { success: true, message: 'New warehouse inspection missions generated and dispatched.' };
    }
    return { success: false, error: 'Mission generation not supported in current context.' };
  }

  private controlCamera(action: 'zoom_in' | 'zoom_out' | 'focus_drone' | 'reset_overview', droneId?: string) {
    if (!this.context.onControlCamera) {
      return { success: false, error: 'Camera control is not supported in current context.' };
    }

    if (action === 'zoom_in') {
      this.context.onControlCamera({ mode: 'zoom_in' });
      return { success: true, message: 'Camera zoomed in closer.' };
    }
    if (action === 'zoom_out') {
      this.context.onControlCamera({ mode: 'zoom_out' });
      return { success: true, message: 'Camera zoomed out.' };
    }
    if (action === 'reset_overview') {
      this.context.onControlCamera({ mode: 'overview' });
      return { success: true, message: 'Camera reset to global warehouse overview perspective.' };
    }
    if (action === 'focus_drone') {
      const agents = this.context.getAgents();
      const target = droneId
        ? agents.find(
            (a) =>
              a.id.toLowerCase() === droneId.toLowerCase() ||
              a.name.toLowerCase() === droneId.toLowerCase()
          )
        : agents[0];

      if (!target) {
        return { success: false, error: `Drone "${droneId}" not found in current swarm.` };
      }

      this.context.onControlCamera({ mode: 'drone', droneId: target.id });
      return {
        success: true,
        message: `Camera tracking and zoomed onto ${target.name} (${target.id}). Viewport will follow this drone.`
      };
    }

    return { success: false, error: `Unknown camera action: ${action}` };
  }

  private changeInterfaceTheme(themeName: string) {
    if (!themeName) return { success: false, error: 'No theme specified.' };
    const valid = ['cyan', 'amber', 'emerald', 'violet', 'crimson', 'high-contrast'];
    const norm = themeName.toLowerCase().trim();
    const match = valid.find((v) => norm.includes(v)) || 'cyan';
    if (this.context.onChangeTheme) {
      this.context.onChangeTheme(match);
      return { success: true, themeApplied: match, message: `Interface theme set to "${match}".` };
    }
    return { success: false, error: 'Theme switching not supported in current context.' };
  }
}
