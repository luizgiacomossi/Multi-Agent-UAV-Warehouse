
import React from 'react';
import { Play, Pause, RotateCcw, Box, Grid3X3, Settings, Building2, ShieldCheck, Skull, Shuffle, Cpu, Repeat, Battery, Zap, Infinity as InfinityIcon, ArrowUpToLine, Power, Palette } from 'lucide-react';
import { GenerationTheme, TaskPriorityMode, MissionCompletionMode } from '../types';
import { MAX_TASKS, MAX_CHARGING_SITES, DEFAULT_CHARGE_RATE, INSTANT_CHARGE_RATE, BETA_FLY, BETA_HOVER, PLAYBACK_SPEEDS } from '../SimulationConfig';

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
  missionCompletionMode: MissionCompletionMode;
  setMissionCompletionMode: (mode: MissionCompletionMode) => void;
  
  batteryCapacity: number;
  setBatteryCapacity: (n: number) => void;
  batteryEnabled: boolean;
  setBatteryEnabled: (b: boolean) => void;
  
  /** Charging sites counting the base (1 = base only); extra sites are one-drone stations. */
  chargingSites: number;
  setChargingSites: (n: number) => void;
  /** Charging speed in % of capacity per tick; Infinity = instant. */
  chargeRate: number;
  setChargeRate: (n: number) => void;
  /** Scales battery consumption per move and per hover tick (1 = nominal). */
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  drainMultiplier: number;
  setDrainMultiplier: (n: number) => void;

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
  /** When set, every pallet in the scenario is a task and the slider is ignored. */
  useAllPallets: boolean;
  setUseAllPallets: (b: boolean) => void;
  /** Pallets in the current scenario. */
  palletCount: number;
  numForklifts: number;
  setNumForklifts: (n: number) => void;
  taskPriorityMode: TaskPriorityMode;
  setTaskPriorityMode: (mode: TaskPriorityMode) => void;

  onRunMonteCarlo: () => void;
  onRunFaultTolerance: () => void;
  onOpenThemeModal?: () => void;
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
  missionCompletionMode,
  setMissionCompletionMode,
  batteryCapacity,
  setBatteryCapacity,
  batteryEnabled,
  setBatteryEnabled,
  chargingSites,
  setChargingSites,
  chargeRate,
  setChargeRate,
  drainMultiplier,
  setDrainMultiplier,
  playbackSpeed,
  setPlaybackSpeed,
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
  useAllPallets,
  setUseAllPallets,
  palletCount,
  numForklifts,
  setNumForklifts,
  taskPriorityMode,
  setTaskPriorityMode,
  onRunMonteCarlo,
  onRunFaultTolerance,
  onOpenThemeModal
}) => {
  return (
    <div className="absolute top-4 left-4 w-80 bg-slate-800/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl text-slate-100 flex flex-col gap-4 z-10 max-h-[90vh] overflow-y-auto">
      
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
        <a
          href="https://nextarc.eu/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 group hover:opacity-90 transition-opacity"
          title="Visit NexTArc EU Project (https://nextarc.eu/)"
        >
          <img
            src="/nextarc-logo.png"
            alt="NexTArc Logo"
            className="w-7 h-9 object-contain drop-shadow"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent group-hover:from-cyan-300 group-hover:to-blue-400">
                NexTArc
              </span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                UC2
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">UAV Warehouse Inspection</span>
          </div>
        </a>
        <div className="flex items-center gap-1.5">
          <div className="text-xs text-slate-400 font-mono bg-slate-900/60 px-2 py-1 rounded border border-slate-700/50">
            T: {tick}/{maxTicks}
          </div>
          {onOpenThemeModal && (
            <button
              type="button"
              onClick={onOpenThemeModal}
              className="p-1.5 rounded-md bg-slate-900/60 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 transition-colors"
              title="Interface Color & Theme Settings"
            >
              <Palette size={13} />
            </button>
          )}
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

      {/* Playback Speed */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span title="How fast the planned mission is played back (the plan itself does not change)">Playback speed</span>
          <span className="font-mono text-cyan-400">{playbackSpeed}×</span>
        </div>
        <input
          type="range"
          min="0"
          max={PLAYBACK_SPEEDS.length - 1}
          step="1"
          value={Math.max(0, PLAYBACK_SPEEDS.indexOf(playbackSpeed))}
          onChange={(e) => setPlaybackSpeed(PLAYBACK_SPEEDS[Number(e.target.value)])}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        />
        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
          {PLAYBACK_SPEEDS.map(speed => <span key={speed}>{speed}×</span>)}
        </div>
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
                 <div className="flex items-center gap-2">
                    <button
                       onClick={() => setUseAllPallets(!useAllPallets)}
                       aria-pressed={useAllPallets}
                       title="Make every pallet in the scenario a task"
                       className={`px-2 py-0.5 text-[10px] rounded-md border transition-all font-medium ${
                         useAllPallets
                           ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                           : 'bg-slate-900 text-slate-500 border-slate-700 hover:text-slate-300'
                       }`}
                    >
                       All pallets
                    </button>
                    <span className="font-mono text-cyan-400">
                       {useAllPallets ? (palletCount > 0 ? `${palletCount} items` : 'all') : `${totalTasks} items`}
                    </span>
                 </div>
              </div>
              <input 
                 type="range" 
                 min="10" 
                 max={MAX_TASKS} 
                 step="5"
                 value={totalTasks} 
                 disabled={useAllPallets}
                 onChange={(e) => setTotalTasks(Number(e.target.value))}
                 className={`w-full h-2 bg-slate-700 rounded-lg appearance-none accent-cyan-500 ${useAllPallets ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
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
        <div className="space-y-2">
             <div className="flex items-center gap-1 text-xs text-slate-400">
                <InfinityIcon size={12} /> Mission End Condition
             </div>
             <div className="flex items-center justify-between bg-slate-900 p-1 rounded-lg border border-slate-700 gap-1">
                {([
                  { mode: 'count', label: 'Mission Count' },
                  { mode: 'all-pallets', label: 'All Pallets' }
                ] as const).map(({ mode, label }) => {
                  const isSelected = mode === missionCompletionMode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setMissionCompletionMode(mode)}
                      className={`flex-1 py-1.5 text-[10px] rounded-md transition-all font-medium ${
                        isSelected
                          ? 'bg-cyan-600 text-white shadow-sm border border-cyan-500'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
             </div>

             {missionCompletionMode === 'count' && (
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
             )}
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

                    {/* Drain: scales the battery used per move (β_fly) and per hover tick (β_hover) */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span title="Scales the battery used per move and per hover tick">Battery drain ×{drainMultiplier.toFixed(2)}</span>
                        <span className="font-mono text-emerald-400">
                            fly {(BETA_FLY * drainMultiplier).toFixed(3)} · hover {(BETA_HOVER * drainMultiplier).toFixed(3)} /tick
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0.25"
                        max="3"
                        step="0.25"
                        value={drainMultiplier}
                        onChange={(e) => setDrainMultiplier(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />

                    {/* Charging speed: instant (one tick) or a rate in % of capacity per tick */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1"><Zap size={10} /> Charging</span>
                        <span className="font-mono text-emerald-400">
                            {Number.isFinite(chargeRate) ? `${chargeRate}%/tick · full in ${Math.ceil(100 / chargeRate)} ticks` : 'instant'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between bg-slate-900 p-1 rounded-lg border border-slate-700 gap-1">
                        {([
                          { label: 'Instant', instant: true },
                          { label: '% per tick', instant: false }
                        ] as const).map(({ label, instant }) => {
                          const isSelected = instant === !Number.isFinite(chargeRate);
                          return (
                            <button
                              key={label}
                              onClick={() => setChargeRate(instant ? INSTANT_CHARGE_RATE : DEFAULT_CHARGE_RATE)}
                              className={`flex-1 py-1 text-[10px] rounded-md transition-all font-medium ${
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
                    {Number.isFinite(chargeRate) && (
                        <input
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={chargeRate}
                            onChange={(e) => setChargeRate(Number(e.target.value))}
                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                    )}

                    {/* Charging sites: the base charges every drone at once, a station one drone */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span title="The base charges every drone at once; each station charges one drone at a time">Charging sites (incl. base)</span>
                        <span className="font-mono text-emerald-400">
                            {chargingSites === 1 ? 'base only' : `base + ${chargingSites - 1} station${chargingSites > 2 ? 's' : ''}`}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max={MAX_CHARGING_SITES}
                        step="1"
                        value={chargingSites}
                        onChange={(e) => setChargingSites(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    {chargingSites > 1 && isRoundTrip && (
                        <p className="text-[10px] text-amber-400/80 leading-snug">
                            "Return" is on: drones fly home after every task, so stations are rarely used.
                        </p>
                    )}
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
