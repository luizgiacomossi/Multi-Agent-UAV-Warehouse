
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import VoxelWorld from './components/VoxelWorld';
import ControlPanel from './components/ControlPanel';
import StatusPanel from './components/StatusPanel';
import { Agent, Position3D, GenerationTheme, SimulationIncident, Forklift, Pallet, ClusterVisualization } from './types';
import { SimulationManager } from './classes/SimulationManager';
import { Warehouse } from './classes/Warehouse';
import { GRID_SIZE, DEFAULT_AGENT_COUNT } from './SimulationConfig';

const App: React.FC = () => {
  // -- UI Config State --
  const [gridSizeVal, setGridSizeVal] = useState(GRID_SIZE);
  const [deployFromBase, setDeployFromBase] = useState(true);
  const [isRoundTrip, setIsRoundTrip] = useState(true);
  const [missionCount, setMissionCount] = useState<number>(3);
  const [batteryCapacity, setBatteryCapacity] = useState(100);
  const [batteryEnabled, setBatteryEnabled] = useState(true);
  const [enableCharging, setEnableCharging] = useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('Cooperative');
  const [maxAltitude, setMaxAltitude] = useState(24);

  // -- Clustering State --
  const [allocationMode, setAllocationMode] = useState<'1-to-1' | 'Cluster'>('1-to-1');
  const [clusterRadius, setClusterRadius] = useState(5);
  const [maxClusterSize, setMaxClusterSize] = useState(3);
  const [totalTasks, setTotalTasks] = useState(50);
  const [numForklifts, setNumForklifts] = useState(3);

  // -- Simulation Data State --
  // We store snapshots of the simulation data for rendering
  const [obstacles, setObstacles] = useState<Position3D[]>([]);
  const [chargeStations, setChargeStations] = useState<Position3D[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [incidents, setIncidents] = useState<SimulationIncident[]>([]);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [forklifts, setForklifts] = useState<Forklift[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [clusters, setClusters] = useState<ClusterVisualization[]>([]);

  // -- Flow Control --
  const [tick, setTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentCount, setAgentCount] = useState(DEFAULT_AGENT_COUNT);
  const [maxTicks, setMaxTicks] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // -- Engine --
  const engineRef = useRef(new SimulationManager(GRID_SIZE, DEFAULT_AGENT_COUNT));

  // Core Update Function
  const updateSimulation = async (algo: string, roundTrip: boolean, mCount: number, altitude: number, batEnabled: boolean, aMode: '1-to-1' | 'Cluster', cRadius: number, cMaxSize: number) => {
    try {
      setError(null);
      const result = await engineRef.current.runPathfinding(algo, roundTrip, mCount, altitude, batEnabled, aMode, cRadius, cMaxSize);

      setAgents(result.agents);
      setIncidents(result.incidents);
      setMaxTicks(result.maxTicks);
      setClusters(result.clusters);
      setForklifts(engineRef.current.world.forklifts || []);
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
    handleGenerate(GenerationTheme.WAREHOUSE);
  }, []);

  // Strategy/Config Update Effect — replans paths when algorithm/flight params change
  useEffect(() => {
    if (!isGenerating && agents.length > 0) {
      setIsPlaying(false);
      updateSimulation(selectedAlgorithm, isRoundTrip, missionCount, maxAltitude, batteryEnabled, allocationMode, clusterRadius, maxClusterSize);
    }
  }, [selectedAlgorithm, isRoundTrip, missionCount, maxAltitude, batteryEnabled, allocationMode, clusterRadius, maxClusterSize]);

  // Agent Count / Battery Capacity — requires full swarm re-initialization
  useEffect(() => {
    if (!isGenerating && agents.length > 0) {
      setIsPlaying(false);
      // Re-init agent swarm with new count/battery, keep current world
      const engine = engineRef.current;
      engine.initializeAgents(agentCount, batteryCapacity, deployFromBase, maxAltitude);
      setWarehouse(engine.world.warehouse);
      const palletPositionSet = new Set(engine.world.pallets.map(p => `${p.position.x},${p.position.y},${p.position.z}`));
      setObstacles(engine.world.obstacleList.filter(o => !palletPositionSet.has(`${o.x},${o.y},${o.z}`)));
      setPallets([...engine.world.pallets]);
      updateSimulation(selectedAlgorithm, isRoundTrip, missionCount, maxAltitude, batteryEnabled, allocationMode, clusterRadius, maxClusterSize);
    }
  }, [agentCount, batteryCapacity]);


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
        // Force deployFromBase if multiple missions are set to keep base logic consistent
        const effectiveDeployFromBase = (missionCount > 1) ? true : deployFromBase;
        if (missionCount > 1 && !deployFromBase) {
          setDeployFromBase(true); // Sync UI
        }

        engine.generateWorld(theme, gridSizeVal, enableCharging, effectiveDeployFromBase, agentCount, totalTasks, numForklifts);
        const palletPositionSet = new Set(
          engine.world.pallets.map(p => `${p.position.x},${p.position.y},${p.position.z}`)
        );
        // Render only structural rack obstacles (not pallet-covered positions) as grey cubes
        setObstacles(engine.world.obstacleList.filter(o => !palletPositionSet.has(`${o.x},${o.y},${o.z}`)));
        setChargeStations([...engine.world.chargeStations]);
        setForklifts([...engine.world.forklifts]);
        setPallets([...engine.world.pallets]);

        // 2. Initialize Agents (creates warehouse if needed)
        engine.initializeAgents(agentCount, batteryCapacity, effectiveDeployFromBase, maxAltitude);

        // Sync Warehouse state
        setWarehouse(engine.world.warehouse); // Reference copy is fine here since Warehouse is immutable-ish

        // 3. Run Pathfinding
        await updateSimulation(selectedAlgorithm, isRoundTrip, missionCount, maxAltitude, batteryEnabled, allocationMode, clusterRadius, maxClusterSize);

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

      await updateSimulation(selectedAlgorithm, isRoundTrip, missionCount, maxAltitude, batteryEnabled, allocationMode, clusterRadius, maxClusterSize);
      setIsGenerating(false);
    }, 50);
  };

  // Playback Loop
  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        setTick((t) => {
          if (t >= maxTicks) {
            setIsPlaying(false);
            return maxTicks;
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

  // Compute pallet states at current tick for color-coding
  const scannedPalletIds = useMemo(() => {
    const ids = new Set<string>();
    agents.forEach(a => {
      (a.scanLog || []).forEach(entry => {
        if (entry.tick <= tick) ids.add(entry.palletId);
      });
    });
    return ids;
  }, [agents, tick]);

  const activePalletIds = useMemo(() => {
    const ids = new Set<string>();
    agents.forEach(a => {
      if (a.status === 'STRANDED' || tick >= a.path.length) return;
      const activeTask = (a.assignedTasksLog || []).find(t => tick >= t.startTick && tick <= t.endTick);
      if (activeTask) ids.add(activeTask.palletId);
    });
    return ids;
  }, [agents, tick]);

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
        batteryEnabled={batteryEnabled}
        forklifts={forklifts}
        pallets={pallets}
        clusters={clusters}
        scannedPalletIds={scannedPalletIds}
        activePalletIds={activePalletIds}
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
        missionCount={missionCount}
        setMissionCount={setMissionCount}
        batteryCapacity={batteryCapacity}
        setBatteryCapacity={setBatteryCapacity}
        batteryEnabled={batteryEnabled}
        setBatteryEnabled={setBatteryEnabled}
        enableCharging={enableCharging}
        setEnableCharging={setEnableCharging}
        maxAltitude={maxAltitude}
        setMaxAltitude={setMaxAltitude}
        allocationMode={allocationMode}
        setAllocationMode={setAllocationMode}
        clusterRadius={clusterRadius}
        setClusterRadius={setClusterRadius}
        maxClusterSize={maxClusterSize}
        setMaxClusterSize={setMaxClusterSize}
        totalTasks={totalTasks}
        setTotalTasks={setTotalTasks}
        numForklifts={numForklifts}
        setNumForklifts={setNumForklifts}
        onRunMonteCarlo={() => {
          console.clear();
          engineRef.current.runMonteCarloAllocations();
        }}
        onRunFaultTolerance={() => {
          console.clear();
          engineRef.current.runFaultToleranceScenario();
        }}
      />

      <StatusPanel agents={agents} incidents={incidents} tick={tick} batteryEnabled={batteryEnabled} pallets={pallets} />

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
