
import React from 'react';
import { Play, Pause, RotateCcw, Box, Grid3X3, Settings, Building2, ShieldCheck, Skull, Shuffle, Cpu, Repeat, Battery, Zap, Infinity as InfinityIcon, ArrowUpToLine, Power } from 'lucide-react';
import { GenerationTheme, TaskPriorityMode } from '../types';

interface ControlPanelProps {
  isPlaying: boolean;
  tick: number;
  maxTicks: number;
  onTogglePlay: () => void;
  onReset: () => void;
  onGenerate: (theme: string) => void;
  onNewMissions: () => void;
  isGenerating: boolean;
  agentCount: number;
  setAgentCount: (n: number) => void;
  gridSizeValue: number;
  setGridSizeValue: (n: number) => void;
  deployFromBase: boolean;
  setDeployFromBase: (b: boolean) => void;
  
  selectedAlgorithm: string;
  setSelectedAlgorithm: (s: string) => void;
  availableAlgorithms: string[];
  currentAlgoDesc: string;

  isRoundTrip: boolean;
  setIsRoundTrip: (b: boolean) => void;

  missionCount: number;
  setMissionCount: (n: number) => void;
  
  batteryCapacity: number;
  setBatteryCapacity: (n: number) => void;
  batteryEnabled: boolean;
  setBatteryEnabled: (b: boolean) => void;
  
  enableCharging: boolean;
  setEnableCharging: (b: boolean) => void;

  maxAltitude: number;
  setMaxAltitude: (n: number) => void;

  allocationMode: '1-to-1' | 'Cluster';
  setAllocationMode: (m: '1-to-1' | 'Cluster') => void;
  clusterRadius: number;
  setClusterRadius: (n: number) => void;
  maxClusterSize: number;
  setMaxClusterSize: (n: number) => void;

  totalTasks: number;
  setTotalTasks: (n: number) => void;
  numForklifts: number;
  setNumForklifts: (n: number) => void;
  taskPriorityMode: TaskPriorityMode;
  setTaskPriorityMode: (mode: TaskPriorityMode) => void;

