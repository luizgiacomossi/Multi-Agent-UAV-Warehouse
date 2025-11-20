
import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Environment, ContactShadows, Stars, Float, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Agent, Position3D, CollisionEvent, ENERGY_COSTS } from '../types';

// -- Subcomponents --

// Optimized ObstacleField using InstancedMesh for performance
interface ObstacleFieldProps {
  obstacles: Position3D[];
}

const ObstacleField: React.FC<ObstacleFieldProps> = ({ obstacles }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  
  useLayoutEffect(() => {
    const temp = new THREE.Object3D();
    obstacles.forEach((pos, i) => {
      temp.position.set(pos.x, pos.y, pos.z);
      temp.scale.set(0.95, 0.95, 0.95);
      temp.updateMatrix();
      meshRef.current.setMatrixAt(i, temp.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [obstacles]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, obstacles.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color="#334155" 
        roughness={0.2} 
        metalness={0.5} 
      />
    </instancedMesh>
  );
};

interface AgentDroneProps {
  agent: Agent;
  tick: number;
}

const AgentDrone: React.FC<AgentDroneProps> = ({ agent, tick }) => {
  // Calculate destruction state
  const isDestroyed = agent.destructionTime !== undefined && tick >= agent.destructionTime;
  const stopTime = agent.destructionTime !== undefined ? agent.destructionTime : agent.path.length - 1;
  
  // Calculate Real-time Battery
  const currentBattery = useMemo(() => {
     if (!agent.path || agent.path.length === 0) return agent.maxBattery;
     
     let consumed = 0;
     // Only calculate up to current tick or when path ends
     const currentTickLimit = Math.min(tick, agent.path.length - 1);
     
     for (let i = 1; i <= currentTickLimit; i++) {
         const prev = agent.path[i-1];
         const curr = agent.path[i];
         if (prev.x === curr.x && prev.y === curr.y && prev.z === curr.z) {
             consumed += ENERGY_COSTS.WAIT;
         } else {
             consumed += ENERGY_COSTS.MOVE;
         }
     }
     return Math.max(0, agent.maxBattery - consumed);
  }, [agent.path, agent.maxBattery, tick]);

  const isDeadBattery = currentBattery <= 0;
  const showDead = isDeadBattery && !isDestroyed;

  // Determine package visibility: Visible if not delivered yet and not destroyed
  const hasPackage = useMemo(() => {
     if (isDestroyed) return false;
     if (agent.deliveryTime === undefined) return true; // Blocked or moving indefinitely
     return tick < agent.deliveryTime;
  }, [agent.deliveryTime, tick, isDestroyed]);

  const currentPos = useMemo(() => {
    if (!agent.path || agent.path.length === 0) return agent.start;
    // Stop moving if destroyed or out of battery
    let t = tick;
    if (isDestroyed) t = stopTime;
    else if (isDeadBattery) t = Math.min(t, agent.path.length - 1); // It stops where it is
    
    return agent.path[Math.min(t, agent.path.length - 1)];
  }, [agent, tick, isDestroyed, stopTime, isDeadBattery]);

  if (isDestroyed) {
      return (
        <group position={[currentPos.x, currentPos.y, currentPos.z]}>
            <Float speed={2} rotationIntensity={2} floatIntensity={0.5}>
                <mesh>
                    <dodecahedronGeometry args={[0.4]} />
                    <meshStandardMaterial color="#333" roughness={0.8} />
                </mesh>
                <mesh scale={1.2}>
                    <dodecahedronGeometry args={[0.35]} />
                    <meshBasicMaterial color="#ef4444" wireframe />
                </mesh>
            </Float>
            {/* Smoke particle effect simulation (simple static) */}
            <mesh position={[0, 0.5, 0]} scale={0.5}>
                <dodecahedronGeometry args={[0.2]} />
                <meshStandardMaterial color="#555" transparent opacity={0.5} />
            </mesh>
             <Text
                position={[0, 1, 0]}
                fontSize={0.3}
                color="#ef4444"
                anchorX="center"
                anchorY="middle"
            >
                DESTROYED
            </Text>
        </group>
      );
  }

  const batPct = currentBattery / agent.maxBattery;
  const batColor = batPct > 0.5 ? '#22c55e' : batPct > 0.2 ? '#eab308' : '#ef4444';

  return (
    <group position={[currentPos.x, currentPos.y, currentPos.z]}>
      {/* Battery Bar */}
      <Billboard position={[0, 1.2, 0]}>
          <mesh position={[-0.5 + (batPct/2), 0, 0]}>
             <planeGeometry args={[batPct, 0.15]} />
             <meshBasicMaterial color={batColor} />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[1.02, 0.17]} />
              <meshBasicMaterial color="#000" />
          </mesh>
          {showDead && (
             <Text position={[0, 0.4, 0]} fontSize={0.4} color="#ef4444">NO POWER</Text>
          )}
      </Billboard>

      {/* Drone Body */}
      <mesh scale={0.4}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial 
            color={showDead ? "#333" : agent.color} 
            emissive={showDead ? "#000" : agent.color} 
            emissiveIntensity={showDead ? 0 : 0.5} 
        />
      </mesh>
      
      {/* The Package */}
      {hasPackage && (
        <mesh position={[0, -0.45, 0]}>
            <boxGeometry args={[0.4, 0.3, 0.4]} />
            <meshStandardMaterial color="#8B4513" roughness={0.8} />
            {/* Tape */}
            <mesh position={[0, 0, 0.201]} scale={[1.01, 0.2, 1]}>
                <planeGeometry args={[0.4, 0.3]} />
                <meshBasicMaterial color="#d4b483" />
            </mesh>
        </mesh>
      )}

      {/* Propellers - Spin only if active */}
      <group>
        {[1, -1].map(i => [1, -1].map(j => (
            <mesh key={`${i}-${j}`} position={[0.3 * i, 0.1, 0.3 * j]} rotation={[Math.PI/2, 0, 0]}>
                <ringGeometry args={[0.1, 0.15, 8]} />
                <meshBasicMaterial color={showDead ? "#555" : "white"} side={THREE.DoubleSide} opacity={0.5} transparent />
            </mesh>
        )))}
      </group>

      {/* Label */}
      <Text
        position={[0, 0.8, 0]}
        fontSize={0.25}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      
      {!showDead && <pointLight intensity={0.5} distance={3} color={agent.color} />}
    </group>
  );
};

interface PathLineProps {
  path: Position3D[];
  color: string;
  destructionTime?: number;
}

const PathLine: React.FC<PathLineProps> = ({ path, color, destructionTime }) => {
  const visiblePath = useMemo(() => {
     if (!path || path.length < 2) return [];
     if (destructionTime !== undefined) {
         return path.slice(0, destructionTime + 1);
     }
     return path;
  }, [path, destructionTime]);

  const points = useMemo(() => visiblePath.map(p => [p.x, p.y, p.z] as [number, number, number]), [visiblePath]);
  
  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={2}
      opacity={0.2}
      transparent
      depthTest={true}
    />
  );
};

interface GoalMarkerProps {
  position: Position3D;
  color: string;
}

const GoalMarker: React.FC<GoalMarkerProps> = ({ position, color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
        ref.current.rotation.y = state.clock.elapsedTime;
    }
  });

  return (
    <group position={[position.x, position.y, position.z]}>
       {/* Drop Zone Ring */}
       <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
           <ringGeometry args={[0.3, 0.4, 32]} />
           <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.6} />
       </mesh>
       
       {/* Holographic Box Area */}
       <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color={color} wireframe transparent opacity={0.3} />
       </mesh>

       {/* Floating Icon */}
       <group ref={ref}>
          <mesh position={[0, 0.5, 0]} scale={0.2}>
             <octahedronGeometry />
             <meshBasicMaterial color={color} />
          </mesh>
       </group>
    </group>
  );
};

