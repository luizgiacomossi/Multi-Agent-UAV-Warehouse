
import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import VoxelWorld from './components/VoxelWorld';
import ControlPanel from './components/ControlPanel';
import StatusPanel from './components/StatusPanel';
import { Agent, Position3D, GenerationTheme, SimulationIncident } from './types';
import { SimulationManager } from './classes/SimulationManager';
import { Warehouse } from './classes/Warehouse';

const App: React.FC = () => {
  // -- UI Config State --
  const [gridSizeVal, setGridSizeVal] = useState(24);
  const [deployFromBase, setDeployFromBase] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [isInfiniteMode, setIsInfiniteMode] = useState(false);
  const [batteryCapacity, setBatteryCapacity] = useState(80);
  const [batteryEnabled, setBatteryEnabled] = useState(true);
  const [enableCharging, setEnableCharging] = useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('Cooperative');
  const [maxAltitude, setMaxAltitude] = useState(24);
  
  // -- Simulation Data State --
  // We store snapshots of the simulation data for rendering
  const [obstacles, setObstacles] = useState<Position3D[]>([]);
  const [chargeStations, setChargeStations] = useState<Position3D[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [incidents, setIncidents] = useState<SimulationIncident[]>([]);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  
  // -- Flow Control --
  const [tick, setTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentCount, setAgentCount] = useState(8);
  const [maxTicks, setMaxTicks] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // -- Engine --
  const engineRef = useRef(new SimulationManager(24, 8));

  // Core Update Function
  const updateSimulation = async (algo: string, roundTrip: boolean, infinite: boolean, altitude: number, batEnabled: boolean) => {
      try {
          setError(null);
          const result = await engineRef.current.runPathfinding(algo, roundTrip, infinite, altitude, batEnabled);
          
          setAgents(result.agents);
          setIncidents(result.incidents);
          setMaxTicks(result.maxTicks);
      } catch (e: any) {
          console.error("Sim Error", e);
          if (e.message === 'Pathfinding Timeout') {
              setError("The calculation took too long. Try reducing Grid Size or Agent Count.");
          } else {
              setError("An unexpected error occurred.");
          }
      }
  };

  // Ensure altitude doesn't exceed grid size
  useEffect(() => {
    if (maxAltitude > gridSizeVal) setMaxAltitude(gridSizeVal);
  }, [gridSizeVal]);

  // Initial Load
  useEffect(() => {
    handleGenerate(GenerationTheme.CITY);
  }, []);

  // Strategy/Config Update Effect
  useEffect(() => {
      if (!isGenerating && agents.length > 0) {
          setIsPlaying(false);
          updateSimulation(selectedAlgorithm, isRoundTrip, isInfiniteMode, maxAltitude, batteryEnabled);
      }
  }, [selectedAlgorithm, isRoundTrip, isInfiniteMode, maxAltitude, batteryEnabled]);

  const handleGenerate = async (theme: string) => {
      setIsPlaying(false);
      setIsGenerating(true);
      setTick(0);
      setError(null);

      // Allow UI to render loading state
      setTimeout(async () => {
          try {
              const engine = engineRef.current;
              
              // 1. Generate World (Pass deployment config to avoid obstacles in base area)
              // Force deployFromBase if infinite mode is on for logic consistency (drones need to return to 'base')
              const effectiveDeployFromBase = isInfiniteMode ? true : deployFromBase;
              if (isInfiniteMode && !deployFromBase) {
                  setDeployFromBase(true); // Sync UI
              }

              engine.generateWorld(theme, gridSizeVal, enableCharging, effectiveDeployFromBase, agentCount);
              setObstacles([...engine.world.obstacleList]);
              setChargeStations([...engine.world.chargeStations]);

              // 2. Initialize Agents (creates warehouse if needed)
              engine.initializeAgents(agentCount, batteryCapacity, effectiveDeployFromBase, maxAltitude);
              
              // Sync Warehouse state
              setWarehouse(engine.world.warehouse); // Reference copy is fine here since Warehouse is immutable-ish

              // 3. Run Pathfinding
              await updateSimulation(selectedAlgorithm, isRoundTrip, isInfiniteMode, maxAltitude, batteryEnabled);

          } catch (e) {
              console.error(e);
              setError("Generation failed.");
          } finally {
              setIsGenerating(false);
          }
      }, 50);
  };

  const handleNewMissions = async () => {
      setIsPlaying(false);
      setTick(0);
      setIsGenerating(true);
      
      setTimeout(async () => {
          const engine = engineRef.current;
          // Re-init agents (keeps world, updates warehouse if needed)
          engine.initializeAgents(agentCount, batteryCapacity, deployFromBase, maxAltitude);
          
          // Sync Warehouse state
          setWarehouse(engine.world.warehouse);

          await updateSimulation(selectedAlgorithm, isRoundTrip, isInfiniteMode, maxAltitude, batteryEnabled);
          setIsGenerating(false);
      }, 50);
  };

  // Playback Loop
  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        setTick((t) => {
          if (t >= maxTicks + 10) { 
            // If infinite mode, we could auto-regenerate here, but for now we just stop or loop
            // Logic for true "Infinite Streaming" would involve appending paths here.
            // Given the current implementation uses "5 Loops", we just stop at the end of the 5th loop.
            setIsPlaying(false);
            return 0; 
          }
          return t + 1;
        });
      }, 150);
    }
    return () => clearInterval(interval);
  }, [isPlaying, maxTicks]);

  const handleTogglePlay = () => {
    if (tick >= maxTicks) setTick(0);
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="w-full h-full overflow-hidden relative bg-slate-950">
      <VoxelWorld
        gridSize={{ x: gridSizeVal, y: gridSizeVal, z: gridSizeVal }}
        obstacles={obstacles}
        agents={agents}
        incidents={incidents}
        tick={tick}
        warehouse={warehouse}
        chargeStations={chargeStations}
      />
      
      <ControlPanel
        isPlaying={isPlaying}
        tick={tick}
        maxTicks={maxTicks}
        onTogglePlay={handleTogglePlay}
        onReset={() => { setIsPlaying(false); setTick(0); }}
        onGenerate={handleGenerate}
        onNewMissions={handleNewMissions}
        isGenerating={isGenerating}
        agentCount={agentCount}
        setAgentCount={setAgentCount}
        gridSizeValue={gridSizeVal}
        setGridSizeValue={setGridSizeVal}
        deployFromBase={deployFromBase}
        setDeployFromBase={setDeployFromBase}
        selectedAlgorithm={selectedAlgorithm}
        setSelectedAlgorithm={setSelectedAlgorithm}
        availableAlgorithms={engineRef.current.getAvailableAlgorithms()}
        currentAlgoDesc={engineRef.current.getAlgorithmDescription(selectedAlgorithm)}
        isRoundTrip={isRoundTrip}
        setIsRoundTrip={setIsRoundTrip}
        isInfiniteMode={isInfiniteMode}
        setIsInfiniteMode={setIsInfiniteMode}
        batteryCapacity={batteryCapacity}
        setBatteryCapacity={setBatteryCapacity}
        batteryEnabled={batteryEnabled}
        setBatteryEnabled={setBatteryEnabled}
        enableCharging={enableCharging}
        setEnableCharging={setEnableCharging}
        maxAltitude={maxAltitude}
        setMaxAltitude={setMaxAltitude}
      />

      <StatusPanel agents={agents} incidents={incidents} tick={tick} />

      {error && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-red-500/50 p-6 rounded-xl shadow-2xl max-w-md w-full flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mb-4 border border-red-500/30">
                    <AlertTriangle className="text-red-500" size={28} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Simulation Error</h3>
                <p className="text-slate-300 text-sm mb-6 leading-relaxed">{error}</p>
                <button onClick={() => setError(null)} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-semibold w-full">
                    Dismiss Warning
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
