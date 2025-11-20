import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Activity, ShieldAlert, Skull, Zap, Package, TrendingUp, Navigation, Truck, Undo2 } from 'lucide-react';
import { Agent, CollisionEvent } from '../types';

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
    
    agents.forEach(agent => {
        if (agent.status === 'blocked' || agent.path.length <= 1) {
            blocked++;
            return;
        }

        const limit = agent.destructionTime ?? agent.path.length - 1;
        
        // Calculate distance flown so far based on current tick
        const effectiveTick = Math.min(tick, limit);
        distance += Math.max(0, effectiveTick);

        // Check current state relative to tick
        const isDestroyedNow = agent.destructionTime !== undefined && tick >= agent.destructionTime;
        
        const deliveryTime = agent.deliveryTime ?? agent.path.length - 1;
        const hasDelivered = tick >= deliveryTime;

        if (isDestroyedNow) {
            destroyed++;
        } else if (hasDelivered) {
            delivered++;
        } else {
            active++;
        }
    });

    return { active, delivered, destroyed, distance, blocked };
  }, [agents, tick]);

  const completionPct = agents.length > 0 ? Math.round((stats.delivered / agents.length) * 100) : 0;

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

        {/* Distance */}
        <div className="bg-slate-800/60 p-2 rounded border border-slate-700/50 flex flex-col relative overflow-hidden">
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <TrendingUp size={10} /> Range
           </div>
           <div className="text-xl font-mono text-emerald-400 font-semibold relative z-10">
              {stats.distance} <span className="text-xs text-slate-600">m</span>
           </div>
           <Zap className="absolute -right-2 -bottom-2 text-emerald-500/10" size={48} />
        </div>

        {/* Completion */}
        <div className="bg-slate-800/60 p-2 rounded border border-slate-700/50 flex flex-col relative overflow-hidden">
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Package size={10} /> Delivered
           </div>
           <div className="text-xl font-mono text-purple-400 font-semibold relative z-10 flex items-end gap-2">
              {completionPct}% 
              <span className="text-xs text-slate-500 mb-1 font-normal">{stats.delivered} Pkgs</span>
           </div>
           {/* Progress Bar */}
           <div className="w-full h-1 bg-slate-700/50 mt-2 rounded-full overflow-hidden">
             <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${completionPct}%` }} />
           </div>
        </div>

        {/* Casualties */}
        <div className={`bg-slate-800/60 p-2 rounded border flex flex-col relative overflow-hidden transition-colors ${stats.destroyed > 0 ? 'border-red-900/50 bg-red-950/10' : 'border-slate-700/50'}`}>
           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase mb-1">
              <Skull size={10} className={stats.destroyed > 0 ? "text-red-400" : ""} /> Lost Units
           </div>
           <div className={`text-xl font-mono font-semibold relative z-10 ${stats.destroyed > 0 ? 'text-red-500' : 'text-slate-500'}`}>
              {stats.destroyed}
           </div>
           {stats.destroyed > 0 && (
                <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
           )}
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
          const deliveryTime = agent.deliveryTime ?? agent.path.length - 1;
          const finishTime = agent.path.length - 1;
          
          const isDestroyed = agent.status === 'destroyed' && (agent.destructionTime !== undefined && tick >= agent.destructionTime);
          const isBlocked = (agent.path.length <= 1 || agent.status === 'blocked') && !isDestroyed;
          
          // Delivery Status
          const hasDelivered = !isDestroyed && !isBlocked && tick >= deliveryTime;
          
          // Mission Status (Round Trip Complete)
          const isFinished = !isDestroyed && !isBlocked && tick >= finishTime;
          
          // Returning Status (Delivered but not yet Finished)
          const isReturning = hasDelivered && !isFinished;

          // Delivering Status (Moving, Has Package)
          const isDelivering = !isDestroyed && !isBlocked && !hasDelivered && tick < deliveryTime;

          return (
            <div 
              key={agent.id} 
              className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                  isDestroyed ? 'bg-red-900/10 border-red-900/30' : 
                  isFinished ? 'bg-slate-700/30 border-slate-600' :
                  isReturning ? 'bg-purple-900/10 border-purple-900/30' :
                  'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <div 
                  className={`w-1.5 h-1.5 rounded-full ${isDelivering || isReturning ? 'animate-pulse' : ''}`}
                  style={{ 
                    backgroundColor: isDestroyed ? '#ef4444' : agent.color,
                    boxShadow: (isDelivering || isReturning) ? `0 0 8px ${agent.color}` : 'none'
                  }} 
                />
                <div className="flex flex-col">
                  <span className={`text-xs font-medium ${isDestroyed ? 'text-red-400' : 'text-slate-200'}`}>{agent.name}</span>
                </div>
              </div>

              <div className="text-right">
                {isDestroyed && (
                   <span className="flex items-center gap-1 text-[9px] text-red-400 font-bold uppercase">
                        <Skull size={10} /> Crashed
                   </span>
                )}

                {isBlocked && (
                  <span className="flex items-center gap-1 text-[9px] text-amber-400 font-bold uppercase">
                    <AlertTriangle size={10} /> Blocked
                  </span>
                )}
                
                {isFinished && (
                  <span className="flex items-center gap-1 text-[9px] text-slate-400 font-bold uppercase">
                    <CheckCircle2 size={10} /> Complete
                  </span>
                )}

                {isReturning && (
                   <span className="flex items-center gap-1 text-[9px] text-purple-400 font-bold uppercase">
                     <Undo2 size={10} /> Returning
                   </span>
                )}

                {isDelivering && (
                  <span className="flex items-center gap-1 text-[9px] text-blue-400 font-bold uppercase">
                    <Package size={10} /> Delivering
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusPanel;