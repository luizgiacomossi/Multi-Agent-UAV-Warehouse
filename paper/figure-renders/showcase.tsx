// Renders one simulator model on its own, on a white background, for the paper's close-up figures.
// Open /paper/figure-renders/showcase.html?obj=drone (or forklift, pallet) on the dev server.
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { DroneModel, ForkliftModel, RackStructures } from '../../components/VoxelWorld';

const obj = new URLSearchParams(location.search).get('obj') ?? 'drone';

// Camera position and target for each model
const VIEWS: Record<string, { position: [number, number, number]; target: [number, number, number]; fov: number }> = {
  drone: { position: [1.05, 0.75, 1.15], target: [0, 0, 0], fov: 32 },
  forklift: { position: [1.9, 1.45, 2.3], target: [0, 0.55, 0], fov: 32 },
  pallet: { position: [2.9, 2.4, 3.3], target: [0, 0.5, 0], fov: 32 },
};

const Forklift: React.FC = () => {
  const wheelSpinRefs = useRef<(THREE.Group | null)[]>([]);
  const rearSteerRefs = useRef<(THREE.Group | null)[]>([]);
  const carriageRef = useRef<THREE.Group>(null);
  const loadRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.MeshStandardMaterial>(null);
  const beaconLightRef = useRef<THREE.PointLight>(null);
  return (
    <group rotation={[0, -Math.PI / 5, 0]}>
      <ForkliftModel color="#fbbf24" wheelSpinRefs={wheelSpinRefs} rearSteerRefs={rearSteerRefs}
        carriageRef={carriageRef} loadRef={loadRef} beaconRef={beaconRef} beaconLightRef={beaconLightRef} />
    </group>
  );
};

/** One rack column with a camera pallet below and an RFID pallet above, drawn as in the simulator. */
const SENSOR_TAG_SIDES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const Pallet: React.FC<{ y: number; color: string; sensor: 'camera' | 'rfid' }> = ({ y, color, sensor }) => (
  <group position={[0, y, 0]}>
    <mesh position={[0, -0.4, 0]}>
      <boxGeometry args={[0.9, 0.2, 0.9]} />
      <meshStandardMaterial color="#8b5a2b" roughness={0.9} />
    </mesh>
    <mesh>
      <boxGeometry args={[0.8, 0.6, 0.8]} />
      <meshStandardMaterial color={color} roughness={0.7} emissive={new THREE.Color(color).multiplyScalar(0.4)} emissiveIntensity={0.1} />
      {SENSOR_TAG_SIDES.map((rotationY, side) => (
        <group key={side} rotation={[0, rotationY, 0]}>
          <mesh position={[0, 0, 0.41]}>
            <planeGeometry args={[0.4, 0.2]} />
            <meshBasicMaterial color={sensor === 'camera' ? '#3b82f6' : '#a855f7'} />
          </mesh>
        </group>
      ))}
    </mesh>
  </group>
);

const Rack: React.FC = () => (
  <group>
    <RackStructures cells={[{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]} />
    <Pallet y={0} color="#f97316" sensor="camera" />
    <Pallet y={1} color="#fde68a" sensor="rfid" />
  </group>
);

const Scene: React.FC = () => {
  const view = VIEWS[obj];
  return (
    <Canvas camera={{ position: view.position, fov: view.fov }} gl={{ preserveDrawingBuffer: true }}
      onCreated={({ camera }) => camera.lookAt(...view.target)}>
      <color attach="background" args={['#ffffff']} />
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 6, 3]} intensity={1} />
      <Environment preset="city" />
      {obj === 'drone' && <DroneModel color="#ef4444" dead={false} charging={false} spinning={false} activeSensor="camera" />}
      {obj === 'forklift' && <Forklift />}
      {obj === 'pallet' && <Rack />}
    </Canvas>
  );
};

createRoot(document.getElementById('root')!).render(<Scene />);
