
import React, { useMemo } from 'react';
import { 
  CheckCircle2, Activity, ShieldAlert, Skull, Zap, ScanLine, Navigation, Warehouse, 
  Undo2, BatteryWarning, Camera, Wifi, History, Target, Battery, BatteryCharging, 
  BatteryFull, BatteryMedium, BatteryLow, type LucideIcon
} from 'lucide-react';
import { Agent, SimulationIncident, Pallet, Position3D } from '../types';
import { Drone } from '../classes/Drone';
import { Metrics } from '../classes/Metrics';
import { AlertLog } from '../classes/AlertLog';
import { DroneActivityKind, describeDroneActivity } from '../classes/DroneActivity';
import { buildChargingSchedule, chargeStatusAt, ChargeStatus } from '../classes/ChargingSchedule';
import { BUS_PARTS, totalsByPart } from '../classes/PalletContents';

const CHARGE_STATUS_STYLE: Record<ChargeStatus, { label: string; className: string; order: number }> = {
  active:   { label: 'Charging', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30 animate-pulse', order: 0 },
  upcoming: { label: 'Planned',  className: 'text-sky-300 bg-sky-500/10 border-sky-500/30', order: 1 },
  done:     { label: 'Done',     className: 'text-slate-400 bg-slate-700/30 border-slate-600/40', order: 2 },
};

/** Label, colour and icon for each drone activity in the scan manifest. */
const ACTIVITY_STYLE: Record<DroneActivityKind, { label: string; color: string; icon: LucideIcon }> = {
  crashed:   { label: 'Crashed',    color: 'text-red-400',     icon: Skull },
  depleted:  { label: 'Depleted',   color: 'text-amber-500',   icon: BatteryWarning },
  blocked:   { label: 'Blocked',    color: 'text-amber-400',   icon: ShieldAlert },
  scanning:  { label: 'Scanning',   color: 'text-cyan-400',    icon: ScanLine },
  enRoute:   { label: 'En route',   color: 'text-blue-400',    icon: Navigation },
  returning: { label: 'Returning',  color: 'text-purple-400',  icon: Undo2 },
  toCharger: { label: 'To charger', color: 'text-emerald-300', icon: Zap },
  holding:   { label: 'Holding',    color: 'text-amber-300',   icon: Activity },
  inTransit: { label: 'In transit', color: 'text-blue-300',    icon: Navigation },
  charging:  { label: 'Charging',   color: 'text-emerald-400', icon: BatteryCharging },
  docked:    { label: 'Docked',     color: 'text-slate-400',   icon: Warehouse },
  complete:  { label: 'Complete',   color: 'text-slate-400',   icon: CheckCircle2 },
};

/** Battery as a percentage of the drone's capacity (the battery model works in capacity units). */
const batteryPercent = (agent: Agent, battery: number) =>
  Math.max(0, Math.min(100, agent.maxBattery > 0 ? (battery / agent.maxBattery) * 100 : battery));

interface StatusPanelProps {
  agents: Agent[];
  incidents: SimulationIncident[];
  tick: number;
  batteryEnabled: boolean;
  pallets: Pallet[];
  chargeStations?: Position3D[];
}

const StatusPanel: React.FC<StatusPanelProps> = ({ 
  agents, 
  incidents, 
  tick, 
  batteryEnabled, 
  pallets, 
  chargeStations = [] 
}) => {

  const stats = useMemo(() => Metrics.calculate(agents, tick, batteryEnabled), [agents, tick, batteryEnabled]);

  // Helper to obtain the accurate physical snapshot at the current tick
  const getSnapshot = (agent: Agent) => {
    if (agent instanceof Drone) {
      return agent.getSnapshotAt(tick, chargeStations, batteryEnabled);
    }
    if (typeof (agent as any).getSnapshotAt === 'function') {
      return (agent as any).getSnapshotAt(tick, chargeStations, batteryEnabled);
    }
    return {
      position: (agent.path && agent.path.length > 0) ? agent.path[Math.min(tick, agent.path.length - 1)] : agent.start,
      battery: agent.battery ?? 100,
      isDestroyed: false,
      isDeadBattery: false,
      isRecharging: false,
      hasPackage: true
    };
  };
  
  // Cross-reference agent completion logs with the 3D Pallet array
  const historicalTasks = useMemo(() => {
    const logs: { tick: number; pallet?: Pallet; agent: Agent }[] = [];
    agents.forEach(agent => {
      (agent.scanLog || []).forEach(entry => {
        if (entry.tick <= tick) {
          const pallet = pallets.find(p => p.id === entry.palletId);
          logs.push({ tick: entry.tick, pallet, agent });
        }
      });
    });
    // Sort descending by completion tick to show newest results at the top
    return logs.sort((a, b) => b.tick - a.tick);
  }, [agents, tick, pallets]);

  // Units of each part found so far (contents are known once a pallet has been scanned)
  const foundTotals = useMemo(
    () => totalsByPart(historicalTasks.flatMap(h => h.pallet ? [h.pallet.contents] : [])),
    [historicalTasks]
  );

  const unassignedTasks = useMemo(() => {
    const activeIds = new Set<string>();
    agents.forEach(a => {
        const activeTask = (a.assignedTasksLog || []).find(t => tick >= t.startTick && tick <= t.endTick);
        if (activeTask) activeIds.add(activeTask.palletId);
    });
    const historicalIds = new Set(historicalTasks.map(h => h.pallet?.id).filter(Boolean));
    return pallets.filter(p => !activeIds.has(p.id) && !historicalIds.has(p.id));
  }, [agents, historicalTasks, pallets, tick]);

  // Charging sessions are known in full after planning; only their status depends on the tick
  const chargingSchedule = useMemo(
    () => buildChargingSchedule(agents, chargeStations, batteryEnabled),
    [agents, chargeStations, batteryEnabled]
  );
  const chargingRows = useMemo(() => chargingSchedule
    .map(session => ({ session, status: chargeStatusAt(session, tick) }))
    // Charging now first, then the next ones, then the most recent finished ones
    .sort((a, b) => CHARGE_STATUS_STYLE[a.status].order - CHARGE_STATUS_STYLE[b.status].order ||
      (a.status === 'done' ? b.session.startTick - a.session.startTick : a.session.startTick - b.session.startTick)),
    [chargingSchedule, tick]
  );
  const activeCharges = chargingRows.filter(r => r.status === 'active').length;

  const activeMatrixRows = useMemo(() => {
      const rows: { agent: Agent; taskId: string; position: Position3D; type: string; priority: number; battery: number }[] = [];
      agents.forEach(a => {
          if (a.status === 'STRANDED' || tick >= a.path.length) return;
          const activeTask = (a.assignedTasksLog || []).find(t => tick >= t.startTick && tick <= t.endTick);
          if (activeTask) {
              const snap = getSnapshot(a);
              rows.push({
                  agent: a,
                  taskId: activeTask.palletId,
                  position: activeTask.position,
                  type: activeTask.type,
                  priority: activeTask.priority,
                  battery: batteryPercent(a, snap.battery)
              });
          }
      });
      return rows;
  }, [agents, tick, chargeStations, batteryEnabled]);

  return (
    <div className="absolute top-4 right-4 w-80 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl text-slate-100 flex flex-col gap-4 z-10 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
      
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
            <Warehouse size={14} className="text-cyan-400" />
            Inventory Ops
        </h2>
        <div className="text-[10px] font-mono text-slate-500">
            {agents.length} DRONES
        </div>
      </div>

      {/* Real-time Statistics Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Active Drones */}
        <div className="bg-slate-800/60 p-2 rounded border border-slate-700/50 flex flex-col relative overflow-hidden">
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Navigation size={10} /> In Transit
           </div>
           <div className="text-xl font-mono text-blue-400 font-semibold relative z-10">
              {stats.active}
           </div>
           <Activity className="absolute -right-2 -bottom-2 text-blue-500/10" size={48} />
        </div>

        {/* Energy Usage */}
        <div className="bg-slate-800/60 p-2 rounded border border-slate-700/50 flex flex-col relative overflow-hidden">
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Zap size={10} /> Avg. Energy
           </div>
           <div className="text-xl font-mono text-emerald-400 font-semibold relative z-10">
              {batteryEnabled ? stats.avgEnergy.toFixed(1) : "∞"} <span className="text-xs text-slate-600">u</span>
           </div>
           <Zap className="absolute -right-2 -bottom-2 text-emerald-500/10" size={48} />
        </div>

        {/* Pallets Scanned */}
        <div className="bg-slate-800/60 p-2 rounded border border-slate-700/50 flex flex-col relative overflow-hidden">
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <ScanLine size={10} /> Scanned
           </div>
           <div className="text-xl font-mono text-purple-400 font-semibold relative z-10 flex items-end gap-2">
              {stats.delivered}
              <span className="text-xs text-slate-500 mb-1 font-normal">Pallets</span>
           </div>
           <div className="w-full h-1 bg-slate-700/50 mt-2 rounded-full overflow-hidden">
             <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: '100%' }} />
           </div>
        </div>

        {/* Drones Lost */}
        <div className={`bg-slate-800/60 p-2 rounded border flex flex-col relative overflow-hidden transition-colors ${stats.totalLost > 0 ? 'border-red-900/50 bg-red-950/10' : 'border-slate-700/50'}`}>
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Skull size={10} className={stats.totalLost > 0 ? "text-red-400" : ""} /> Lost Drones
           </div>
           <div className={`text-xl font-mono font-semibold relative z-10 ${stats.totalLost > 0 ? 'text-red-500' : 'text-slate-500'}`}>
              {stats.totalLost}
              {stats.deadBattery > 0 && <span className="text-xs ml-1 text-amber-500">({stats.deadBattery} depleted)</span>}
           </div>
        </div>
      </div>

      {/* Alert Log */}
      <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
        <h3 className="text-[10px] font-bold text-slate-500 mb-2 flex items-center justify-between uppercase tracking-wider">
          <span>Alert Log</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${incidents.length > 0 ? 'bg-slate-800/50 text-slate-300 border-slate-700' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
            {incidents.length} INCIDENTS
          </span>
        </h3>
        
        {incidents.length === 0 ? (
          <div className="text-xs text-slate-600 italic text-center py-2">
            Operations nominal.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
            {AlertLog.sort(incidents).map((inc, idx) => {
              const status = AlertLog.getStatus(inc, tick);
              const styleClass = AlertLog.getStylesForStatus(status, inc.type);
              const formattedNames = AlertLog.formatAgentNames(inc);
              const isBattery = inc.type === 'battery_dead';

              return (
                <div 
                  key={inc.id || `inc-${idx}`} 
                  className={`text-xs p-2 rounded border flex flex-col gap-0.5 transition-all ${styleClass}`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`font-mono flex items-center gap-1 text-[10px] font-bold ${isBattery ? 'text-amber-500' : 'text-red-400'}`}>
                      {isBattery ? <BatteryWarning size={10} /> : <ShieldAlert size={10} />}
                      T+{inc.time}
                    </span>
                    <span className="font-mono text-[9px] opacity-70">
                      [{inc.position.x}, {inc.position.y}, {inc.position.z}]
                    </span>
                  </div>
                  <div className="text-[10px] opacity-80 truncate">
                      {isBattery ? `Battery Depleted: ${formattedNames}` : `Collision: ${formattedNames}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <hr className="border-slate-700/50" />

      {/* Scan Manifest */}
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider flex items-center gap-1.5">
          <ScanLine size={10} /> Scan Manifest
        </h3>
        
        {agents.map((agent) => {
          const finishTime = agent.path.length - 1;
          const snapshot = getSnapshot(agent);
          const currentBattery = batteryPercent(agent, snapshot.battery);
          const isRecharging = snapshot.isRecharging;

          // Per-tick activity from the planned records (agent.status is only the final outcome)
          const dock = agent instanceof Drone ? agent.mission.warehouseLocation : agent.start;
          const activity = describeDroneActivity(agent, tick, dock, snapshot, chargeStations);
          const isDestroyed = activity.kind === 'crashed';
          const isDeadBattery = activity.kind === 'depleted';

          const style = ACTIVITY_STYLE[activity.kind];
          const statusText = activity.kind === 'enRoute' || activity.kind === 'scanning'
            ? `${style.label} #${activity.scanNumber}`
            : style.label;
          const statusColor = style.color;
          const StatusIcon = style.icon;

          const scanType = activity.scanType;
          const palletShortId = activity.palletId ? activity.palletId.slice(-6).toUpperCase() : null;

          const ScanIcon = scanType === 'camera' ? Camera : scanType === 'rfid' ? Wifi : null;

          let BatteryIcon: React.ElementType = BatteryFull;
          let batteryColor = "text-emerald-400";
          let barColor = "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]";

          if (isRecharging) {
            BatteryIcon = BatteryCharging;
            batteryColor = "text-emerald-400 animate-pulse";
            barColor = "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
          } else if (isDestroyed || isDeadBattery || currentBattery <= 0) {
            BatteryIcon = BatteryWarning;
            batteryColor = "text-red-500";
            barColor = "bg-red-500";
          } else if (currentBattery <= 20) {
            BatteryIcon = BatteryLow;
            batteryColor = "text-red-400 font-bold animate-pulse";
            barColor = "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]";
          } else if (currentBattery <= 50) {
            BatteryIcon = BatteryMedium;
            batteryColor = "text-amber-400";
            barColor = "bg-amber-400";
          } else {
            BatteryIcon = BatteryFull;
            batteryColor = "text-emerald-400";
            barColor = "bg-emerald-500";
          }

          return (
            <div 
              key={agent.id} 
              className={`flex flex-col p-2.5 rounded-lg border transition-colors ${
                  isDestroyed ? 'bg-red-900/10 border-red-900/30' : 
                  isDeadBattery ? 'bg-amber-900/10 border-amber-900/30' :
                  tick >= finishTime ? 'bg-slate-700/30 border-slate-600' :
                  'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isDestroyed || isDeadBattery ? '#555' : agent.color }} 
                  />
                  <span className={`text-xs font-semibold ${isDestroyed ? 'text-red-400' : isDeadBattery ? 'text-amber-500' : 'text-slate-200'}`}>
                    {agent.name}
                  </span>
                </div>
                <span className={`flex items-center gap-1 text-[9px] ${statusColor} font-bold uppercase`}>
                  <StatusIcon size={10} /> {statusText}
                </span>
              </div>

              {/* Pallet Inspection Details */}
              {palletShortId && (
                <div className="mt-1.5 ml-3 flex items-center gap-2 text-[9px] text-slate-400 font-mono">
                  {ScanIcon && <ScanIcon size={9} className={scanType === 'camera' ? 'text-blue-400' : 'text-green-400'} />}
                  <span>PLT-{palletShortId}</span>
                  <span className={`uppercase px-1 py-0.5 rounded text-[8px] border ${
                    scanType === 'camera' 
                      ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' 
                      : 'border-green-500/30 text-green-400 bg-green-500/10'
                  }`}>
                    {scanType}
                  </span>
                </div>
              )}

              {/* Individual Drone Battery Telemetry */}
              <div className="mt-2 pt-1.5 border-t border-slate-700/50 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <BatteryIcon size={12} className={batteryColor} />
                    <span className="text-[10px]">Battery</span>
                    {isRecharging && (
                      <span className="text-[8px] text-emerald-400 font-bold uppercase px-1 py-0.2 bg-emerald-500/10 border border-emerald-500/20 rounded animate-pulse">
                        Charging
                      </span>
                    )}
                  </span>
                  <span className={`font-semibold ${batteryColor}`}>
                    {batteryEnabled ? `${currentBattery.toFixed(1)}%` : '∞'}
                  </span>
                </div>
                {batteryEnabled && (
                  <div className="w-full h-1.5 bg-slate-900/60 rounded-full overflow-hidden border border-slate-700/30">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`} 
                      style={{ width: `${currentBattery}%` }} 
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <hr className="border-slate-700/50" />

      {/* Active Assignments Table */}
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider flex items-center gap-1.5">
          <Activity size={10} /> Active Assignments Matrix
        </h3>
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-left text-[9px] text-slate-300">
            <thead className="bg-slate-800 border-b border-slate-700 text-slate-500">
              <tr>
                <th className="p-1.5 font-semibold">TASK ID</th>
                <th className="p-1.5 font-semibold">POSITION</th>
                <th className="p-1.5 font-semibold text-center">BATT</th>
                <th className="p-1.5 font-semibold text-center">PRIORITY</th>
                <th className="p-1.5 font-semibold text-right">AGENT</th>
              </tr>
            </thead>
            <tbody>
              {activeMatrixRows.map((row, idx) => (
                <tr key={`matrix-${row.agent.id}-${row.taskId}-${idx}`} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30">
                  <td className="p-1.5 font-mono text-cyan-400">PLT-{row.taskId.slice(-6).toUpperCase()}</td>
                  <td className="p-1.5 font-mono opacity-80">[{row.position.x}, {row.position.y}, {row.position.z}]</td>
                  <td className="p-1.5 font-mono text-center">
                    <span className={
                      row.battery <= 20 ? 'text-red-400 font-bold' :
                      row.battery <= 50 ? 'text-amber-400' : 'text-emerald-400'
                    }>
                      {batteryEnabled ? `${row.battery.toFixed(0)}%` : "∞"}
                    </span>
                  </td>
                  <td className="p-1.5 font-mono text-emerald-400 text-center">{row.priority ? row.priority.toFixed(2) : "1.00"}</td>
                  <td className="p-1.5 font-medium flex items-center justify-end gap-1.5">
                    {row.agent.name}
                    <div className="w-2 h-2 rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)]" style={{ backgroundColor: row.agent.color }} />
                  </td>
                </tr>
              ))}
              {activeMatrixRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-slate-500 italic font-mono opacity-70">
                    No active targets registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {batteryEnabled && (
        <>
          <hr className="border-slate-700/50" />

          {/* Charging Schedule */}
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5"><BatteryCharging size={10} /> Charging Schedule</span>
              <span className="text-[9px] bg-slate-800 px-1.5 rounded-full border border-slate-700 text-slate-400">
                {activeCharges > 0 ? `${activeCharges} now · ` : ''}{chargingSchedule.length}
              </span>
            </h3>
            <div className="bg-slate-800/60 rounded-lg border border-slate-700 overflow-hidden max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
              <table className="w-full text-left text-[9px] text-slate-300">
                <thead className="bg-slate-800 border-b border-slate-700 text-slate-500 sticky top-0 z-10">
                  <tr>
                    <th className="p-1.5 font-semibold">AGENT</th>
                    <th className="p-1.5 font-semibold">SITE</th>
                    <th className="p-1.5 font-semibold text-center">TICKS</th>
                    <th className="p-1.5 font-semibold text-center">BATT</th>
                    <th className="p-1.5 font-semibold text-right">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {chargingRows.map(({ session, status }) => {
                    const style = CHARGE_STATUS_STYLE[status];
                    const pct = (b: number) => Math.round((b / session.maxBattery) * 100);
                    return (
                      <tr
                        key={`charge-${session.droneId}-${session.startTick}`}
                        className={`border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 ${status === 'done' ? 'opacity-60' : ''}`}
                      >
                        <td className="p-1.5 font-medium">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: session.color }} />
                            {session.droneName}
                          </span>
                        </td>
                        <td className={`p-1.5 ${session.charger === 'station' ? 'text-emerald-300' : 'text-slate-300'}`}>{session.site}</td>
                        <td className="p-1.5 font-mono text-center opacity-80">
                          {session.startTick === session.endTick ? `T+${session.startTick}` : `T+${session.startTick}–${session.endTick}`}
                        </td>
                        <td className="p-1.5 font-mono text-center">
                          <span className="text-amber-400">{pct(session.batteryFrom)}%</span>
                          <span className="text-slate-500"> → </span>
                          <span className="text-emerald-400">{pct(session.batteryTo)}%</span>
                        </td>
                        <td className="p-1.5 text-right">
                          <span className={`px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase ${style.className}`}>{style.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {chargingRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-slate-500 italic font-mono opacity-70">
                        No charging planned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <hr className="border-slate-700/50" />

      {/* Historical Tasks Table */}
      <div className="space-y-1.5 pb-2">
        <h3 className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider flex items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5"><History size={10} /> Completed Scans</span>
          <span className="text-[9px] bg-slate-800 px-1.5 rounded-full border border-slate-700 text-slate-400">{historicalTasks.length}</span>
        </h3>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-mono text-slate-400">
          {Object.entries(BUS_PARTS).map(([id, part]) => (
            <span key={id} className="flex items-center gap-1" title={part.name}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: part.color }} />
              {id} <span className="text-slate-200">{foundTotals[id as keyof typeof foundTotals].toLocaleString('en-US')}</span>
            </span>
          ))}
        </div>
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 overflow-hidden max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
          <table className="w-full text-left text-[9px] text-slate-300">
            <thead className="bg-slate-800 border-b border-slate-700 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="p-1.5 font-semibold">TICK</th>
                <th className="p-1.5 font-semibold">TARGET</th>
                <th className="p-1.5 font-semibold">CONTENTS</th>
                <th className="p-1.5 font-semibold text-right">AGENT</th>
              </tr>
            </thead>
            <tbody>
              {historicalTasks.map((log, idx) => (
                <tr key={`hist-${log.tick}-${log.agent.id}-${idx}`} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30">
                  <td className="p-1.5 font-mono text-slate-400">T+{log.tick}</td>
                  <td className="p-1.5 font-mono text-purple-400">
                    PLT-{log.pallet?.id.slice(-6).toUpperCase() || 'UKN'}
                    {log.pallet && <div className="text-[8px] opacity-60">[{log.pallet.position.x}, {log.pallet.position.y}, {log.pallet.position.z}]</div>}
                  </td>
                  <td className="p-1.5">
                    {log.pallet ? (
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: BUS_PARTS[log.pallet.contents.part].color }} />
                        {BUS_PARTS[log.pallet.contents.part].name}
                        <span className="font-mono text-slate-400">×{log.pallet.contents.quantity}</span>
                      </span>
                    ) : <span className="text-slate-500">?</span>}
                  </td>
                  <td className="p-1.5 font-medium flex items-center justify-end gap-1.5">
                    {log.agent.name}
                    <div className="w-2 h-2 rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)]" style={{ backgroundColor: log.agent.color }} />
                  </td>
                </tr>
              ))}
              {historicalTasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-slate-500 italic font-mono opacity-70">
                    No historic data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <hr className="border-slate-700/50" />

      {/* Unassigned Tasks Table */}
      <div className="space-y-1.5 pb-2">
        <h3 className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider flex items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5"><Target size={10} /> Unassigned Targets</span>
          <span className="text-[9px] bg-slate-800 px-1.5 rounded-full border border-slate-700 text-slate-400">{unassignedTasks.length}</span>
        </h3>
        <div className="bg-slate-800/60 rounded-lg border border-slate-700 overflow-hidden max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
          <table className="w-full text-left text-[9px] text-slate-300">
            <thead className="bg-slate-800 border-b border-slate-700 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="p-1.5 font-semibold">TASK ID</th>
                <th className="p-1.5 font-semibold">POSITION</th>
                <th className="p-1.5 font-semibold text-center">PRIORITY</th>
                <th className="p-1.5 font-semibold text-right">TYPE</th>
              </tr>
            </thead>
            <tbody>
              {unassignedTasks.map((pallet) => (
                <tr key={`un-${pallet.id}`} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30">
                  <td className="p-1.5 font-mono text-amber-400 opacity-80">
                    PLT-{pallet.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="p-1.5 font-mono opacity-60">
                    [{pallet.position.x}, {pallet.position.y}, {pallet.position.z}]
                  </td>
                  <td className="p-1.5 font-mono text-emerald-400 text-center">
                    {(pallet.weight / 100).toFixed(2)}
                  </td>
                  <td className="p-1.5 font-medium flex justify-end">
                    <span className={`uppercase px-1 py-0.5 rounded text-[8px] border ${
                        pallet.payload_type === 'camera' 
                        ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' 
                        : 'border-green-500/30 text-green-400 bg-green-500/10'
                    }`}>
                        {pallet.payload_type}
                    </span>
                  </td>
                </tr>
              ))}
              {unassignedTasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-slate-500 italic font-mono opacity-70">
                    All tasks assigned.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default StatusPanel;
