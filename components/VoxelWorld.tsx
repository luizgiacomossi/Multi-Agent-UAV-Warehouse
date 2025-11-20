import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Environment, ContactShadows, Stars, Float } from '@react-three/drei';
import * as THREE from 'three';
import { Agent, Position3D, CollisionEvent } from '../types';

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
  
  const currentPos = useMemo(() => {
    if (!agent.path || agent.path.length === 0) return agent.start;
    // Stop moving if destroyed
    const t = isDestroyed ? stopTime : tick;
    return agent.path[Math.min(t, agent.path.length - 1)];
  }, [agent, tick, isDestroyed, stopTime]);

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

  return (
    <group position={[currentPos.x, currentPos.y, currentPos.z]}>
      {/* Drone Body */}
      <mesh scale={0.4}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color={agent.color} emissive={agent.color} emissiveIntensity={2} />
      </mesh>
      
      {/* Propellers */}
      <mesh position={[0.3, 0.1, 0.3]} rotation={[Math.PI/2, 0, 0]}>
        <ringGeometry args={[0.1, 0.15, 8]} />
        <meshBasicMaterial color="white" side={THREE.DoubleSide} opacity={0.5} transparent />
      </mesh>
      <mesh position={[-0.3, 0.1, 0.3]} rotation={[Math.PI/2, 0, 0]}>
         <ringGeometry args={[0.1, 0.15, 8]} />
        <meshBasicMaterial color="white" side={THREE.DoubleSide} opacity={0.5} transparent />
      </mesh>
      <mesh position={[0.3, 0.1, -0.3]} rotation={[Math.PI/2, 0, 0]}>
         <ringGeometry args={[0.1, 0.15, 8]} />
        <meshBasicMaterial color="white" side={THREE.DoubleSide} opacity={0.5} transparent />
      </mesh>
      <mesh position={[-0.3, 0.1, -0.3]} rotation={[Math.PI/2, 0, 0]}>
         <ringGeometry args={[0.1, 0.15, 8]} />
        <meshBasicMaterial color="white" side={THREE.DoubleSide} opacity={0.5} transparent />
      </mesh>

      {/* Label */}
      <Text
        position={[0, 0.8, 0]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      
      <pointLight intensity={1} distance={3} color={agent.color} />
    </group>
  );
};

interface PathLineProps {
  path: Position3D[];
  color: string;
  destructionTime?: number;
}

const PathLine: React.FC<PathLineProps> = ({ path, color, destructionTime }) => {
  if (path.length < 2) return null;
  
  // If destroyed, only show path up to destruction
  const visiblePath = useMemo(() => {
     if (destructionTime !== undefined) {
         return path.slice(0, destructionTime + 1);
     }
     return path;
  }, [path, destructionTime]);

  const points = useMemo(() => visiblePath.map(p => new THREE.Vector3(p.x, p.y, p.z)), [visiblePath]);
  
  if (points.length < 2) return null;

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} opacity={0.4} transparent linewidth={1} />
    </line>
  );
};

interface GoalMarkerProps {
  position: Position3D;
  color: string;
}

const GoalMarker: React.FC<GoalMarkerProps> = ({ position, color }) => {
  return (
    <mesh position={[position.x, position.y, position.z]}>
       <boxGeometry args={[0.8, 0.8, 0.8]} />
       <meshStandardMaterial color={color} wireframe opacity={0.3} transparent />
       <mesh scale={0.2}>
         <octahedronGeometry />
         <meshBasicMaterial color={color} />
       </mesh>
    </mesh>
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

    return (
        <group position={[centerX, -0.45, centerZ]}>
            {/* Main Platform */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[baseSize + 0.5, baseSize + 0.5]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.8} />
            </mesh>
            {/* Stripes or markings could be added here */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                 <planeGeometry args={[baseSize, baseSize]} />
                 <meshStandardMaterial color="#1e293b" />
            </mesh>
            <Text
                position={[0, 0.1, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={baseSize * 0.2}
                color="#f59e0b"
                anchorX="center"
                anchorY="middle"
            >
                BASE
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
        <ambientLight intensity={0.4} />
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
                    
                    {/* Start Marker (ghost) - only show if not base mode to avoid clutter on the base */}
                    {!isBaseEnabled && (
                        <mesh position={[agent.start.x, agent.start.y, agent.start.z]} scale={0.3}>
                            <sphereGeometry />
                            <meshStandardMaterial color={agent.color} opacity={0.3} transparent />
                        </mesh>
                    )}
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