import React, { useState, useEffect, useRef } from 'react';
import VoxelWorld from './components/VoxelWorld';
import ControlPanel from './components/ControlPanel';
import { Agent, Position3D, GenerationTheme, CollisionEvent } from './types';
import { World } from './classes/World';
import { Swarm } from './classes/Drone';
import { PathPlanner } from './classes/PathPlanner';

const App: React.FC = () => {
  // UI State
  const [gridSizeVal, setGridSizeVal] = useState(24); // Default larger for city
  const [gridSize, setGridSize] = useState<Position3D>({ x: 24, y: 24, z: 24 });
  const [deployFromBase, setDeployFromBase] = useState(false);
  
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

  // Initial Load
  useEffect(() => {
    handleGenerate(GenerationTheme.CITY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              // Determine base size based on agent count (sq root)
              const baseSize = Math.ceil(Math.sqrt(agentCount));
              // Clear a box at (0,0,0) to (baseSize, 2, baseSize)
              world.clearZone(0, 0, 0, baseSize + 1, 3, baseSize + 1);
            }

            // 3. Configure Swarm
            swarm.resize(agentCount);
            swarm.initializeScenario(world, deployFromBase);

            // 4. Calculate Projected Collisions (Naive run)
            const potentialCollisions = planner.detectProjectedCollisions(swarm, world);

            // 5. Plan Paths (Actual run)
            planner.setMaxTimeSteps(Math.max(200, gridSizeVal * gridSizeVal / 2));
            planner.plan(swarm, world);

            // 6. Sync to UI
            setObstacles([...world.obstacleList]); 
            setAgents(JSON.parse(JSON.stringify(swarm.getAgents())));
            setCollisions(potentialCollisions);

            const longestPath = Math.max(...swarm.drones.map(a => a.path.length), 0);
            setMaxTicks(longestPath);

        } catch (error) {
            console.error("Generation failed:", error);
        } finally {
            setIsGenerating(false);
        }
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
        isGenerating={isGenerating}
        agentCount={agentCount}
        setAgentCount={setAgentCount}
        gridSizeValue={gridSizeVal}
        setGridSizeValue={setGridSizeVal}
        deployFromBase={deployFromBase}
        setDeployFromBase={setDeployFromBase}
      />
    </div>
  );
};

export default App;