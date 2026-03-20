
import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Environment, ContactShadows, Stars, Float, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Agent, Position3D, SimulationIncident, Forklift, ClusterVisualization } from '../types';
import { Drone } from '../classes/Drone';
import { Warehouse } from '../classes/Warehouse';

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
  batteryEnabled: boolean;
}

const AgentDrone: React.FC<AgentDroneProps> = ({ agent, tick, chargeStations = [], batteryEnabled }) => {
  
  const snapshot = useMemo(() => {
      if (agent instanceof Drone) {
          return agent.getSnapshotAt(tick, chargeStations, batteryEnabled);
      }
      const t = Math.min(tick, agent.path.length - 1);
      return {
          position: agent.path[t] || agent.start,
          battery: agent.maxBattery,
          isDestroyed: false,
          isDeadBattery: false,
          isRecharging: false,
          hasPackage: true
      };
  }, [agent, tick, chargeStations, batteryEnabled]);

  const { position, battery, isDestroyed, isDeadBattery, isRecharging, hasPackage } = snapshot;

  // Ref for falling animation
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
      if (isDeadBattery && groupRef.current && position.y > 0) {
          // Add spin while falling
          groupRef.current.rotation.x += delta * 2;
          groupRef.current.rotation.z += delta * 3;
      }
  });

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
  
  // If falling/dead, color it dark red or grey
  const showDead = isDeadBattery;

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]}>
      <Billboard position={[0, 1.2, 0]}>
          <mesh position={[-0.5 + (batPct/2), 0, 0]}>
             <planeGeometry args={[batPct, 0.15]} />
             <meshBasicMaterial color={isRecharging ? '#3b82f6' : batColor} />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[1.02, 0.17]} />
              <meshBasicMaterial color="#000" />
          </mesh>
          {showDead && <Text position={[0, 0.4, 0]} fontSize={0.4} color="#ef4444">FAILURE</Text>}
          {isRecharging && <Text position={[0, 0.4, 0]} fontSize={0.3} color="#3b82f6">CHARGING</Text>}
      </Billboard>

      <mesh scale={0.4}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial 
            color={showDead ? "#333" : agent.color} 
            emissive={showDead ? "#ef4444" : isRecharging ? "#3b82f6" : agent.color} 
            emissiveIntensity={showDead ? 0.5 : isRecharging ? 1 : 0.5} 
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
                <meshBasicMaterial color={showDead ? "#ef4444" : "white"} side={THREE.DoubleSide} opacity={0.5} transparent />
            </mesh>
        )))}
      </group>

      <Text position={[0, 0.8, 0]} fontSize={0.25} color="white" anchorX="center" anchorY="middle">{agent.name}</Text>
      {!showDead && <pointLight intensity={0.5} distance={3} color={isRecharging ? '#3b82f6' : agent.color} />}
    </group>
  );
};

interface ForkliftMeshProps {
    forklift: Forklift;
    tick: number;
}

const ForkliftMesh: React.FC<ForkliftMeshProps> = ({ forklift, tick }) => {
    // Determine current position based on tick, looping if necessary
    const pathIndex = tick % Math.max(1, forklift.path.length);
    const position = forklift.path[pathIndex] || { x: 0, y: 0, z: 0 };
    
    // Determine heading for rotation
    const nextIndex = (tick + 1) % Math.max(1, forklift.path.length);
    const nextPosition = forklift.path[nextIndex] || position;
    
    // Calculate rotation angle in radians based on direction
    let angle = 0;
    if (nextPosition.x > position.x) angle = -Math.PI / 2;
    else if (nextPosition.x < position.x) angle = Math.PI / 2;
    else if (nextPosition.z > position.z) angle = 0;
    else if (nextPosition.z < position.z) angle = Math.PI;

    return (
        <group position={[position.x, position.y + 0.5, position.z]} rotation={[0, angle, 0]}>
            {/* Main Body */}
            <mesh position={[0, -0.2, 0]}>
                <boxGeometry args={[0.7, 0.6, 0.9]} />
                <meshStandardMaterial color={forklift.color} roughness={0.4} metalness={0.2} />
            </mesh>
            
            {/* Safety Cage (Roof) */}
            <mesh position={[0, 0.3, 0]}>
                <boxGeometry args={[0.6, 0.1, 0.6]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            {[
                [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]
            ].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.1, z]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.4]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
            ))}

            {/* Forks */}
            <mesh position={[0, -0.4, 0.6]}>
                <boxGeometry args={[0.5, 0.05, 0.4]} />
                <meshStandardMaterial color="#silver" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, -0.1, 0.45]}>
                 <boxGeometry args={[0.5, 0.6, 0.05]} />
                 <meshStandardMaterial color="#333" />
            </mesh>

            {/* Payload on Forks */}
            <mesh position={[0, -0.15, 0.6]}>
                <boxGeometry args={[0.4, 0.4, 0.3]} />
                <meshStandardMaterial color="#8b4513" />
            </mesh>

            {/* Warning Light */}
            <mesh position={[0, 0.4, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 0.1]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} />
            </mesh>
            <pointLight position={[0, 0.5, 0]} color="#ef4444" intensity={0.5} distance={2} />

            <Text position={[0, 0.8, 0]} fontSize={0.2} color="white" anchorX="center" anchorY="middle" rotation={[0, -angle, 0]}>
                {forklift.name}
            </Text>
        </group>
    );
};