interface CollisionMarkerProps {
    position: Position3D;
}

const CollisionMarker: React.FC<CollisionMarkerProps> = ({ position }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.05;
            const scale = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.2;
            meshRef.current.scale.setScalar(scale);
        }
    });

    return (
        <group position={[position.x, position.y, position.z]}>
             <mesh ref={meshRef}>
                <boxGeometry args={[1.1, 1.1, 1.1]} />
                <meshBasicMaterial color="#ff0000" wireframe transparent opacity={0.8} />
            </mesh>
            <Text
                position={[0, 1.2, 0]}
                fontSize={0.5}
                color="#ff4444"
                anchorX="center"
                anchorY="middle"
            >
                COLLISION
            </Text>
        </group>
    );
}

interface GridBaseProps {
  size: Position3D;
}

const GridBase: React.FC<GridBaseProps> = ({ size }) => {
    return (
        <gridHelper 
            args={[size.x, size.x, 0x444444, 0x222222]} 
            position={[(size.x-1)/2, -0.51, (size.z-1)/2]} 
        />
    );
};

interface WarehouseBaseProps {
    agentCount: number;
}

const WarehouseBase: React.FC<WarehouseBaseProps> = ({ agentCount }) => {
    const baseSize = Math.ceil(Math.sqrt(agentCount));
    const centerX = (baseSize - 1) / 2;
    const centerZ = (baseSize - 1) / 2;

    // Generate some static crates
    const crates = useMemo(() => {
        const items = [];
        for(let i=0; i<5; i++) {
            items.push({
                x: (Math.random() - 0.5) * baseSize,
                z: (Math.random() - 0.5) * baseSize,
                rot: Math.random() * Math.PI,
                color: Math.random() > 0.5 ? '#cd853f' : '#8b4513'
            });
        }
        return items;
    }, [baseSize]);

    return (
        <group position={[centerX, -0.45, centerZ]}>
            {/* Main Platform */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[baseSize + 1, baseSize + 1]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.8} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                 <planeGeometry args={[baseSize + 0.2, baseSize + 0.2]} />
                 <meshStandardMaterial color="#1e293b" />
            </mesh>

            {/* Cargo Crates */}
            {crates.map((crate, i) => (
                <mesh key={i} position={[crate.x, 0.3, crate.z]} rotation={[0, crate.rot, 0]}>
                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                    <meshStandardMaterial color={crate.color} />
                </mesh>
            ))}

            <Text
                position={[0, 0.1, baseSize/2 + 0.5]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.4}
                color="#f59e0b"
                anchorX="center"
                anchorY="middle"
            >
                DISTRIBUTION CENTER
            </Text>
        </group>
    );
}

