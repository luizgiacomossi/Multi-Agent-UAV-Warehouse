import {
  ISLMClient,
  SLMConfig,
  ChatMessage,
  OpenAITool,
  ToolCall
} from './SLMService.types';
import { LMStudioClient } from './LMStudioClient';
import { SimulationToolRegistry, SimulationContext } from './SimulationToolRegistry';

export interface AssistantProcessResult {
  text: string;
  toolsExecuted: { name: string; args: any; result: any }[];
  usedLocalFallback?: boolean;
}

const SYSTEM_PROMPT = `You are NexTArc Operator AI, an intelligent autonomous assistant controlling and monitoring a multi-drone warehouse inspection swarm (NexTArc Project, Use Case 2).

You have access to real-time simulation tools to inspect tasks, drones, incidents, and control simulation execution.
Whenever the operator asks a question or gives an order:
1. ALWAYS use the provided tools to fetch actual ground-truth simulation data (e.g. get_task_statistics, get_tasks, get_fleet_summary, get_drone_details) before answering.
2. Provide concise, professional, operator-ready answers.
3. ALWAYS respond strictly in English. Never use any other language.
4. Keep answers brief and factual.`;

/**
 * Orchestrates operator speech/text interpretation via LM Studio SLM and Tool Registry.
 */
export class OperatorAssistant {
  private client: ISLMClient;
  private registry: SimulationToolRegistry;
  private context: SimulationContext;
  private config: SLMConfig;

  constructor(
    context: SimulationContext,
    client?: ISLMClient,
    config?: Partial<SLMConfig>
  ) {
    this.client = client || new LMStudioClient();
    this.context = context;
    this.registry = new SimulationToolRegistry(context);
    this.config = {
      baseUrl: config?.baseUrl || 'http://localhost:1234/v1',
      modelName: config?.modelName || 'local-model',
      temperature: config?.temperature ?? 0.2
    };
  }

  public updateContext(context: SimulationContext) {
    this.context = context;
    this.registry.updateContext(context);
  }

  private buildSystemPrompt(): string {
    const agents = this.context.getAgents();
    const droneList = agents.map((a) => `${a.id}: "${a.name}"`).join(', ');
    const algos = this.context.getAvailableAlgorithms ? this.context.getAvailableAlgorithms().join(', ') : 'Cooperative, Energy Saver, Independent';
    const tick = this.context.getCurrentTick();
    const maxTicks = this.context.getMaxTicks ? this.context.getMaxTicks() : 0;
    const palletCount = this.context.getPallets().length;

    return `${SYSTEM_PROMPT}

CURRENT SIMULATION STATE:
• Fleet: ${agents.length} drones [${droneList || 'None'}]
• Warehouse Pallets: ${palletCount} items
• Current Step: Tick ${tick}/${maxTicks} (${this.context.isPlaying ? 'PLAYING' : 'PAUSED'})
• Supported Algorithms: [${algos}]

When the operator specifies a drone (e.g. "Agent 1" or "D0"), map to its exact ID. Always call tools to get live data or trigger actions. Always respond in English.`;
  }

  public setConfig(config: Partial<SLMConfig>) {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): SLMConfig {
    return { ...this.config };
  }

  public async isAvailable(): Promise<boolean> {
    return this.client.isAvailable(this.config.baseUrl);
  }

  public async listModels(): Promise<string[]> {
    if (this.client.listModels) {
      return this.client.listModels(this.config.baseUrl);
    }
    return [];
  }