const PathLine: React.FC<{ agent: Agent; tick: number; clusters: ClusterVisualization[] }> = ({ agent, tick, clusters }) => {
  const buildVisibleSegment = (rawStartTick: number, rawEndTick: number) => {
    const clampedStartTick = Math.max(rawStartTick, tick);
    if (clampedStartTick >= rawEndTick) {
      return { path: [] as Position3D[], startTick: clampedStartTick, endTick: rawEndTick };
    }

    return {
      path: agent.path.slice(clampedStartTick, rawEndTick + 1),
      startTick: clampedStartTick,
      endTick: rawEndTick,
    };
  };

  const visibleSegment = useMemo(() => {
     if (!agent.path || agent.path.length < 2) return { path: [] as Position3D[], startTick: 0, endTick: 0 };
     
     const maxTick = agent.destructionTime !== undefined 
         ? agent.destructionTime 
         : agent.path.length - 1;

     const activeCluster = clusters.find(cluster =>
       cluster.droneId === agent.id &&
       tick >= cluster.startTick &&
       tick <= cluster.endTick
     );

     if (activeCluster) {
       const startTickLine = Math.max(0, activeCluster.startTick);
       const endTickLine = Math.min(maxTick, activeCluster.endTick);
       return buildVisibleSegment(startTickLine, endTickLine);
     }

     const activeTask = (agent.assignedTasksLog || []).find(t => tick >= t.startTick && tick <= t.endTick);

     if (!activeTask) {
       return { path: [] as Position3D[], startTick: 0, endTick: 0 };
     }

     const startTickLine = Math.max(0, activeTask.startTick);
     const endTickLine = Math.min(maxTick, activeTask.endTick);
     return buildVisibleSegment(startTickLine, endTickLine);
  }, [agent, tick, clusters]);

  const visiblePath = visibleSegment.path;

  const points = useMemo(() => visiblePath.map(p => [p.x, p.y, p.z] as [number, number, number]), [visiblePath]);
  const directionMarkers = useMemo(() => {
    if (visiblePath.length < 2) return [];

    const upAxis = new THREE.Vector3(0, 1, 0);

    return visiblePath.slice(0, -1).map((current, idx) => {
      const next = visiblePath[idx + 1];
      const delta = new THREE.Vector3(next.x - current.x, next.y - current.y, next.z - current.z);
      const length = delta.length();

      if (length === 0) {
        return {
          key: `${agent.id}-wait-${idx}`,
          position: [current.x, current.y + 0.18, current.z] as [number, number, number],
          isWait: true,
          quaternion: new THREE.Quaternion(),
        };
      }

      const direction = delta.normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(upAxis, direction);

      return {
        key: `${agent.id}-dir-${idx}`,
        position: [
          current.x + direction.x * 0.18,
          current.y + 0.18 + direction.y * 0.18,
          current.z + direction.z * 0.18,
        ] as [number, number, number],
        isWait: false,
        quaternion,
      };
    });
  }, [agent.id, visiblePath]);
  const taskMarkers = useMemo(() => {
    if (visiblePath.length === 0) return [];

    return (agent.assignedTasksLog || [])
      .filter(task => task.endTick >= visibleSegment.startTick && task.startTick <= visibleSegment.endTick)
      .map((task) => {
        const pathIndex = visiblePath.findIndex(
          p => p.x === task.position.x && p.y === task.position.y && p.z === task.position.z
        );
        const fallbackIndex = Math.max(
          0,
          Math.min(visiblePath.length - 1, task.endTick - visibleSegment.startTick)
        );
        const markerPoint = visiblePath[pathIndex >= 0 ? pathIndex : fallbackIndex];

        return {
          key: `${agent.id}-task-${task.palletId}-${task.endTick}`,
          palletId: task.palletId,
          type: task.type,
          position: [markerPoint.x, markerPoint.y + 0.5, markerPoint.z] as [number, number, number],
        };
      });
  }, [agent.assignedTasksLog, agent.id, visiblePath, visibleSegment.endTick, visibleSegment.startTick]);
  
  if (points.length < 2) return null;
  return (
    <group>
      <Line points={points} color={agent.color} lineWidth={2} opacity={0.6} transparent depthTest={true} />
      {directionMarkers.map((marker) => (
        marker.isWait ? (
          <mesh key={marker.key} position={marker.position}>
            <sphereGeometry args={[0.08, 10, 10]} />
            <meshBasicMaterial color={agent.color} transparent opacity={0.75} depthTest={true} />
          </mesh>
        ) : (
          <group key={marker.key} position={marker.position} quaternion={marker.quaternion}>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.22, 8]} />
              <meshBasicMaterial color={agent.color} transparent opacity={0.85} depthTest={true} />
            </mesh>
            <mesh position={[0, 0.28, 0]}>
              <coneGeometry args={[0.09, 0.18, 10]} />
              <meshBasicMaterial color={agent.color} transparent opacity={0.95} depthTest={true} />
            </mesh>
          </group>
        )
      ))}
      {taskMarkers.map((marker) => (
        <group key={marker.key} position={marker.position}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
            <ringGeometry args={[0.14, 0.22, 20]} />
            <meshBasicMaterial color={agent.color} transparent opacity={0.85} side={THREE.DoubleSide} depthTest={true} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <planeGeometry args={[0.52, 0.22]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.9} side={THREE.DoubleSide} depthTest={true} />
          </mesh>
          <Text
            position={[0, 0.02, 0.01]}
            fontSize={0.09}
            color={agent.color}
            anchorX="center"
            anchorY="middle"
          >
            {marker.type === 'rfid' ? 'RFID' : 'SCAN'}
          </Text>
        </group>
      ))}
    </group>
  );
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

