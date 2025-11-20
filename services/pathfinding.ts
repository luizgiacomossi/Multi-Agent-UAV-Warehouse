import { Position3D, Agent, PathNode, ENERGY_COSTS } from '../types';

// Helper to check coordinate equality
const isSamePos = (a: Position3D, b: Position3D) => a.x === b.x && a.y === b.y && a.z === b.z;

// Serialize position for Set/Map lookups
const posKey = (p: Position3D) => `${p.x},${p.y},${p.z}`;
const posTimeKey = (p: Position3D, time: number) => `${p.x},${p.y},${p.z},${time}`;

// Manhattan distance heuristic
const heuristic = (a: Position3D, b: Position3D) => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
};

// Get valid neighbors (6 directions + wait)
const getNeighbors = (node: PathNode, gridSize: Position3D): Position3D[] => {
  const dirs = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 0 } // Wait action
  ];

  const neighbors: Position3D[] = [];
  for (const d of dirs) {
    const nx = node.x + d.x;
    const ny = node.y + d.y;
    const nz = node.z + d.z;

    // Boundary check
    if (nx >= 0 && nx < gridSize.x && ny >= 0 && ny < gridSize.y && nz >= 0 && nz < gridSize.z) {
      neighbors.push({ x: nx, y: ny, z: nz });
    }
  }
  return neighbors;
};

/**
 * Calculates paths for multiple agents using Prioritized Planning (Cooperative A*).
 * Agents are planned one by one. Earlier agents reserve space-time slots that later agents treat as obstacles.
 */
export const calculatePaths = (
  agents: Agent[],
  obstacles: Position3D[],
  gridSize: Position3D,
  maxTimeSteps: number = 100
): Agent[] => {
  const updatedAgents = JSON.parse(JSON.stringify(agents)) as Agent[];
  const reservedSpaceTime = new Set<string>();
  
  // Static obstacles block all times
  const staticObstacles = new Set(obstacles.map(posKey));

  for (const agent of updatedAgents) {
    // Check if start or goal is invalid
    if (staticObstacles.has(posKey(agent.start))) {
        console.warn(`Agent ${agent.id} start is blocked.`);
        agent.status = 'blocked';
        agent.path = [agent.start];
        continue;
    }

    const startNode: PathNode = { 
      ...agent.start, 
      g: 0, 
      h: heuristic(agent.start, agent.goal), 
      f: 0, 
      parent: null, 
      time: 0,
      energy: 0
    };
    startNode.f = startNode.g + startNode.h;

    const openList: PathNode[] = [startNode];
    const closedSet = new Set<string>(); // key: x,y,z,time
    
    let finalNode: PathNode | null = null;

    while (openList.length > 0) {
      // Sort by F cost (lowest first)
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;

      // Check goal
      if (isSamePos(current, agent.goal)) {
        finalNode = current;
        break;
      }

      if (current.time >= maxTimeSteps) {
        continue; // Exceeded max time
      }

      const currentKey = posTimeKey(current, current.time);
      if (closedSet.has(currentKey)) continue;
      closedSet.add(currentKey);

      const neighbors = getNeighbors(current, gridSize);

      for (const neighborPos of neighbors) {
        const neighborTime = current.time + 1;
        const neighborKey = posTimeKey(neighborPos, neighborTime);
        
        // Check static obstacles
        if (staticObstacles.has(posKey(neighborPos))) continue;

        // Check reserved space-time (dynamic obstacles)
        if (reservedSpaceTime.has(neighborKey)) continue;

        const g = current.g + 1;
        const h = heuristic(neighborPos, agent.goal);
        const f = g + h;

        const isWait = isSamePos(neighborPos, current);
        const stepCost = isWait ? ENERGY_COSTS.WAIT : ENERGY_COSTS.MOVE;
        const energy = current.energy + stepCost;

        const neighborNode: PathNode = {
          ...neighborPos,
          g, h, f,
          parent: current,
          time: neighborTime,
          energy
        };

        // Optimization: Simple check if we already have this node in open list with lower cost
        const existingIdx = openList.findIndex(n => 
            n.x === neighborNode.x && n.y === neighborNode.y && n.z === neighborNode.z && n.time === neighborNode.time
        );

        if (existingIdx !== -1) {
            if (openList[existingIdx].g > g) {
                openList[existingIdx] = neighborNode;
            }
        } else {
            openList.push(neighborNode);
        }
      }
    }

    // Reconstruct path
    const path: Position3D[] = [];
    if (finalNode) {
      let curr: PathNode | null = finalNode;
      while (curr) {
        path.unshift({ x: curr.x, y: curr.y, z: curr.z });
        curr = curr.parent;
      }
      agent.status = 'finished';
    } else {
      // Path not found
      path.push(agent.start);
      agent.status = 'blocked';
    }

    // Reserve the path for subsequent agents
    path.forEach((p, idx) => {
      reservedSpaceTime.add(posTimeKey(p, idx));
      
      // Reserve goal for a duration after arrival to avoid collision with agents finishing later
      if (idx === path.length - 1) {
        for(let t = 1; t < 20; t++) {
           reservedSpaceTime.add(posTimeKey(p, idx + t));
        }
      }
    });

    agent.path = path;
  }

  return updatedAgents;
};