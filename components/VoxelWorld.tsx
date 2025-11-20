import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Environment, ContactShadows, Stars, Float, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Agent, Position3D, CollisionEvent } from '../types';
import { Drone } from '../classes/Drone';

// -- Subcomponents --

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
      <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.5} />
    </instancedMesh>
  );
};

interface ChargingStationProps {
    positions: Position3D[];
}

const ChargingStation: React.FC<ChargingStationProps> = ({ positions }) => {
    return (
        <group>
            {positions.map((pos, i) => (
                <group key={i} position={[pos.x, pos.y - 0.45, pos.z]}>
                    <mesh>
                        <cylinderGeometry args={[0.4, 0.4, 0.1, 16]} />
                        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.5} />
                    </mesh>
                    <pointLight distance={2} intensity={1} color="#10b981" />
                    <Text position={[0, 0.5, 0]} fontSize={0.2} color="#10b981" anchorX="center" anchorY="middle">CHARGE</Text>
                </group>
            ))}
        </group>
    );
}

interface AgentDroneProps {
  agent: Agent;
  tick: number;
  chargeStations?: Position3D[];
}

const AgentDrone: React.FC<AgentDroneProps> = ({ agent, tick, chargeStations = [] }) => {
  
  // Use Class method if available (preserving OOP), else fallback to defaults
  const snapshot = useMemo(() => {
      if (agent instanceof Drone) {
          return agent.getSnapshotAt(tick, chargeStations);
      }
      // Fallback for plain objects (should not happen with new architecture but safe to have)
      const t = Math.min(tick, agent.path.length - 1);
      return {
          position: agent.path[t] || agent.start,
          battery: agent.maxBattery,
          isDestroyed: false,
          isDeadBattery: false,
          isRecharging: false,
          hasPackage: true
      };
  }, [agent, tick, chargeStations]);

  const { position, battery, isDestroyed, isDeadBattery, isRecharging, hasPackage } = snapshot;

  if (isDestroyed) {
      return (
        <group position={[position.x, position.y, position.z]}>
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
             <Text position={[0, 1, 0]} fontSize={0.3} color="#ef4444" anchorX="center" anchorY="middle">DESTROYED</Text>
        </group>
      );
  }

  const batPct = Math.max(0, battery / agent.maxBattery);
  const batColor = batPct > 0.5 ? '#22c55e' : batPct > 0.2 ? '#eab308' : '#ef4444';
  const showDead = isDeadBattery;

  return (
    <group position={[position.x, position.y, position.z]}>
      <Billboard position={[0, 1.2, 0]}>
          <mesh position={[-0.5 + (batPct/2), 0, 0]}>
             <planeGeometry args={[batPct, 0.15]} />
             <meshBasicMaterial color={isRecharging ? '#3b82f6' : batColor} />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[1.02, 0.17]} />
              <meshBasicMaterial color="#000" />
          </mesh>
          {showDead && <Text position={[0, 0.4, 0]} fontSize={0.4} color="#ef4444">NO POWER</Text>}
          {isRecharging && <Text position={[0, 0.4, 0]} fontSize={0.3} color="#3b82f6">CHARGING</Text>}
      </Billboard>

      <mesh scale={0.4}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial 
            color={showDead ? "#333" : agent.color} 
            emissive={showDead ? "#000" : isRecharging ? "#3b82f6" : agent.color} 
            emissiveIntensity={showDead ? 0 : isRecharging ? 1 : 0.5} 
        />
      </mesh>
      
      {hasPackage && (
        <mesh position={[0, -0.45, 0]}>
            <boxGeometry args={[0.4, 0.3, 0.4]} />
            <meshStandardMaterial color="#8B4513" roughness={0.8} />
            <mesh position={[0, 0, 0.201]} scale={[1.01, 0.2, 1]}>
                <planeGeometry args={[0.4, 0.3]} />
                <meshBasicMaterial color="#d4b483" />
            </mesh>
        </mesh>
      )}

      <group>
        {[1, -1].map(i => [1, -1].map(j => (
            <mesh key={`${i}-${j}`} position={[0.3 * i, 0.1, 0.3 * j]} rotation={[Math.PI/2, 0, 0]}>
                <ringGeometry args={[0.1, 0.15, 8]} />
                <meshBasicMaterial color={showDead ? "#555" : "white"} side={THREE.DoubleSide} opacity={0.5} transparent />
            </mesh>
        )))}
      </group>

      <Text position={[0, 0.8, 0]} fontSize={0.25} color="white" anchorX="center" anchorY="middle">{agent.name}</Text>
      {!showDead && <pointLight intensity={0.5} distance={3} color={isRecharging ? '#3b82f6' : agent.color} />}
    </group>
  );
};