// -- Main Component --

interface VoxelWorldProps {
  gridSize: Position3D;
  obstacles: Position3D[];
  agents: Agent[];
  collisions: CollisionEvent[];
  tick: number;
  isBaseEnabled?: boolean;
  agentCount?: number;
}

const VoxelWorld: React.FC<VoxelWorldProps> = ({ 
    gridSize, 
    obstacles, 
    agents, 
    collisions, 
    tick, 
    isBaseEnabled = false,
    agentCount = 8 
}) => {
  
  // Adjust camera based on grid size
  const camPos = useMemo(() => 
    new THREE.Vector3(gridSize.x * 1.5, gridSize.y * 1.2, gridSize.z * 1.5), 
  [gridSize]);

  const center = useMemo(() => 
    new THREE.Vector3((gridSize.x-1)/2, (gridSize.y-1)/2, (gridSize.z-1)/2), 
  [gridSize]);

  // Filter active collisions for current tick
  const activeCollisions = useMemo(() => 
      collisions.filter(c => c.time === tick), 
  [collisions, tick]);

  return (
    <div className="w-full h-full bg-slate-900 relative">
      <Canvas
        camera={{ position: camPos, fov: 45 }}
        shadows
        dpr={[1, 2]}
      >
        <OrbitControls target={center} makeDefault />
        <ambientLight intensity={0.6} />
        <pointLight position={[gridSize.x, gridSize.y * 2, gridSize.z]} intensity={0.8} castShadow />
        <Environment preset="city" />
        <Stars radius={200} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

        <group>
            {/* Optimized Obstacles */}
            <ObstacleField obstacles={obstacles} />

            {/* Base Warehouse Marker */}
            {isBaseEnabled && <WarehouseBase agentCount={agentCount} />}

            {/* Agents */}
            {agents.map((agent) => (
                <React.Fragment key={agent.id}>
                    <AgentDrone agent={agent} tick={tick} />
                    <PathLine path={agent.path} color={agent.color} destructionTime={agent.destructionTime} />
                    <GoalMarker position={agent.goal} color={agent.color} />
                </React.Fragment>
            ))}
            
            {/* Potential Collisions */}
            {activeCollisions.map((col, idx) => (
                <CollisionMarker key={`col-${col.time}-${idx}`} position={col.position} />
            ))}

             <GridBase size={gridSize} />
        </group>

        <ContactShadows position={[0, -0.6, 0]} opacity={0.5} scale={Math.max(gridSize.x, gridSize.z) * 2} blur={2} far={4.5} />
      </Canvas>
      
      <div className="absolute bottom-4 right-4 text-xs text-slate-500 pointer-events-none select-none">
         Left Click: Rotate | Right Click: Pan | Scroll: Zoom
      </div>
    </div>
  );
};

export default VoxelWorld;
