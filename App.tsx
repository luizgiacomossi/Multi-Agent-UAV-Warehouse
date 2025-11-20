import React, { useState, useEffect, useRef, useCallback } from 'react';
import VoxelWorld from './components/VoxelWorld';
import ControlPanel from './components/ControlPanel';
import StatusPanel from './components/StatusPanel';
import { Agent, Position3D, GenerationTheme, CollisionEvent } from './types';
import { World } from './classes/World';
import { Swarm } from './classes/Drone';
import { PathPlanner } from './classes/PathPlanner';

const App: React.FC = () => {
  // UI State
  const [gridSizeVal, setGridSizeVal] = useState(24); // Default larger for city
  const [gridSize, setGridSize] = useState<Position3D>({ x: 24, y: 24, z: 24 });
  const [deployFromBase, setDeployFromBase] = useState(false);
  const [useNaiveMode, setUseNaiveMode] = useState(false);
  
  // We keep serializable data in state for the React tree
  const [obstacles, setObstacles] = useState<Position3D[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [collisions, setCollisions] = useState<CollisionEvent[]>([]);
  
  const [tick, setTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentCount, setAgentCount] = useState(8);
  const [maxTicks, setMaxTicks] = useState(0);

  // Simulation Objects (Refs to persist across renders without triggering re-renders themselves until ready)
  const worldRef = useRef(new World(24));
  const swarmRef = useRef(new Swarm(8));
  const plannerRef = useRef(new PathPlanner(300));

  /**
   * Core Pathfinding Logic
   * Re-runs the planner on the existing world and swarm state.
   */
  const runPathfinding = useCallback((isNaive: boolean) => {
    const world = worldRef.current;
    const swarm = swarmRef.current;
    const planner = plannerRef.current;

    // Reset agents status for replanning (keep start/goal)
    swarm.drones.forEach(d => {
        d.destructionTime = undefined;
        d.status = 'idle';
        d.path = [];
    });

    let calculatedCollisions: CollisionEvent[] = [];

    if (isNaive) {
        // 4a. Plan Naively (Ignore each other)
        planner.planNaive(swarm, world);
        
        // 5a. Detect collisions in these unsafe paths
        calculatedCollisions = planner.detectProjectedCollisions(swarm, world);
        
        // 6a. Apply Destruction Logic
        // Sort collisions by time to handle early crashes first
        calculatedCollisions.sort((a, b) => a.time - b.time);
        
        const destroyedIds = new Set<string>();
        
        // Map collisions to agents
        calculatedCollisions.forEach(col => {
           col.agentIds.forEach(id => {
               if(destroyedIds.has(id)) return; // Already destroyed earlier
               
               const drone = swarm.drones.find(d => d.id === id);
               if (drone) {
                   drone.destructionTime = col.time;
                   drone.status = 'destroyed';
                   destroyedIds.add(id);
               }
           });
        });

    } else {
        // 4b. Plan Cooperatively (Safe)
        planner.plan(swarm, world);
        
        // 5b. Calculate collisions (should be 0 for coop)
        calculatedCollisions = planner.detectProjectedCollisions(swarm, world);
    }

    // 7. Sync to UI
    setAgents(JSON.parse(JSON.stringify(swarm.getAgents())));
    setCollisions(calculatedCollisions);

    const longestPath = Math.max(...swarm.drones.map(a => a.path.length), 0);
    setMaxTicks(longestPath);
  }, []);

  // Initial Load
  useEffect(() => {
    handleGenerate(GenerationTheme.CITY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time Strategy Update
  useEffect(() => {
      // If we aren't currently generating a new world, and we have agents, re-plan immediately
      // NOTE: We do NOT reset tick to 0 here, per user request. 
      // We allow the user to see the difference at the current timestamp.
      if (!isGenerating && agents.length > 0) {
          setIsPlaying(false);
          runPathfinding(useNaiveMode);
      }
  }, [useNaiveMode, runPathfinding]); // agents.length check prevents running on initial empty mount

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
    setCollisions([]); // Clear previous collisions
    
    setGridSize({ x: gridSizeVal, y: gridSizeVal, z: gridSizeVal });

    // Allow UI update
    setTimeout(() => {
        try {
            const world = worldRef.current;
            const swarm = swarmRef.current;
            const planner = plannerRef.current;

            // 1. Configure World
            world.setSize(gridSizeVal);
            world.generate(theme);

            // 2. Clear Base Area if needed
            if (deployFromBase) {
              const baseSize = Math.ceil(Math.sqrt(agentCount));
              world.clearZone(0, 0, 0, baseSize + 1, 3, baseSize + 1);
            }

            // 3. Configure Swarm
            swarm.resize(agentCount);
            swarm.initializeScenario(world, deployFromBase);
            
            planner.setMaxTimeSteps(Math.max(200, gridSizeVal * gridSizeVal / 2));

            // 4-7. Execute Pathfinding
            runPathfinding(useNaiveMode);

            // Sync Obstacles (runPathfinding syncs agents)
            setObstacles([...world.obstacleList]); 

        } catch (error) {
            console.error("Generation failed:", error);
        } finally {
            setIsGenerating(false);
        }
    }, 50);
  };

  const handleNewMissions = () => {
      setIsPlaying(false);
      setTick(0); // New mission implies new timeline
      setIsGenerating(true);

      setTimeout(() => {
          const world = worldRef.current;
          const swarm = swarmRef.current;
          
          // Re-roll positions/goals on the existing world
          swarm.resize(agentCount);
          swarm.initializeScenario(world, deployFromBase);
          
          runPathfinding(useNaiveMode);
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
        useNaiveMode={useNaiveMode}
        setUseNaiveMode={setUseNaiveMode}
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