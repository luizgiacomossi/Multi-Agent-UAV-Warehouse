
import React, { useMemo } from 'react';
import { CheckCircle2, Activity, ShieldAlert, Skull, Zap, Package, Navigation, Truck, Undo2, BatteryWarning } from 'lucide-react';
import { Agent, SimulationIncident } from '../types';
import { Metrics } from '../classes/Metrics';
import { AlertLog } from '../classes/AlertLog';

interface StatusPanelProps {
  agents: Agent[];
  incidents: SimulationIncident[];
  tick: number;
  batteryEnabled: boolean;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ agents, incidents, tick, batteryEnabled }) => {

  // Use the new Metrics class to calculate stats
  const stats = useMemo(() => Metrics.calculate(agents, tick, batteryEnabled), [agents, tick, batteryEnabled]);

  return (
    <div className="absolute top-4 right-4 w-80 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl text-slate-100 flex flex-col gap-4 z-10 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
      
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
            <Truck size={14} className="text-cyan-400" />
            Logistics Ops
        </h2>
        <div className="text-[10px] font-mono text-slate-500">
            {agents.length} FLEET
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

        {/* Deliveries */}
        <div className="bg-slate-800/60 p-2 rounded border border-slate-700/50 flex flex-col relative overflow-hidden">
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Package size={10} /> Delivered
           </div>
           <div className="text-xl font-mono text-purple-400 font-semibold relative z-10 flex items-end gap-2">
              {stats.delivered}
              <span className="text-xs text-slate-500 mb-1 font-normal">Pkgs</span>
           </div>
           <div className="w-full h-1 bg-slate-700/50 mt-2 rounded-full overflow-hidden">
             <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: '100%' }} />
           </div>
        </div>

        {/* Lost Units (Combined) */}
        <div className={`bg-slate-800/60 p-2 rounded border flex flex-col relative overflow-hidden transition-colors ${stats.totalLost > 0 ? 'border-red-900/50 bg-red-950/10' : 'border-slate-700/50'}`}>
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Skull size={10} className={stats.totalLost > 0 ? "text-red-400" : ""} /> Lost Units
           </div>
           <div className={`text-xl font-mono font-semibold relative z-10 ${stats.totalLost > 0 ? 'text-red-500' : 'text-slate-500'}`}>
              {stats.totalLost}
              {stats.deadBattery > 0 && <span className="text-xs ml-1 text-amber-500">({stats.deadBattery} fell)</span>}
           </div>
        </div>
      </div>

      {/* Collision Log Section (Using AlertLog Class) */}
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

      {/* Drone List Section */}
      <div className="space-y-1.5">
        <h3 className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Delivery Manifest</h3>
        
        {agents.map((agent) => {
          const finishTime = agent.path.length - 1;
          
          // Re-implementing basic state checks for list display
          const isDestroyed = agent.status === 'destroyed' && (agent.destructionTime !== undefined && tick >= agent.destructionTime);
          let isDeadBattery = false;
          if (agent.status === 'out_of_battery' && tick >= agent.path.length - 1) {
              isDeadBattery = true;
          }
          const isBlocked = (agent.path.length <= 1 || agent.status === 'blocked') && !isDestroyed && !isDeadBattery;
          
          // Logic for current action status
          let statusText = "Idle";
          let statusColor = "text-slate-400";
          let StatusIcon = CheckCircle2;
          
          // Find next delivery timestamp
          let nextDelivery = agent.deliveryTimes?.find(t => t > tick);
          // Count completed deliveries
          const deliveriesDone = agent.deliveryTimes?.filter(t => t <= tick).length || 0;
          
          if (isDestroyed) { statusText = "Crashed"; statusColor = "text-red-400"; StatusIcon = Skull; }
          else if (isDeadBattery) { statusText = "Fell"; statusColor = "text-amber-500"; StatusIcon = BatteryWarning; }
          else if (isBlocked) { statusText = "Blocked"; statusColor = "text-amber-400"; StatusIcon = ShieldAlert; }
          else if (tick >= finishTime) { statusText = "Complete"; statusColor = "text-slate-400"; StatusIcon = CheckCircle2; }
          else if (nextDelivery !== undefined) {
              statusText = `Pkg #${deliveriesDone + 1}`;
              statusColor = "text-blue-400";
              StatusIcon = Package;
          } else if (deliveriesDone > 0) {
              statusText = "Returning";
              statusColor = "text-purple-400";
              StatusIcon = Undo2;
          }

          return (
            <div 
              key={agent.id} 
              className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                  isDestroyed ? 'bg-red-900/10 border-red-900/30' : 
                  isDeadBattery ? 'bg-amber-900/10 border-amber-900/30' :
                  tick >= finishTime ? 'bg-slate-700/30 border-slate-600' :
                  'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <div 
                  className={`w-1.5 h-1.5 rounded-full`}
                  style={{ 
                    backgroundColor: isDestroyed || isDeadBattery ? '#555' : agent.color
                  }} 
                />
                <div className="flex flex-col">
                  <span className={`text-xs font-medium ${isDestroyed ? 'text-red-400' : isDeadBattery ? 'text-amber-500' : 'text-slate-200'}`}>{agent.name}</span>
                </div>
              </div>

              <div className="text-right">
                  <span className={`flex items-center gap-1 text-[9px] ${statusColor} font-bold uppercase`}>
                    <StatusIcon size={10} /> {statusText}
                  </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusPanel;
