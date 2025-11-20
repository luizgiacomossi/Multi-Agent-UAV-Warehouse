
import React, { useState, useEffect, useRef, useCallback } from 'react';
import VoxelWorld from './components/VoxelWorld';
import ControlPanel from './components/ControlPanel';
import StatusPanel from './components/StatusPanel';
import { Agent, Position3D, GenerationTheme, CollisionEvent } from './types';
import { World } from './classes/World';
import { Swarm } from './classes/Drone';
import { 
  PathFindingStrategy, 
  NaivePlanner, 
  CooperativePlanner, 
  EnergySaverPlanner,
  CollisionAnalyzer 
} from './classes/PathPlanner';

// -- ALGORITHM REGISTRY --
const ALGORITHMS: Record<string, PathFindingStrategy> = {
  'Naive': new NaivePlanner(),
  'Cooperative': new CooperativePlanner(),
  'Energy Saver': new EnergySaverPlanner(),
};

const App: React.FC = () => {
  // UI State
  const [gridSizeVal, setGridSizeVal] = useState(24);
  const [gridSize, setGridSize] = useState<Position3D>({ x: 24, y: 24, z: 24 });
  const [deployFromBase, setDeployFromBase] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [batteryCapacity, setBatteryCapacity] = useState(80);
  
  // Strategy Selection
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('Cooperative');
  
  // Serializable State
  const [obstacles, setObstacles] = useState<Position3D[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [collisions, setCollisions] = useState<CollisionEvent[]>([]);
  
  const [tick, setTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentCount, setAgentCount] = useState(8);
  const [maxTicks, setMaxTicks] = useState(0);

  // Simulation Objects
  const worldRef = useRef(new World(24));
  const swarmRef = useRef(new Swarm(8));

  /**
   * Core Pathfinding Logic
   * Dynamically uses the selected strategy from the registry.
   */
  const runPathfinding = useCallback(async (algorithmName: string, batCap: number) => {
    const world = worldRef.current;
    const swarm = swarmRef.current;
    
    try {
        // 1. Get Strategy
        const strategy = ALGORITHMS[algorithmName];
        if (!strategy) {
            console.error(`Algorithm ${algorithmName} not found`);
            return;
        }

        // 2. Reset Agent Status & Update Battery Config
        swarm.drones.forEach(d => {
            d.destructionTime = undefined;
            d.status = 'idle';
            d.path = [];
            d.maxBattery = batCap;
        });

        // 3. Set Configs
        // If round trip, allow more time steps
        const baseMaxTime = Math.max(200, world.size * world.size / 2);
        strategy.setMaxTimeSteps(isRoundTrip ? baseMaxTime * 2 : baseMaxTime);

        // Small yield to allow UI to update spinner if needed
        await new Promise(resolve => setTimeout(resolve, 0));

        // 4. Execute Plan
        strategy.plan(swarm, world, isRoundTrip);
        
        // 5. Detect Collisions
        // We always run detection to verify the paths, even for "safe" algorithms
        let calculatedCollisions = CollisionAnalyzer.detect(swarm);

        // 6. Handle Destruction Logic (Only for unsafe algorithms)
        if (!strategy.isSafe) {
            calculatedCollisions.sort((a, b) => a.time - b.time);
            const destroyedIds = new Set<string>();
            
            calculatedCollisions.forEach(col => {
            col.agentIds.forEach(id => {
                if(destroyedIds.has(id)) return;
                
                const drone = swarm.drones.find(d => d.id === id);
                if (drone) {
                    drone.destructionTime = col.time;
                    drone.status = 'destroyed';
                    destroyedIds.add(id);
                }
            });
            });
        }

        // 7. Sync to UI
        setAgents(JSON.parse(JSON.stringify(swarm.getAgents())));
        setCollisions(calculatedCollisions);

        const longestPath = Math.max(...swarm.drones.map(a => a.path.length), 0);
        setMaxTicks(longestPath);
    } catch (error: any) {
        console.error("Pathfinding Error:", error);
        if (error.message === 'Pathfinding Timeout') {
            alert("Calculation timed out! The scenario is too complex (large grid or high agent count). Try reducing these parameters.");
        } else {
            alert("An error occurred during pathfinding.");
        }
        setIsGenerating(false);
    }
  }, [isRoundTrip]);

  // Initial Load
  useEffect(() => {
    handleGenerate(GenerationTheme.CITY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time Strategy Update (Or Battery/Mode change)
  useEffect(() => {
      if (!isGenerating && agents.length > 0) {
          setIsPlaying(false);
          runPathfinding(selectedAlgorithm, batteryCapacity);
      }
  }, [selectedAlgorithm, isRoundTrip, batteryCapacity, runPathfinding]); 

  // Simulation Loop
  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        setTick((t) => {
          if (t >= maxTicks + 10) { 
            setIsPlaying(false);
            return 0; 
          }
          return t + 1;
        });
      }, 150);
    }
    return () => clearInterval(interval);
  }, [isPlaying, maxTicks]);

  const handleGenerate = async (theme: string) => {
    setIsPlaying(false);
    setIsGenerating(true);
    setTick(0);
    setCollisions([]); 
    
    setGridSize({ x: gridSizeVal, y: gridSizeVal, z: gridSizeVal });

    setTimeout(async () => {
        try {
            const world = worldRef.current;
            const swarm = swarmRef.current;

            world.setSize(gridSizeVal);
            world.generate(theme);

            if (deployFromBase) {
              const baseSize = Math.ceil(Math.sqrt(agentCount));
              world.clearZone(0, 0, 0, baseSize + 1, 3, baseSize + 1);
            }

            swarm.resize(agentCount, batteryCapacity);
            swarm.initializeScenario(world, deployFromBase);
            
            await runPathfinding(selectedAlgorithm, batteryCapacity);

            setObstacles([...world.obstacleList]); 

        } catch (error) {
            console.error("Generation failed:", error);
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
          const world = worldRef.current;
          const swarm = swarmRef.current;
          
          swarm.resize(agentCount, batteryCapacity);
          swarm.initializeScenario(world, deployFromBase);
          
          await runPathfinding(selectedAlgorithm, batteryCapacity);
          setIsGenerating(false);
      }, 50);
  };

  const handleTogglePlay = () => {
    if (tick >= maxTicks) {
      setTick(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setTick(0);
  };

  // Helper to get current algorithm description for UI
  const currentAlgoDesc = ALGORITHMS[selectedAlgorithm]?.description || "";

  return (
    <div className="w-full h-full overflow-hidden relative bg-slate-950">
      <VoxelWorld
        gridSize={gridSize}
        obstacles={obstacles}
        agents={agents}
        collisions={collisions}
        tick={tick}
        isBaseEnabled={deployFromBase}
        agentCount={agentCount}
      />
      
      <ControlPanel
        isPlaying={isPlaying}
        tick={tick}
        maxTicks={maxTicks}
        onTogglePlay={handleTogglePlay}
        onReset={handleReset}
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
        availableAlgorithms={Object.keys(ALGORITHMS)}
        currentAlgoDesc={currentAlgoDesc}
        isRoundTrip={isRoundTrip}
        setIsRoundTrip={setIsRoundTrip}
        batteryCapacity={batteryCapacity}
        setBatteryCapacity={setBatteryCapacity}
      />

      <StatusPanel 
        agents={agents}
        collisions={collisions}
        tick={tick}
      />
    </div>
  );
};

export default App;
