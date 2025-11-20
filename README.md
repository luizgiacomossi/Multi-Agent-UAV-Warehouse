# VoxelSwarm AI: 3D Multi-Agent Path Planning Visualizer

VoxelSwarm AI is an interactive 3D simulation designed to visualize complex pathfinding behaviors in drone swarms. It utilizes a voxel-based world engine to simulate diverse environments—from dense city blocks to underground tunnels—and demonstrates how autonomous agents navigate these spaces while avoiding static obstacles and dynamic collisions with one another.

## Key Features

*   **3D Voxel Engine**: A high-performance rendering engine built with React Three Fiber and InstancedMesh optimization to handle large grids and obstacle fields.
*   **Procedural Environment Generation**:
    *   **City**: Generates city blocks with streets and skyscrapers of varying heights.
    *   **Tunnels**: Creates solid subterranean blocks carved with procedural tunnels and caverns.
    *   **Open Field**: A sparse environment with pillars, ideal for testing long-range navigation.
*   **Multi-Agent Path Finding (MAPF)**: Implements **Cooperative A*** (also known as Prioritized Planning) to solve collision-free paths for multiple agents simultaneously.
*   **Collision Visualization**:
    *   **Projected Collisions**: The system pre-calculates where naive (non-cooperative) agents would have crashed and visualizes these "near-miss" events in the timeline.
    *   **Dynamic Re-routing**: Agents wait or take detours to respect the space-time reservations of higher-priority peers.
*   **Base Deployment Mode**: Simulates a realistic warehouse deployment scenario where agents launch sequentially from a designated zone.

## Controls & Usage

### Camera
*   **Left Click + Drag**: Rotate the camera around the center.
*   **Right Click + Drag**: Pan the camera.
*   **Scroll**: Zoom in/out.

### Simulation Control Panel
*   **Play/Pause**: Toggles the simulation timeline.
*   **Slider**: Scrub through the simulation timeline manually.
*   **Grid Size**: Adjust the volumetric size of the world (from $8^3$ to $40^3$).
*   **Agents**: Set the swarm size (2 to 20 drones).
*   **Deploy from Base**: Toggles between random start locations and a structured warehouse deployment.
*   **Themes**: Generate new environments (City, Tunnels, Random, etc.).

## Technical Stack

*   **Frontend**: React 19, TypeScript, Tailwind CSS
*   **3D Graphics**: Three.js, @react-three/fiber, @react-three/drei
*   **Algorithms**: A* Search Algorithm, Cooperative Prioritized Planning, Space-Time Hashing

## Running Locally

1.  Install dependencies: `npm install`
2.  Start the development server: `npm start`
3.  Open http://localhost:3000 in your browser.
