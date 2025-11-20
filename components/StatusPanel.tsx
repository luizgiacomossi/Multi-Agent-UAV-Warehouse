import React from 'react';
import { CheckCircle2, AlertTriangle, Activity, Clock, ShieldAlert } from 'lucide-react';
import { Agent, CollisionEvent } from '../types';

interface StatusPanelProps {
  agents: Agent[];
  collisions: CollisionEvent[];
  tick: number;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ agents, collisions, tick }) => {
  return (
    <div className="absolute top-4 right-4 w-80 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl text-slate-100 flex flex-col gap-4 z-10 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
      
      <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
        <Activity size={14} className="text-blue-400" />
        Mission Telemetry
      </h2>

      {/* Collision Log Section */}
      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
        <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center justify-between">
          <span>PROJECTED RISKS</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${collisions.length > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {collisions.length} DETECTED
          </span>
        </h3>
        
        {collisions.length === 0 ? (
          <div className="text-xs text-slate-500 italic text-center py-2">
            Safe trajectory calculated.
          </div>
        ) : (
          <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
            {collisions.map((col, idx) => {
              const isHappening = col.time === tick;
              const isPast = col.time < tick;
              
              return (
                <div 
                  key={`col-${idx}`} 
                  className={`text-xs p-2 rounded border flex flex-col gap-1 transition-all ${
                    isHappening 
                      ? 'bg-red-500/20 border-red-500/50 text-red-200 animate-pulse' 
                      : isPast 
                        ? 'bg-slate-800 border-slate-700 text-slate-500' 
                        : 'bg-slate-800 border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono flex items-center gap-1">
                      <ShieldAlert size={10} />
                      T+{col.time}
                    </span>
                    <span className="font-mono text-[10px] opacity-70">
                      [{col.position.x}, {col.position.y}, {col.position.z}]
                    </span>
                  </div>
                  <div className="text-[10px] opacity-80 truncate">
                     Conflict: {col.agentIds.length} drones
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <hr className="border-slate-700" />

      {/* Drone List Section */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 mb-2">SWARM STATUS</h3>
        
        {agents.map((agent) => {
          const arrivalTime = agent.path.length > 0 ? agent.path.length - 1 : 0;
          const hasArrived = agent.path.length > 0 && tick >= arrivalTime;
          const isBlocked = agent.path.length === 0 || agent.status === 'blocked';
          const isMoving = !hasArrived && !isBlocked;

          return (
            <div 
              key={agent.id} 
              className="flex items-center justify-between p-2 bg-slate-800 rounded-lg border border-slate-700"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full shadow-[0_0_8px]" 
                  style={{ 
                    backgroundColor: agent.color,
                    boxShadow: `0 0 8px ${agent.color}`
                  }} 
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-200">{agent.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Dest: [{agent.goal.x}, {agent.goal.y}, {agent.goal.z}]
                  </span>
                </div>
              </div>

              <div className="text-right">
                {isBlocked && (
                  <span className="flex items-center gap-1 text-[10px] text-red-400 font-bold bg-red-900/20 px-1.5 py-0.5 rounded border border-red-900/50">
                    <AlertTriangle size={10} /> BLOCKED
                  </span>
                )}
                
                {hasArrived && (
                  <div className="flex flex-col items-end">
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-900/50">
                      <CheckCircle2 size={10} /> ARRIVED
                    </span>
                    <span className="text-[9px] text-emerald-600 font-mono mt-0.5">
                      T+{arrivalTime}
                    </span>
                  </div>
                )}

                {isMoving && (
                  <span className="flex items-center gap-1 text-[10px] text-blue-400 font-bold">
                    <Clock size={10} className="animate-spin-slow" /> MOVING
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