import { Position3D, Agent, GenerationTheme } from "../types";

const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];

// Helper to check if a position is in a set of obstacles
const isBlocked = (p: Position3D, obstacles: Set<string>) => obstacles.has(`${p.x},${p.y},${p.z}`);

// Helper to check if position is used by another agent
const isOccupied = (p: Position3D, agents: Agent[]) => {
  return agents.some(a => 
    (a.start.x === p.x && a.start.y === p.y && a.start.z === p.z) ||
    (a.goal.x === p.x && a.goal.y === p.y && a.goal.z === p.z)
  );
};

export const generateScenario = async (
  theme: GenerationTheme | string,
  agentCount: number,
  gridSize: number
): Promise<{ obstacles: Position3D[]; agents: Agent[] }> => {
  
  // 1. Generate Obstacles
  const obstacles: Position3D[] = [];
  const obstacleSet = new Set<string>();

  // Determine density based on theme
  let density = 0.15; // Default RANDOM
  if (theme === GenerationTheme.CITY) density = 0.2;
  if (theme === GenerationTheme.TUNNEL) density = 0.30;
  if (theme === GenerationTheme.OPEN) density = 0.05;

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      for (let z = 0; z < gridSize; z++) {
        
        let shouldPlace = Math.random() < density;

        // Theme specific logic
        if (theme === GenerationTheme.CITY) {
           // City blocks: clear streets
           if (x % 4 === 0 || z % 4 === 0) shouldPlace = false;
           // Skyscrapers: higher density lower down
           if (shouldPlace && y > (gridSize * 0.7) && Math.random() > 0.5) shouldPlace = false;
        }
        
        if (theme === GenerationTheme.TUNNEL) {
           // Solid block with tunnels
           shouldPlace = true;
           // Center safe zone
           if (Math.abs(x - gridSize/2) < 3 && Math.abs(y - gridSize/2) < 3 && Math.abs(z - gridSize/2) < 3) {
              shouldPlace = false;
           }

           // Carve distinct tunnels
           if (Math.abs(x - gridSize/2) < 2 && z === y) shouldPlace = false; // Diagonal
           if (y === Math.floor(gridSize/3)) shouldPlace = false; // Horizontal layer
           if (x === Math.floor(gridSize/2) && z === Math.floor(gridSize/2)) shouldPlace = false; // Vertical shaft
           
           // Add noise to tunnels
           if (!shouldPlace && Math.random() < 0.1) shouldPlace = true;
           if (shouldPlace && Math.random() < 0.05) shouldPlace = false;
        }

        if (theme === GenerationTheme.OPEN) {
           // Pillars
           if (x % 5 === 0 && z % 5 === 0 && y < (gridSize * 0.8)) shouldPlace = true;
           else shouldPlace = false;
        }

        if (shouldPlace) {
          const p = { x, y, z };
          obstacles.push(p);
          obstacleSet.add(`${x},${y},${z}`);
        }
      }
    }
  }

  // 2. Generate Agents
  const agents: Agent[] = [];
  
  for (let i = 0; i < agentCount; i++) {
    let start: Position3D;
    let goal: Position3D;
    let attempts = 0;

    // Find valid start
    while (attempts < 1000) {
      start = {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
        z: Math.floor(Math.random() * gridSize)
      };
      if (!isBlocked(start, obstacleSet) && !isOccupied(start, agents)) break;
      attempts++;
    }

    // Find valid goal (ensure some distance)
    attempts = 0;
    const minDistance = Math.max(4, Math.floor(gridSize / 3));
    
    while (attempts < 1000) {
      goal = {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
        z: Math.floor(Math.random() * gridSize)
      };
      
      const dist = Math.abs(start!.x - goal.x) + Math.abs(start!.y - goal.y) + Math.abs(start!.z - goal.z);
      
      if (!isBlocked(goal, obstacleSet) && 
          !isOccupied(goal, agents) && 
          dist > minDistance &&
          !(start!.x === goal.x && start!.y === goal.y && start!.z === goal.z)) {
        break;
      }
      attempts++;
    }

    // Fallback if generation fails
    if (attempts >= 1000) {
        console.warn("Could not place agent " + i);
        continue;
    }

    agents.push({
      id: `agent-${i}-${Date.now()}`,
      name: `Drone ${i + 1}`,
      start: start!,
      goal: goal!,
      color: colors[i % colors.length],
      path: [],
      status: 'idle'
    });
  }

  return { obstacles, agents };
};