const PathLine: React.FC<{ path: Position3D[]; color: string; destructionTime?: number }> = ({ path, color, destructionTime }) => {
  const visiblePath = useMemo(() => {
     if (!path || path.length < 2) return [];
     if (destructionTime !== undefined) return path.slice(0, destructionTime + 1);
     return path;
  }, [path, destructionTime]);

  const points = useMemo(() => visiblePath.map(p => [p.x, p.y, p.z] as [number, number, number]), [visiblePath]);
  if (points.length < 2) return null;
  return <Line points={points} color={color} lineWidth={2} opacity={0.2} transparent depthTest={true} />;
};

const GoalMarker: React.FC<{ position: Position3D; color: string }> = ({ position, color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => { if (ref.current) ref.current.rotation.y = state.clock.elapsedTime; });

  return (
    <group position={[position.x, position.y, position.z]}>
       <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
           <ringGeometry args={[0.3, 0.4, 32]} />
           <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.6} />
       </mesh>
       <mesh>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color={color} wireframe transparent opacity={0.3} />
       </mesh>
       <group ref={ref}>
          <mesh position={[0, 0.5, 0]} scale={0.2}>
             <octahedronGeometry />
             <meshBasicMaterial color={color} />
          </mesh>
       </group>
    </group>
  );
};

const CollisionMarker: React.FC<{ position: Position3D }> = ({ position }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.05;
            meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 10) * 0.2);
        }
    });
    return (
        <group position={[position.x, position.y, position.z]}>
             <mesh ref={meshRef}>
                <boxGeometry args={[1.1, 1.1, 1.1]} />
                <meshBasicMaterial color="#ff0000" wireframe transparent opacity={0.8} />
            </mesh>
            <Text position={[0, 1.2, 0]} fontSize={0.5} color="#ff4444" anchorX="center" anchorY="middle">COLLISION</Text>
        </group>
    );
}

const GridBase: React.FC<{ size: Position3D }> = ({ size }) => (
    <gridHelper args={[size.x, size.x, 0x444444, 0x222222]} position={[(size.x-1)/2, -0.51, (size.z-1)/2]} />
);

const WarehouseBase: React.FC<{ agentCount: number }> = ({ agentCount }) => {
    const baseSize = Math.ceil(Math.sqrt(agentCount));
    const centerX = (baseSize - 1) / 2;
    const centerZ = (baseSize - 1) / 2;
    const crates = useMemo(() => Array.from({length:5}).map(() => ({
        x: (Math.random() - 0.5) * baseSize,
        z: (Math.random() - 0.5) * baseSize,
        rot: Math.random() * Math.PI,
        color: Math.random() > 0.5 ? '#cd853f' : '#8b4513'
    })), [baseSize]);

    return (
        <group position={[centerX, -0.45, centerZ]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[baseSize + 1, baseSize + 1]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.8} />
            </mesh>
            {crates.map((crate, i) => (
                <mesh key={i} position={[crate.x, 0.3, crate.z]} rotation={[0, crate.rot, 0]}>
                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                    <meshStandardMaterial color={crate.color} />
                </mesh>
            ))}
            <Text position={[0, 0.1, baseSize/2 + 0.5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.4} color="#f59e0b" anchorX="center" anchorY="middle">DISTRIBUTION CENTER</Text>
        </group>
    );
}

interface VoxelWorldProps {
  gridSize: Position3D;
  obstacles: Position3D[];
  agents: Agent[];
  collisions: CollisionEvent[];
  tick: number;
  isBaseEnabled?: boolean;
  agentCount?: number;
  chargeStations?: Position3D[];
}

const VoxelWorld: React.FC<VoxelWorldProps> = ({ 
    gridSize, obstacles, agents, collisions, tick, isBaseEnabled = false, agentCount = 8, chargeStations = []
}) => {
  const camPos = useMemo(() => new THREE.Vector3(gridSize.x * 1.5, gridSize.y * 1.2, gridSize.z * 1.5), [gridSize]);
  const center = useMemo(() => new THREE.Vector3((gridSize.x-1)/2, (gridSize.y-1)/2, (gridSize.z-1)/2), [gridSize]);
  const activeCollisions = useMemo(() => collisions.filter(c => c.time === tick), [collisions, tick]);

  return (
    <div className="w-full h-full bg-slate-900 relative">
      <Canvas camera={{ position: camPos, fov: 45 }} shadows dpr={[1, 2]}>
        <OrbitControls target={center} makeDefault />
        <ambientLight intensity={0.6} />
        <pointLight position={[gridSize.x, gridSize.y * 2, gridSize.z]} intensity={0.8} castShadow />
        <Environment preset="city" />
        <Stars radius={200} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

        <group>
            <ObstacleField obstacles={obstacles} />
            <ChargingStation positions={chargeStations} />
            {isBaseEnabled && <WarehouseBase agentCount={agentCount} />}

            {agents.map((agent) => (
                <React.Fragment key={agent.id}>
                    <AgentDrone agent={agent} tick={tick} chargeStations={chargeStations} />
                    <PathLine path={agent.path} color={agent.color} destructionTime={agent.destructionTime} />
                    <GoalMarker position={agent.goal} color={agent.color} />
                </React.Fragment>
            ))}
            
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