  onRunMonteCarlo: () => void;
  onRunFaultTolerance: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  isPlaying,
  tick,
  maxTicks,
  onTogglePlay,
  onReset,
  onGenerate,
  onNewMissions,
  isGenerating,
  agentCount,
  setAgentCount,
  gridSizeValue,
  setGridSizeValue,
  deployFromBase,
  setDeployFromBase,
  selectedAlgorithm,
  setSelectedAlgorithm,
  availableAlgorithms,
  currentAlgoDesc,
  isRoundTrip,
  setIsRoundTrip,
  missionCount,
  setMissionCount,
  batteryCapacity,
  setBatteryCapacity,
  batteryEnabled,
  setBatteryEnabled,
  enableCharging,
  setEnableCharging,
  maxAltitude,
  setMaxAltitude,
  allocationMode,
  setAllocationMode,
  clusterRadius,
  setClusterRadius,
  maxClusterSize,
  setMaxClusterSize,
  totalTasks,
  setTotalTasks,
  numForklifts,
  setNumForklifts,
  taskPriorityMode,
  setTaskPriorityMode,
  onRunMonteCarlo,
  onRunFaultTolerance
}) => {
  return (
    <div className="absolute top-4 left-4 w-80 bg-slate-800/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl text-slate-100 flex flex-col gap-4 z-10 max-h-[90vh] overflow-y-auto">
      
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          VoxelSwarm
        </h1>
        <div className="text-xs text-slate-400 font-mono">
          T: {tick} / {maxTicks}
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex gap-2">
        <button
          onClick={onTogglePlay}
          className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg font-semibold transition-all ${
            isPlaying 
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
          }`}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          {isPlaying ? 'Pause' : 'Simulate'}
        </button>
        
        <button
          onClick={onReset}
          className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
          title="Reset Simulation"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 transition-all duration-300 ease-linear"
          style={{ width: maxTicks > 0 ? `${Math.min((tick / maxTicks) * 100, 100)}%` : '0%' }}
        />
      </div>

      <hr className="border-slate-700" />

      {/* Generator Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1 text-sm font-medium text-slate-300">
           <Settings size={14} /> Configuration
        </div>

        {/* Agents Slider */}
        <div className="space-y-1">
             <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Agents</span>
                <span className="font-mono text-cyan-400">{agentCount}</span>
             </div>
             <input 
                type="range" 
                min="2" 
                max="20" 
                step="1"
                value={agentCount} 
                onChange={(e) => setAgentCount(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
             />
        </div>

        {/* Grid Size Slider */}
        <div className="space-y-1">
             <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Grid Size</span>
                <span className="font-mono text-cyan-400">{gridSizeValue}³</span>
             </div>
             <input 
                type="range" 
                min="8" 
                max="40" 
                step="2"
                value={gridSizeValue} 
                onChange={(e) => setGridSizeValue(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
             />
         </div>

         {/* Total Initial Tasks Slider */}
         <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                 <span>Total Initial Tasks (M)</span>
                 <span className="font-mono text-cyan-400">{totalTasks} items</span>
              </div>
              <input 
                 type="range" 
                 min="10" 
                 max="200" 
                 step="5"
                 value={totalTasks} 
                 onChange={(e) => setTotalTasks(Number(e.target.value))}
                 className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
         </div>

         <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs text-slate-400">
                 <ShieldCheck size={12} /> Task Priorities
              </div>
              <div className="flex items-center justify-between bg-slate-900 p-1 rounded-lg border border-slate-700 gap-1">
                  {([
                    { mode: 'uniform', label: 'Same' },
                    { mode: 'mixed', label: 'Mixed' }
                  ] as const).map(({ mode, label }) => {
                    const isSelected = mode === taskPriorityMode;
                    return (
                      <button
                        key={mode}
                        onClick={() => setTaskPriorityMode(mode)}
                        className={`flex-1 py-1.5 text-[10px] rounded-md transition-all font-medium ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-sm border border-emerald-500'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
              </div>
         </div>

         {/* Forklifts Slider */}
         <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                 <span>Number of Forklifts</span>
                 <span className="font-mono text-cyan-400">{numForklifts} units</span>
              </div>
              <input 
                 type="range" 
                 min="0" 
                 max="15" 
                 step="1"
                 value={numForklifts} 
                 onChange={(e) => setNumForklifts(Number(e.target.value))}
                 className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
         </div>

         {/* Missions Count Slider */}
        <div className="space-y-1">
             <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Missions Per Drone</span>
                <span className="font-mono text-cyan-400">{missionCount} runs</span>
             </div>
             <input 
                type="range" 
                min="1" 
                max="20" 
                step="1"
                value={missionCount} 
                onChange={(e) => setMissionCount(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
             />
        </div>

        {/* Max Altitude Slider */}
        <div className="space-y-1">
             <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1"><ArrowUpToLine size={12}/> Flight Ceiling</span>
                <span className="font-mono text-cyan-400">Y={maxAltitude}</span>
             </div>
             <input 
                type="range" 
                min="2" 
                max={gridSizeValue} 
                step="1"
                value={maxAltitude} 
                onChange={(e) => setMaxAltitude(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
             />
        </div>
        
        {/* Battery Controls */}
        <div className="p-2 bg-slate-900/50 rounded border border-slate-700/50 flex flex-col gap-2">
             <div className="flex items-center justify-between">
                 <div className="flex items-center gap-1 text-xs text-slate-300">
                    <Battery size={12} /> Battery Constraints
                 </div>
                 <button 
                    onClick={() => setBatteryEnabled(!batteryEnabled)}
                    className={`w-8 h-4 rounded-full relative transition-colors ${batteryEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                 >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${batteryEnabled ? 'left-4.5' : 'left-0.5'}`} />
                 </button>
             </div>
             
             {batteryEnabled && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>Capacity</span>
                        <span className="font-mono text-emerald-400">{batteryCapacity}</span>
                    </div>
                    <input 
                        type="range" 
                        min="10" 
                        max="200" 
                        step="10"
                        value={batteryCapacity} 
                        onChange={(e) => setBatteryCapacity(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                </div>
             )}
        </div>

        <div className="flex gap-2 flex-wrap">
             {/* Deploy from Base Toggle */}
            <div className="flex-1 min-w-[100px] flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-1.5 rounded transition-colors border border-transparent hover:border-slate-700" onClick={() => setDeployFromBase(!deployFromBase)}>
                <div className={`w-4 h-4 rounded border border-slate-500 flex items-center justify-center ${deployFromBase ? 'bg-cyan-500 border-cyan-500' : 'bg-slate-800'}`}>
                    {deployFromBase && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                </div>
                <span className="text-xs text-slate-300 flex items-center gap-1">
                    <Building2 size={12} />
                    Warehouse
                </span>
            </div>

            {/* Round Trip Toggle */}
            <div className="flex-1 min-w-[100px] flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-1.5 rounded transition-colors border border-transparent hover:border-slate-700" onClick={() => setIsRoundTrip(!isRoundTrip)}>
                <div className={`w-4 h-4 rounded border border-slate-500 flex items-center justify-center ${isRoundTrip ? 'bg-purple-500 border-purple-500' : 'bg-slate-800'}`}>
                    {isRoundTrip && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                </div>
                <span className="text-xs text-slate-300 flex items-center gap-1">
                    <Repeat size={12} />
                    Return
                </span>
            </div>

            {/* Charging Stations Toggle */}
            <div className="flex-1 min-w-[100px] flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-1.5 rounded transition-colors border border-transparent hover:border-slate-700" onClick={() => setEnableCharging(!enableCharging)}>
                <div className={`w-4 h-4 rounded border border-slate-500 flex items-center justify-center ${enableCharging ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-800'}`}>
                    {enableCharging && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                </div>
                <span className="text-xs text-slate-300 flex items-center gap-1">
                    <Zap size={12} />
                    Recharge
                </span>
            </div>
        </div>

        {/* Algorithm Selection */}
        <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs text-slate-400">
                <Cpu size={12} /> Strategy
            </div>
            <div className="flex items-center justify-between bg-slate-900 p-1 rounded-lg border border-slate-700 gap-1">
                {availableAlgorithms.map(algo => {
                    const isSelected = algo === selectedAlgorithm;
                    return (
                        <button 
                            key={algo}
                            onClick={() => setSelectedAlgorithm(algo)}
                            className={`flex-1 py-1.5 text-[10px] rounded-md transition-all font-medium ${
                                isSelected 
                                ? 'bg-slate-700 text-white shadow-sm border border-slate-600' 
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {algo}
                        </button>
                    )
                })}
            </div>
            <div className="text-[10px] text-slate-500 leading-tight px-1">
                {currentAlgoDesc}
            </div>
        </div>
        
        {/* Allocation Mode Selection */}
        <div className="space-y-2 mt-2">
            <div className="flex items-center gap-1 text-xs text-slate-400">
                <Box size={12} /> Task Assignment Mode
            </div>
            <div className="flex items-center justify-between bg-slate-900 p-1 rounded-lg border border-slate-700 gap-1">
                {(['1-to-1', 'Cluster'] as const).map(mode => {
                    const isSelected = mode === allocationMode;
                    return (
                        <button 
                            key={mode}
                            onClick={() => setAllocationMode(mode)}
                            className={`flex-1 py-1.5 text-[10px] rounded-md transition-all font-medium ${
                                isSelected 
                                ? 'bg-indigo-600 text-white shadow-sm border border-indigo-500' 
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {mode}
                        </button>
                    )
                })}
            </div>
            {allocationMode === 'Cluster' && (
                <div className="p-2 mt-1 bg-slate-900/50 rounded border border-slate-700/50 flex flex-col gap-2">
                     <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>Cluster Radius (<span className="text-indigo-400 italic">δ</span>)</span>
                              <span className="font-mono text-indigo-400">{clusterRadius} voxels</span>
                          </div>
                          <input 
                              type="range" min="2" max="15" step="1"
                              value={clusterRadius} 
                              onChange={(e) => setClusterRadius(Number(e.target.value))}
                              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                     </div>
                     <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>Max Capacity (<span className="text-indigo-400 italic">K<sub className="text-[8px] leading-none">max</sub></span>)</span>
                              <span className="font-mono text-indigo-400">{maxClusterSize} pallets</span>
                          </div>
                          <input 
                              type="range" min="1" max="10" step="1"
                              value={maxClusterSize} 
                              onChange={(e) => setMaxClusterSize(Number(e.target.value))}
                              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                     </div>
                </div>
            )}
        </div>
        
        <hr className="border-slate-700 my-1" />

        <div className="flex items-center justify-between">
           <span className="text-sm font-medium text-slate-300 flex items-center gap-1">
             <Grid3X3 size={14} /> Scenarios
           </span>
           {isGenerating && <span className="text-xs text-cyan-400 animate-pulse">Generating...</span>}
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          {Object.values(GenerationTheme).map((theme) => (
            <button
              key={theme}
              onClick={() => onGenerate(theme)}
              disabled={isGenerating}
              className="px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded hover:border-cyan-500/50 hover:text-cyan-400 transition-all text-left truncate disabled:opacity-50"
            >
              {theme}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 mt-1">
            <button
                 onClick={() => onGenerate("Random")}
                 disabled={isGenerating}
                 className="flex-1 py-2 text-xs flex items-center justify-center gap-1 bg-slate-700/50 hover:bg-slate-700 rounded border border-dashed border-slate-600 text-slate-400 hover:text-white disabled:opacity-50"
            >
                <Box size={12} /> Random Noise
            </button>
            <button
                 onClick={onNewMissions}
                 disabled={isGenerating}
                 className="flex-1 py-2 text-xs flex items-center justify-center gap-1 bg-blue-600/20 hover:bg-blue-600/30 rounded border border-blue-500/50 text-blue-300 hover:text-blue-200 disabled:opacity-50"
                 title="Assign new random goals on current map"
            >
                <Shuffle size={12} /> New Missions
            </button>
        </div>

        <hr className="border-slate-700 my-1" />

        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-400">
                <Box size={12} /> Experiments (Console Output)
            </div>
            <button
                onClick={onRunMonteCarlo}
                disabled={isPlaying || isGenerating}
                className="w-full py-2 text-xs font-semibold rounded bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-300 transition-colors disabled:opacity-50"
            >
                Run Exp 2: Monte Carlo (50 Iterations)
            </button>
            <button
                onClick={onRunFaultTolerance}
                disabled={isPlaying || isGenerating}
                className="w-full py-2 text-xs font-semibold rounded bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/50 text-rose-300 transition-colors disabled:opacity-50"
            >
                Run Exp 3: Fault Injection (T=60s)
            </button>
        </div>

      </div>
    </div>
  );
};

export default ControlPanel;