  /**
   * Process an operator command or query through LM Studio with Tool Calling.
   */
  public async processCommand(userQuery: string): Promise<AssistantProcessResult> {
    const trimmed = userQuery.trim();
    if (!trimmed) {
      return { text: 'No command provided.', toolsExecuted: [] };
    }

    const tools: OpenAITool[] = this.registry.getToolDefinitions();
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: trimmed }
    ];

    const toolsExecuted: { name: string; args: any; result: any }[] = [];

    try {
      // 1. First SLM Turn
      const firstTurn = await this.client.chatWithTools(messages, tools, this.config);
      messages.push(firstTurn.message);

      // 2. Check if SLM requested tool execution
      if (firstTurn.message.tool_calls && firstTurn.message.tool_calls.length > 0) {
        for (const toolCall of firstTurn.message.tool_calls) {
          const fnName = toolCall.function.name;
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
          } catch (_) {
            parsedArgs = {};
          }

          const result = await this.registry.executeTool(fnName, parsedArgs);
          toolsExecuted.push({ name: fnName, args: parsedArgs, result });

          messages.push({
            role: 'tool',
            name: fnName,
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        // 3. Second SLM Turn: generate final synthesis with tool results
        const secondTurn = await this.client.chatWithTools(messages, tools, this.config);
        const finalContent = secondTurn.message.content || 'Command executed successfully.';

        return {
          text: finalContent,
          toolsExecuted
        };
      }

      // If no tool call was needed, return message content directly
      return {
        text: firstTurn.message.content || 'Command received.',
        toolsExecuted
      };
    } catch (err: any) {
      console.warn('[OperatorAssistant] LM Studio error / fallback:', err);
      // Fallback: If LM Studio is not reachable, perform smart local rule-based tool dispatch
      return this.handleLocalFallback(trimmed);
    }
  }

  /**
   * Resilient local heuristic fallback when LM Studio local server is offline.
   * Ensures the operator still gets live simulation tool answers without breaking.
   */
  private async handleLocalFallback(query: string): Promise<AssistantProcessResult> {
    const q = query.toLowerCase();
    const toolsExecuted: { name: string; args: any; result: any }[] = [];

    // 1. Task Statistics
    if (q.includes('task') && (q.includes('statistic') || q.includes('progress') || q.includes('how many') || q.includes('count') || q.includes('status'))) {
      const stats = await this.registry.executeTool('get_task_statistics', {});
      toolsExecuted.push({ name: 'get_task_statistics', args: {}, result: stats });

      const text = `📊 **Task Statistics:**\nTotal: ${stats.totalTasks} pallets | Completed: ${stats.completedCount} (${stats.completionRatePct}%) | In Progress: ${stats.inProgressCount} | Pending: ${stats.pendingCount}.`;
      return { text, toolsExecuted, usedLocalFallback: true };
    }

    // 2. Pending Tasks
    if (q.includes('pending') || q.includes('remaining') || q.includes('not finished') || q.includes('unfinished') || q.includes('left')) {
      const tasks = await this.registry.executeTool('get_tasks', { status: 'pending', limit: 10 });
      toolsExecuted.push({ name: 'get_tasks', args: { status: 'pending' }, result: tasks });

      const count = tasks.totalMatchingTasks;
      const list = tasks.tasks.slice(0, 5).map((t: any) => `• ${t.palletId} (${t.requiredSensor})`).join('\n');
      const text = `📋 **Pending Tasks (${count} remaining):**\n${list}${count > 5 ? `\n... and ${count - 5} more pallets.` : ''}`;
      return { text, toolsExecuted, usedLocalFallback: true };
    }

    // 3. In-Progress Tasks
    if (q.includes('in progress') || q.includes('ongoing') || q.includes('active') || q.includes('flying')) {
      const tasks = await this.registry.executeTool('get_tasks', { status: 'in_progress' });
      toolsExecuted.push({ name: 'get_tasks', args: { status: 'in_progress' }, result: tasks });

      if (tasks.tasks.length === 0) {
        return {
          text: 'No tasks currently in progress (drones are idle or simulation is paused).',
          toolsExecuted,
          usedLocalFallback: true
        };
      }

      const list = tasks.tasks.map((t: any) => `• ${t.palletId} inspected by ${t.assignedDrone?.name || 'Drone'}`).join('\n');
      const text = `⚡ **Tasks in Progress (${tasks.tasks.length}):**\n${list}`;
      return { text, toolsExecuted, usedLocalFallback: true };
    }

    // 4. Completed Tasks
    if (q.includes('completed') || q.includes('finished') || q.includes('done') || q.includes('scanned')) {
      const tasks = await this.registry.executeTool('get_tasks', { status: 'completed' });
      toolsExecuted.push({ name: 'get_tasks', args: { status: 'completed' }, result: tasks });

      const text = `✅ **Completed Tasks:** ${tasks.totalMatchingTasks} pallets inspected.`;
      return { text, toolsExecuted, usedLocalFallback: true };
    }

    // 5. Fleet / Drone Status
    if (q.includes('drone') || q.includes('fleet') || q.includes('battery') || q.includes('how many drones')) {
      const fleet = await this.registry.executeTool('get_fleet_summary', {});
      toolsExecuted.push({ name: 'get_fleet_summary', args: {}, result: fleet });

      const text = `🚁 **Fleet Status (${fleet.totalDrones} drones):**\n• Flying: ${fleet.statusCounts.flying} | Base (Idle): ${fleet.statusCounts.idle} | Charging: ${fleet.statusCounts.charging} | Stranded: ${fleet.statusCounts.stranded}\n• Average Battery: ${fleet.averageBatteryPct}%\n${fleet.lowBatteryAlerts.length > 0 ? `⚠️ Alerts: ${fleet.lowBatteryAlerts.join(', ')}` : '✅ All drones operating within safe battery thresholds.'}`;
      return { text, toolsExecuted, usedLocalFallback: true };
    }

    // 6. Playback controls & Emergency Stop
    if (q.includes('emergency') || q.includes('abort') || q.includes('halt')) {
      const res = await this.registry.executeTool('emergency_stop', {});
      toolsExecuted.push({ name: 'emergency_stop', args: {}, result: res });
      return { text: '🚨 **EMERGENCY STOP TRIGGERED:** Simulation paused and all drones held.', toolsExecuted, usedLocalFallback: true };
    }

    if (q.includes('reset') || q.includes('restart') || q.includes('rewind')) {
      const res = await this.registry.executeTool('control_playback', { action: 'reset' });
      toolsExecuted.push({ name: 'control_playback', args: { action: 'reset' }, result: res });
      return { text: '🔄 Simulation reset to tick 0.', toolsExecuted, usedLocalFallback: true };
    }

    if (q.includes('pause') || q.includes('stop')) {
      const res = await this.registry.executeTool('control_playback', { action: 'pause' });
      toolsExecuted.push({ name: 'control_playback', args: { action: 'pause' }, result: res });
      return { text: '⏸️ Simulation paused.', toolsExecuted, usedLocalFallback: true };
    }

    if (q.includes('resume') || q.includes('play') || q.includes('start') || q.includes('continue')) {
      const res = await this.registry.executeTool('control_playback', { action: 'play' });
      toolsExecuted.push({ name: 'control_playback', args: { action: 'play' }, result: res });
      return { text: '▶️ Simulation running.', toolsExecuted, usedLocalFallback: true };
    }

    // 7. Jump to Tick
    const tickMatch = q.match(/tick\s*(\d+)/i) || q.match(/jump\s*(?:to\s*)?(\d+)/i);
    if (tickMatch) {
      const targetTick = parseInt(tickMatch[1], 10);
      const res = await this.registry.executeTool('jump_to_tick', { tick: targetTick });
      toolsExecuted.push({ name: 'jump_to_tick', args: { tick: targetTick }, result: res });
      return { text: `⏩ ${res.message || `Simulation advanced to tick ${targetTick}.`}`, toolsExecuted, usedLocalFallback: true };
    }

    // 8. Generate New Missions
    if (q.includes('new mission') || q.includes('generate mission') || q.includes('replan')) {
      const res = await this.registry.executeTool('generate_new_missions', {});
      toolsExecuted.push({ name: 'generate_new_missions', args: {}, result: res });
      return { text: '📦 **New Missions Generated:** Inspection paths and pallet allocations recalculated.', toolsExecuted, usedLocalFallback: true };
    }

    // 9. Change Algorithm
    if (q.includes('algorithm')) {
      let targetAlgo = 'Cooperative';
      if (q.includes('energy') || q.includes('saver')) targetAlgo = 'Energy Saver';
      else if (q.includes('independent')) targetAlgo = 'Independent';
      else if (q.includes('cbs')) targetAlgo = 'Enhanced CBS';
      else if (q.includes('priority')) targetAlgo = 'Priority-Based';

      const res = await this.registry.executeTool('change_algorithm', { algorithm: targetAlgo });
      toolsExecuted.push({ name: 'change_algorithm', args: { algorithm: targetAlgo }, result: res });
      return { text: `🧠 **Algorithm Changed:** ${res.message}`, toolsExecuted, usedLocalFallback: true };
    }

    // 10. Camera Zoom & Drone Focus
    if (q.includes('zoom') || q.includes('camera') || q.includes('focus') || q.includes('look at') || q.includes('track')) {
      const droneMatch = q.match(/d(\d+)/i) || q.match(/agent\s*(\d+)/i) || q.match(/drone\s*(\d+)/i);
      if (droneMatch) {
        const droneId = droneMatch[0].toUpperCase().startsWith('D')
          ? droneMatch[0].toUpperCase()
          : `D${Math.max(0, parseInt(droneMatch[1], 10) - 1)}`;
        const res = await this.registry.executeTool('control_camera', { action: 'focus_drone', droneId });
        toolsExecuted.push({ name: 'control_camera', args: { action: 'focus_drone', droneId }, result: res });
        return { text: `🎥 ${res.message || `Focused camera on ${droneId}.`}`, toolsExecuted, usedLocalFallback: true };
      }

      if (q.includes('out') || q.includes('back')) {
        const res = await this.registry.executeTool('control_camera', { action: 'zoom_out' });
        toolsExecuted.push({ name: 'control_camera', args: { action: 'zoom_out' }, result: res });
        return { text: '🔍 Camera zoomed out.', toolsExecuted, usedLocalFallback: true };
      }

      if (q.includes('reset') || q.includes('overview') || q.includes('default')) {
        const res = await this.registry.executeTool('control_camera', { action: 'reset_overview' });
        toolsExecuted.push({ name: 'control_camera', args: { action: 'reset_overview' }, result: res });
        return { text: '🌐 Camera reset to global warehouse overview.', toolsExecuted, usedLocalFallback: true };
      }

      // Default zoom in
      const res = await this.registry.executeTool('control_camera', { action: 'zoom_in' });
      toolsExecuted.push({ name: 'control_camera', args: { action: 'zoom_in' }, result: res });
      return { text: '🔎 Camera zoomed in closer.', toolsExecuted, usedLocalFallback: true };
    }

    // Default guidance
    return {
      text: `Acknowledged: "${query}". For full neural reasoning with Function Calling, launch LM Studio on port 1234. You can also ask: "how many tasks remain", "fleet status", "tasks in progress", "pause simulation", etc.`,
      toolsExecuted: [],
      usedLocalFallback: true
    };
  }
}
