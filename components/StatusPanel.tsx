
import React, { useMemo } from 'react';
import { CheckCircle2, Activity, ShieldAlert, Skull, Zap, Package, Navigation, Truck, Undo2, BatteryWarning } from 'lucide-react';
import { Agent, CollisionEvent, ENERGY_COSTS } from '../types';
import { Drone } from '../classes/Drone';

interface StatusPanelProps {
  agents: Agent[];
  collisions: CollisionEvent[];
  tick: number;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ agents, collisions, tick }) => {

  const stats = useMemo(() => {
    let active = 0;
    let delivered = 0;
    let destroyed = 0;
    let distance = 0;
    let blocked = 0;
    let deadBattery = 0;
    let totalEnergyConsumed = 0;
    
    agents.forEach(agent => {
        let isDeadBattery = false;
        let isDestroyedNow = false;
        let effectiveTick = 0;

        if (agent instanceof Drone) {
            isDestroyedNow = agent.destructionTime !== undefined && tick >= agent.destructionTime;
            
            // Dead Battery check mimics Drone.ts falling logic
            if (agent.status === 'out_of_battery') {
                 // Only count as "Fell" if we are past the point where it ran out
                const pathEnd = agent.path.length - 1;
                if (tick >= pathEnd) isDeadBattery = true;
            }

            // Count Deliveries: check all delivery timestamps against current tick
            if (!isDestroyedNow && !isDeadBattery && agent.deliveryTimes) {
                delivered += agent.deliveryTimes.filter(t => tick >= t).length;
            }

            effectiveTick = Math.min(tick, agent.path.length - 1);
        } else {
            effectiveTick = Math.min(tick, agent.path.length - 1);
        }

        if (agent.status === 'blocked' || agent.path.length <= 1) {
            blocked++;
            return;
        }
        
        distance += Math.max(0, effectiveTick);
        
        // Simple Energy Estimate
        for(let i=1; i<=effectiveTick && i<agent.path.length; i++) {
            const prev = agent.path[i-1];
            const curr = agent.path[i];
            if(prev.x === curr.x && prev.y === curr.y && prev.z === curr.z) totalEnergyConsumed += ENERGY_COSTS.WAIT;
            else totalEnergyConsumed += ENERGY_COSTS.MOVE;
        }

        if (isDestroyedNow) {
            destroyed++;
        } else if (isDeadBattery) {
            deadBattery++;
        } else {
            active++;
        }
    });

    return { active, delivered, destroyed, distance, blocked, deadBattery, totalEnergyConsumed };
  }, [agents, tick]);

  // Completion is harder to define in infinite mode, so we treat it as Active/Total
  const totalLost = stats.destroyed + stats.deadBattery;

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
              {(agents.length > 0 ? (stats.totalEnergyConsumed / agents.length).toFixed(1) : 0)} <span className="text-xs text-slate-600">u</span>
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
        <div className={`bg-slate-800/60 p-2 rounded border flex flex-col relative overflow-hidden transition-colors ${totalLost > 0 ? 'border-red-900/50 bg-red-950/10' : 'border-slate-700/50'}`}>
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Skull size={10} className={totalLost > 0 ? "text-red-400" : ""} /> Lost Units
           </div>
           <div className={`text-xl font-mono font-semibold relative z-10 ${totalLost > 0 ? 'text-red-500' : 'text-slate-500'}`}>
              {totalLost}
              {stats.deadBattery > 0 && <span className="text-xs ml-1 text-amber-500">({stats.deadBattery} fell)</span>}
           </div>
        </div>
      </div>

      {/* Collision Log Section */}
      <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
        <h3 className="text-[10px] font-bold text-slate-500 mb-2 flex items-center justify-between uppercase tracking-wider">
          <span>Alert Log</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${collisions.length > 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
            {collisions.length} INCIDENTS
          </span>
        </h3>
        
        {collisions.length === 0 ? (
          <div className="text-xs text-slate-600 italic text-center py-2">
            Operations nominal.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
            {collisions.map((col, idx) => {
              const isHappening = col.time === tick;
              const isPast = col.time < tick;
              const names = col.agentNames ? col.agentNames.join(" & ") : "Unknown Agents";

              return (
                <div 
                  key={`col-${idx}`} 
                  className={`text-xs p-2 rounded border flex flex-col gap-0.5 transition-all ${
                    isHappening 
                      ? 'bg-red-500/20 border-red-500/50 text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
                      : isPast 
                        ? 'bg-slate-800/50 border-slate-800 text-slate-600' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono flex items-center gap-1 text-[10px] font-bold">
                      <ShieldAlert size={10} />
                      T+{col.time}
                    </span>
                    <span className="font-mono text-[9px] opacity-70">
                      [{col.position.x}, {col.position.y}, {col.position.z}]
                    </span>
                  </div>
                  <div className="text-[10px] opacity-80 truncate">
                      Collision: {names}
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
          
          const isDestroyed = agent.status === 'destroyed' && (agent.destructionTime !== undefined && tick >= agent.destructionTime);
          
          let isDeadBattery = false;
          if (agent.status === 'out_of_battery' && tick >= agent.path.length - 1) {
              isDeadBattery = true;
          }

          const isBlocked = (agent.path.length <= 1 || agent.status === 'blocked') && !isDestroyed && !isDeadBattery;
          
          // Logic for current action
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