const ClusterOverlay: React.FC<{ cluster: ClusterVisualization }> = ({ cluster }) => {
  const points = useMemo(() => cluster.positions.map(p => [p.x, p.y + 0.15, p.z] as [number, number, number]), [cluster.positions]);

  return (
    <group>
      {points.map((point, idx) => (
        <Line
          key={`${cluster.id}-${idx}`}
          points={[
            [cluster.centroid.x, cluster.centroid.y + 0.35, cluster.centroid.z],
            point
          ]}
          color={cluster.color}
          lineWidth={1.5}
          opacity={0.45}
          transparent
        />
      ))}

      <mesh position={[cluster.centroid.x, cluster.centroid.y + 0.2, cluster.centroid.z]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={cluster.color} emissive={cluster.color} emissiveIntensity={0.8} transparent opacity={0.9} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cluster.centroid.x, cluster.centroid.y - 0.35, cluster.centroid.z]}>
        <ringGeometry args={[0.55, 0.8, 32]} />
        <meshBasicMaterial color={cluster.color} transparent opacity={0.28} side={THREE.DoubleSide} />
      </mesh>

      <Text
        position={[cluster.centroid.x, cluster.centroid.y + 0.75, cluster.centroid.z]}
        fontSize={0.2}
        color={cluster.color}
        anchorX="center"
        anchorY="middle"
      >
        {`${cluster.droneName} Cluster`}
      </Text>
    </group>
  );
};

const GridBase: React.FC<{ size: Position3D }> = ({ size }) => (
    <gridHelper args={[size.x, size.x, 0x444444, 0x222222]} position={[(size.x-1)/2, -0.51, (size.z-1)/2]} />
);

interface WarehouseBaseProps {
    warehouse: Warehouse;
}

const WarehouseBase: React.FC<WarehouseBaseProps> = ({ warehouse }) => {
    const { baseSize, position } = warehouse;
    const centerX = position.x + (baseSize - 1) / 2;
    const centerZ = position.z + (baseSize - 1) / 2;
    
    const crates = useMemo(() => Array.from({length: Math.floor(warehouse.capacity * 0.7)}).map(() => ({
        x: (Math.random() - 0.5) * baseSize,
        z: (Math.random() - 0.5) * baseSize,
        rot: Math.random() * Math.PI,
        color: Math.random() > 0.5 ? '#cd853f' : '#8b4513'
    })), [baseSize, warehouse.capacity]);

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
  incidents: SimulationIncident[];
  tick: number;
  warehouse: Warehouse | null;
  chargeStations?: Position3D[];
  batteryEnabled: boolean;
  forklifts?: Forklift[];
  pallets?: { id: string; position: Position3D; weight: number; payload_type: string; }[];
  clusters?: ClusterVisualization[];
  scannedPalletIds?: Set<string>;
  activePalletIds?: Set<string>;
}

const VoxelWorld: React.FC<VoxelWorldProps> = ({ 
    gridSize, obstacles, agents, incidents, tick, warehouse, chargeStations = [], batteryEnabled, forklifts = [], pallets = [], clusters = [],
    scannedPalletIds = new Set(), activePalletIds = new Set()
}) => {
  const camPos = useMemo(() => new THREE.Vector3(gridSize.x * 1.5, gridSize.y * 1.2, gridSize.z * 1.5), [gridSize]);
  const center = useMemo(() => new THREE.Vector3((gridSize.x-1)/2, (gridSize.y-1)/2, (gridSize.z-1)/2), [gridSize]);
  
  // Only show collisions in the visualizer, not battery deaths
  const visibleCollisions = useMemo(() => 
    incidents.filter(i => i.type === 'collision' && i.time <= tick), 
  [incidents, tick]);

  const visibleClusters = useMemo(
    () => clusters.filter(cluster => tick >= cluster.startTick && tick <= cluster.endTick),
    [clusters, tick]
  );

  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: camPos, fov: 45 }} shadows>
        <color attach="background" args={['#0f172a']} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.4} />
        <pointLight position={[gridSize.x, gridSize.y * 2, gridSize.z]} intensity={1} castShadow />
        <Environment preset="city" />

        <OrbitControls 
           makeDefault 
           target={center}
           minPolarAngle={0}
           maxPolarAngle={Math.PI / 1.8}
           maxDistance={gridSize.x * 3}
        />

        <GridBase size={gridSize} />
        
        <ObstacleField obstacles={obstacles} />

        {/* Render pallets with state-based colors */}
        {pallets.map((plt) => {
            const isScanned = scannedPalletIds.has(plt.id);
            const isActive  = activePalletIds.has(plt.id);

            // Box color: green=scanned, cyan=active target, gold=unchecked
            const boxColor   = isScanned ? '#22c55e' : isActive ? '#06b6d4' : '#cda434';
            const emissive   = isScanned ? '#166534' : isActive ? '#0e7490' : '#78350f';
            const emissiveI  = isActive ? 0.6 : isScanned ? 0.3 : 0.1;
            const baseColor  = isScanned ? '#14532d' : '#8b5a2b';

            return (
            <group key={plt.id} position={[plt.position.x, plt.position.y, plt.position.z]}>
                {/* Active glow ring */}
                {isActive && (
                  <mesh rotation={[-Math.PI / 2, 0, tick * 0.05]} position={[0, -0.3, 0]}>
                    <ringGeometry args={[0.55, 0.65, 32]} />
                    <meshBasicMaterial color="#06b6d4" transparent opacity={0.7} side={2} />
                  </mesh>
                )}
                {/* Wood Base */}
                <mesh position={[0, -0.4, 0]}>
                    <boxGeometry args={[0.9, 0.2, 0.9]} />
                    <meshStandardMaterial color={baseColor} roughness={0.9} />
                </mesh>
                {/* Product Box */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[0.8, 0.6, 0.8]} />
                    <meshStandardMaterial color={boxColor} roughness={0.7} emissive={emissive} emissiveIntensity={emissiveI} />
                    {/* Sensor type indicator */}
                    <mesh position={[0, 0, 0.41]}>
                        <planeGeometry args={[0.4, 0.2]} />
                        <meshBasicMaterial color={plt.payload_type === 'camera' ? '#3b82f6' : '#a855f7'} />
                    </mesh>
                </mesh>
                {/* Scanned checkmark label */}
                {isScanned && (
                  <Text position={[0, 0.6, 0]} fontSize={0.25} color="#4ade80" anchorX="center" anchorY="middle">
                    ✓
                  </Text>
                )}
            </group>
            );
        })}
        
        {chargeStations.length > 0 && <ChargingStation positions={chargeStations} />}
        
        {warehouse && <WarehouseBase warehouse={warehouse} />}

        {visibleClusters.map((cluster) => (
          <ClusterOverlay key={cluster.id} cluster={cluster} />
        ))}

        {agents.map((agent) => (
          <React.Fragment key={agent.id}>
             <AgentDrone 
                agent={agent} 
                tick={tick} 
                chargeStations={chargeStations}
                batteryEnabled={batteryEnabled}
             />
             <PathLine 
                agent={agent}
                tick={tick}
                clusters={visibleClusters}
             />
             {agent.goal && <GoalMarker position={agent.goal} color={agent.color} />}
          </React.Fragment>
        ))}

        {forklifts.map((fl) => (
             <React.Fragment key={fl.id}>
                 <ForkliftMesh forklift={fl} tick={tick} />
             </React.Fragment>
        ))}

        {visibleCollisions.map((col) => (
            <CollisionMarker key={col.id} position={col.position} />
        ))}

        <ContactShadows opacity={0.5} scale={gridSize.x * 2} blur={2} far={4} />
      </Canvas>
    </div>
  );
};

export default VoxelWorld;
