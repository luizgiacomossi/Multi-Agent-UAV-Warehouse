
import React, { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Environment, ContactShadows, Stars, Float, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Agent, Position3D, SimulationIncident, Forklift, ClusterVisualization } from '../types';
import { Drone } from '../classes/Drone';
import { describeDroneActivity, DroneActivityKind } from '../classes/DroneActivity';
import { PLAYBACK_TICK_MS } from '../SimulationConfig';
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
          <Billboard position={[0, 0.5, 0]}>
            <Text fontSize={0.2} color="#10b981" anchorX="center" anchorY="middle">{`CHARGE S${i + 1}`}</Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}


// -- Drone model --

const CAMERA_COLOR = '#3b82f6'; // same colours as the sensor tags on the pallets
const RFID_COLOR = '#a855f7';
const SENSOR_IDLE_COLOR = '#475569';
/** Rotor positions: the four ends of an X frame (local +z is the drone's front). */
const ROTOR_ANGLES = [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4];
const ARM_LENGTH = 0.3;
/** Size of the drone model (1 = rotor tips about 0.86 cells apart). */
const DRONE_SCALE = 1.6;
/** Ticks the scan beam stays visible after the scan tick, so it can be seen during playback. */
const SCAN_BEAM_TICKS = 3;
/** Height of the floor surface (cells are centred on integer y). */
const FLOOR_Y = -0.5;
/** Visual speed in cells per second for a playback of `tickMs` per tick: a bit faster, so movers settle on each cell. */
const glideSpeedFor = (tickMs: number) => 1.15 * 1000 / tickMs;
/** Jumps longer than this (scrubbing the timeline, a new plan) snap instead of gliding. */
const SNAP_DISTANCE = 2.5;
/** Lean (radians) per cell/second of speed, and the maximum lean. */
const LEAN_PER_SPEED = 0.04;
const MAX_LEAN = 0.35;
/** How fast lean and heading follow their targets (1/s). */
const LEAN_RESPONSE = 10;
const TURN_RESPONSE = 8;
/** The altitude guide starts this far below the drone's centre (under the skids). */
const GUIDE_TOP = 0.2;
/** Hover bob while airborne. */
const BOB_AMPLITUDE = 0.04;
const BOB_SPEED = 3;

/** Activities in which the drone is on the ground with its rotors stopped. */
const GROUNDED: DroneActivityKind[] = ['docked', 'charging', 'complete', 'depleted', 'crashed', 'blocked'];

/**
 * Yaw (about y) of the direction of travel at `tick`: the next horizontal move, else the last
 * one, so a drone waiting or climbing keeps facing where it was going. 0 = facing +z.
 */
function headingAt(path: Position3D[], tick: number): number {
  const t = Math.min(tick, path.length - 1);
  const yawBetween = (a: Position3D, b: Position3D) =>
    a.x !== b.x || a.z !== b.z ? Math.atan2(b.x - a.x, b.z - a.z) : null;
  for (let i = t; i < path.length - 1; i++) {
    const yaw = yawBetween(path[i], path[i + 1]);
    if (yaw !== null) return yaw;
    if (i - t > 5) break; // only look a few ticks ahead
  }
  for (let i = t; i > 0; i--) {
    const yaw = yawBetween(path[i - 1], path[i]);
    if (yaw !== null) return yaw;
  }
  return 0;
}

/** A spinning two-blade propeller; stopped rotors show their blades, spinning ones a faint disc. */
const Propeller: React.FC<{ spinning: boolean; direction: number }> = ({ spinning, direction }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (spinning && ref.current) ref.current.rotation.y += delta * 40 * direction;
  });
  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[0.26, 0.008, 0.035]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={spinning ? 0.35 : 0.9} />
      </mesh>
      {spinning && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.13, 20]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

interface DroneModelProps {
  color: string;
  dead: boolean;
  charging: boolean;
  spinning: boolean;
  /** Sensor in use for the current task, if any. */
  activeSensor?: string;
}

/** Quadcopter: X frame with four rotors, front (white) and rear (red) lights, camera and RFID sensors. */
const DroneModel: React.FC<DroneModelProps> = ({ color, dead, charging, spinning, activeSensor }) => {
  const bodyColor = dead ? '#334155' : color;
  const glow = dead ? '#ef4444' : charging ? '#3b82f6' : color;
  const cameraColor = activeSensor === 'camera' ? CAMERA_COLOR : SENSOR_IDLE_COLOR;
  const rfidColor = activeSensor === 'rfid' ? RFID_COLOR : SENSOR_IDLE_COLOR;
  return (
    <group>
      {/* Body and canopy */}
      <mesh>
        <boxGeometry args={[0.22, 0.09, 0.32]} />
        <meshStandardMaterial color={bodyColor} emissive={glow} emissiveIntensity={charging ? 0.8 : 0.25} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.06, 0.02]} scale={[1, 0.55, 1.3]}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.2} />
      </mesh>

      {/* Arms, motors and propellers */}
      {ROTOR_ANGLES.map((angle, i) => {
        const x = Math.sin(angle) * ARM_LENGTH;
        const z = Math.cos(angle) * ARM_LENGTH;
        return (
          <group key={i}>
            <mesh position={[x / 2, 0, z / 2]} rotation={[0, angle, 0]}>
              <boxGeometry args={[0.035, 0.03, ARM_LENGTH]} />
              <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[x, 0.03, z]}>
              <cylinderGeometry args={[0.04, 0.045, 0.07, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
            </mesh>
            <group position={[x, 0.075, z]}>
              <Propeller spinning={spinning} direction={i % 2 === 0 ? 1 : -1} />
            </group>
          </group>
        );
      })}

      {/* Heading lights: white at the front, red at the back */}
      <mesh position={[0, 0.01, 0.17]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={dead ? '#475569' : '#f8fafc'} />
      </mesh>
      <mesh position={[0, 0.01, -0.17]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={dead ? '#475569' : '#ef4444'} />
      </mesh>

      {/* Camera gimbal (front, under the body) */}
      <group position={[0, -0.08, 0.1]}>
        <mesh>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.005, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 12]} />
          <meshBasicMaterial color={cameraColor} />
        </mesh>
      </group>

      {/* RFID antenna (rear, under the body) */}
      <group position={[0, -0.07, -0.1]}>
        <mesh>
          <boxGeometry args={[0.12, 0.012, 0.06]} />
          <meshBasicMaterial color={rfidColor} />
        </mesh>
        <mesh position={[0, -0.04, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
          <meshBasicMaterial color={rfidColor} />
        </mesh>
      </group>

      {/* Landing skids */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * 0.09, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.3, 6]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Dashed line from the drone down to a shadow on the floor, to read its height and position.
 * Drawn one unit long; the parent scales it to the drone's animated height every frame.
 */
const AltitudeGuide = React.forwardRef<THREE.Group, { color: string }>(({ color }, ref) => (
  <group ref={ref}>
    <Line points={[[0, 0, 0], [0, -1, 0]]} color={color} lineWidth={1} dashed dashSize={0.15} gapSize={0.12} transparent opacity={0.45} />
    <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.28, 24]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
    </mesh>
  </group>
));

/**
 * Moves `current` toward `target` at `speed` cells/s (snapping when the jump is longer than
 * SNAP_DISTANCE) and leaves the displacement of this frame in `step`.
 */
function glideTowards(current: THREE.Vector3, target: THREE.Vector3, speed: number, dt: number, step: THREE.Vector3) {
  step.subVectors(target, current);
  const distance = step.length();
  if (distance > SNAP_DISTANCE) {
    current.copy(target);
    step.set(0, 0, 0);
  } else if (distance > 0) {
    step.multiplyScalar(Math.min(1, (speed * dt) / distance));
    current.add(step);
  }
}

/** Signed shortest difference from angle `from` to angle `to`, in (-π, π]. */
function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Beam from the drone's sensor to the pallet being scanned. */
const ScanBeam: React.FC<{ to: THREE.Vector3; color: string }> = ({ to, color }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(0.85 + 0.15 * Math.sin(clock.elapsedTime * 12));
  });
  return (
    <group>
      <Line points={[[0, -0.12, 0], [to.x, to.y, to.z]]} color={color} lineWidth={3} transparent opacity={0.85} />
      <group ref={ref} position={to}>
        <mesh>
          <sphereGeometry args={[0.12, 12, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>
      </group>
    </group>
  );
};

interface AgentDroneProps {
  agent: Agent;
  tick: number;
  chargeStations?: Position3D[];
  batteryEnabled: boolean;
  /** Pallet id -> position, for the scan beam. */
  palletPositions: Map<string, Position3D>;
  /** Playback milliseconds per tick (sets the glide speed). */
  tickMs: number;
}

const AgentDrone: React.FC<AgentDroneProps> = ({ agent, tick, chargeStations = [], batteryEnabled, palletPositions, tickMs }) => {

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

  const { position, battery, isDestroyed, isDeadBattery, isRecharging } = snapshot;

  const activity = useMemo(() => {
    const dock = agent instanceof Drone ? agent.mission.warehouseLocation : agent.start;
    return describeDroneActivity(agent, tick, dock, snapshot, chargeStations);
  }, [agent, tick, snapshot, chargeStations]);
  const heading = useMemo(() => headingAt(agent.path, tick), [agent.path, tick]);

  // Pallet scanned within the last few ticks: the beam stays on long enough to be seen
  const scan = useMemo(() => {
    const entry = (agent.scanLog ?? []).find(e => tick >= e.tick && tick < e.tick + SCAN_BEAM_TICKS);
    const target = entry && palletPositions.get(entry.palletId);
    if (!entry || !target) return null;
    const type = (agent.assignedTasksLog ?? []).find(t => t.palletId === entry.palletId && entry.tick >= t.startTick && entry.tick <= t.endTick)?.type;
    return { offset: new THREE.Vector3(target.x - position.x, target.y - position.y, target.z - position.z), type };
  }, [agent.scanLog, agent.assignedTasksLog, tick, palletPositions, position.x, position.y, position.z]);
  const activeSensor = scan?.type ?? activity.scanType;

  const airborne = !GROUNDED.includes(activity.kind);

  // Smooth motion (visual only; the plan is unchanged): the drone glides to its cell for this tick,
  // leans into the movement, turns toward its heading and bobs while hovering
  const groupRef = useRef<THREE.Group>(null);   // position, and the spin while falling
  const leanRef = useRef<THREE.Group>(null);
  const headingRef = useRef<THREE.Group>(null);
  const bobRef = useRef<THREE.Group>(null);
  const guideRef = useRef<THREE.Group>(null);
  const bobPhase = useMemo(() => Math.random() * Math.PI * 2, []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const step = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    groupRef.current?.position.set(position.x, position.y, position.z);
    if (headingRef.current) headingRef.current.rotation.y = heading;
    // only on mount: afterwards useFrame moves the drone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const dt = Math.min(delta, 0.1); // a hidden tab resumes with a huge delta

    glideTowards(group.position, target.set(position.x, position.y, position.z), glideSpeedFor(tickMs), dt, step);

    if (isDeadBattery && position.y > 0) {
      // Spin while falling
      group.rotation.x += dt * 2;
      group.rotation.z += dt * 3;
    }

    // Lean: nose down in the direction of travel, proportional to speed
    const lean = leanRef.current;
    if (lean) {
      const speedX = dt > 0 ? step.x / dt : 0;
      const speedZ = dt > 0 ? step.z / dt : 0;
      const clamp = (v: number) => THREE.MathUtils.clamp(v, -MAX_LEAN, MAX_LEAN);
      const k = 1 - Math.exp(-LEAN_RESPONSE * dt);
      lean.rotation.x += (clamp(speedZ * LEAN_PER_SPEED) - lean.rotation.x) * k;
      lean.rotation.z += (clamp(-speedX * LEAN_PER_SPEED) - lean.rotation.z) * k;
    }

    if (headingRef.current) {
      const yaw = headingRef.current.rotation.y;
      headingRef.current.rotation.y = yaw + angleDelta(yaw, heading) * (1 - Math.exp(-TURN_RESPONSE * dt));
    }

    if (bobRef.current) {
      bobRef.current.position.y = airborne && !isDeadBattery
        ? Math.sin(state.clock.elapsedTime * BOB_SPEED + bobPhase) * BOB_AMPLITUDE
        : 0;
    }

    if (guideRef.current) {
      const height = group.position.y - FLOOR_Y - GUIDE_TOP;
      guideRef.current.visible = height > 0.3 && !isDeadBattery;
      guideRef.current.scale.y = Math.max(height, 0.001);
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
        <Billboard position={[0, 1, 0]}>
          <Text fontSize={0.3} color="#ef4444" anchorX="center" anchorY="middle">DESTROYED</Text>
        </Billboard>
      </group>
    );
  }

  const batPct = Math.max(0, battery / agent.maxBattery);
  const batColor = batPct > 0.5 ? '#22c55e' : batPct > 0.2 ? '#eab308' : '#ef4444';

  // If falling/dead, color it dark red or grey
  const showDead = isDeadBattery;

  return (
    <group ref={groupRef}>
      <Billboard position={[0, 1.2, 0]}>
        <mesh position={[-0.5 + (batPct / 2), 0, 0]}>
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

      <group ref={bobRef}>
        <group ref={leanRef}>
          <group ref={headingRef} scale={DRONE_SCALE}>
            <DroneModel
              color={agent.color}
              dead={showDead}
              charging={isRecharging}
              spinning={airborne}
              activeSensor={activeSensor}
            />
          </group>
        </group>
      </group>

      <group position={[0, -GUIDE_TOP, 0]}>
        <AltitudeGuide ref={guideRef} color={agent.color} />
      </group>
      {scan && !showDead && <ScanBeam to={scan.offset} color={scan.type === 'rfid' ? RFID_COLOR : CAMERA_COLOR} />}

      <Billboard position={[0, 0.8, 0]}>
        <Text fontSize={0.25} color="white" anchorX="center" anchorY="middle">{agent.name}</Text>
      </Billboard>
      {!showDead && <pointLight intensity={0.5} distance={3} color={isRecharging ? '#3b82f6' : agent.color} />}
    </group>
  );
};

interface ForkliftMeshProps {
  forklift: Forklift;
  tick: number;
  /** Playback milliseconds per tick (sets the glide speed). */
  tickMs: number;
}

const ForkliftMesh: React.FC<ForkliftMeshProps> = ({ forklift, tick, tickMs }) => {
  // Determine current position based on tick, looping if necessary
  const pathIndex = tick % Math.max(1, forklift.path.length);
  const position = forklift.path[pathIndex] || { x: 0, y: 0, z: 0 };

  // Heading: direction of travel (forks in front), kept while stopped
  const heading = useMemo(() => headingAt(forklift.path, pathIndex), [forklift.path, pathIndex]);

  // Smooth motion (visual only): glide to this tick's cell and turn toward the heading
  const groupRef = useRef<THREE.Group>(null);
  const headingRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const step = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    groupRef.current?.position.set(position.x, position.y + 0.5, position.z);
    if (headingRef.current) headingRef.current.rotation.y = heading;
    // only on mount: afterwards useFrame moves the forklift
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const dt = Math.min(delta, 0.1);
    glideTowards(group.position, target.set(position.x, position.y + 0.5, position.z), glideSpeedFor(tickMs), dt, step);
    if (headingRef.current) {
      const yaw = headingRef.current.rotation.y;
      headingRef.current.rotation.y = yaw + angleDelta(yaw, heading) * (1 - Math.exp(-TURN_RESPONSE * dt));
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={headingRef}>
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
      </group>

      <Billboard position={[0, 0.8, 0]}>
        <Text fontSize={0.2} color="white" anchorX="center" anchorY="middle">
          {forklift.name}
        </Text>
      </Billboard>
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

    if (activeTask) {
      const startTickLine = Math.max(0, activeTask.startTick);
      const endTickLine = Math.min(maxTick, activeTask.endTick);
      return buildVisibleSegment(startTickLine, endTickLine);
    }

    const nextTask = (agent.assignedTasksLog || [])
      .filter(t => t.startTick > tick)
      .sort((a, b) => a.startTick - b.startTick)[0];

    if (tick >= maxTick) {
      return { path: [] as Position3D[], startTick: tick, endTick: maxTick };
    }

    return buildVisibleSegment(tick, Math.min(maxTick, nextTask ? nextTask.startTick : maxTick));
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
          <Billboard position={[0, 0.02, 0]}>
            <mesh>
              <planeGeometry args={[0.52, 0.22]} />
              <meshBasicMaterial color="#0f172a" transparent opacity={0.9} side={THREE.DoubleSide} depthTest={true} />
            </mesh>
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.09}
              color={agent.color}
              anchorX="center"
              anchorY="middle"
            >
              {marker.type === 'rfid' ? 'RFID' : 'SCAN'}
            </Text>
          </Billboard>
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
      <Billboard position={[0, 1.2, 0]}>
        <Text fontSize={0.5} color="#ff4444" anchorX="center" anchorY="middle">COLLISION</Text>
      </Billboard>
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

      <Billboard position={[cluster.centroid.x, cluster.centroid.y + 0.75, cluster.centroid.z]}>
        <Text fontSize={0.2} color={cluster.color} anchorX="center" anchorY="middle">
          {`${cluster.droneName} Cluster`}
        </Text>
      </Billboard>
    </group>
  );
};

const GridBase: React.FC<{ size: Position3D }> = ({ size }) => (
  <gridHelper args={[size.x, size.x, 0x444444, 0x222222]} position={[(size.x - 1) / 2, -0.51, (size.z - 1) / 2]} />
);

interface WarehouseBaseProps {
  warehouse: Warehouse;
}

const WarehouseBase: React.FC<WarehouseBaseProps> = ({ warehouse }) => {
  const { baseSize, position } = warehouse;
  const centerX = position.x + (baseSize - 1) / 2;
  const centerZ = position.z + (baseSize - 1) / 2;

  const crates = useMemo(() => Array.from({ length: Math.floor(warehouse.capacity * 0.7) }).map(() => ({
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
      <Text position={[0, 0.1, -(baseSize / 2 + 0.5)]} rotation={[-Math.PI / 2, 0, Math.PI]} fontSize={0.4} color="#f59e0b" anchorX="center" anchorY="middle">DISTRIBUTION CENTER</Text>
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
  cameraFocus?: CameraFocusCommand | null;
  /** Playback milliseconds per tick (sets how fast drones and forklifts glide). */
  tickMs?: number;
}

export interface CameraFocusCommand {
  mode: 'overview' | 'drone' | 'zoom_in' | 'zoom_out';
  droneId?: string;
  triggerId?: number;
}

/** Rotations (about y) of the four vertical faces of a pallet box. */
const SENSOR_TAG_SIDES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** Screen height taken by the voice bar at the bottom (bar plus its margin). */
const VOICE_BAR_HEIGHT_PX = 140;

const CameraController: React.FC<{
  cameraFocus?: CameraFocusCommand | null;
  agents: Agent[];
  tick: number;
  center: THREE.Vector3;
  camPos: THREE.Vector3;
  gridSize: Position3D;
}> = ({ cameraFocus, agents, tick, center, camPos, gridSize }) => {
  const { camera, size } = useThree();
  const controlsRef = useRef<any>(null);

  // The voice bar covers the bottom of the screen: draw the scene centred in the space above it
  // (the canvas keeps the full screen; only the projection centre moves up)
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.setViewOffset(size.width, size.height, 0, VOICE_BAR_HEIGHT_PX / 2, size.width, size.height);
    perspective.updateProjectionMatrix();
    return () => {
      perspective.clearViewOffset();
    };
  }, [camera, size.width, size.height]);
  const lastTriggerRef = useRef<number | undefined>(undefined);

  // Handle discrete zoom actions when triggerId changes
  useEffect(() => {
    if (!controlsRef.current || !cameraFocus) return;
    if (cameraFocus.triggerId !== lastTriggerRef.current) {
      lastTriggerRef.current = cameraFocus.triggerId;
      const target = controlsRef.current.target as THREE.Vector3;
      const dir = new THREE.Vector3().subVectors(target, camera.position);
      if (cameraFocus.mode === 'zoom_in') {
        camera.position.addScaledVector(dir, 0.35);
        controlsRef.current.update();
      } else if (cameraFocus.mode === 'zoom_out') {
        camera.position.addScaledVector(dir, -0.35);
        controlsRef.current.update();
      }
    }
  }, [cameraFocus?.triggerId, cameraFocus?.mode]);

  useFrame(() => {
    if (!controlsRef.current) return;

    if (cameraFocus?.mode === 'drone' && cameraFocus.droneId) {
      const droneIdLower = cameraFocus.droneId.toLowerCase();
      const targetAgent = agents.find(
        (a) => a.id.toLowerCase() === droneIdLower || a.name.toLowerCase() === droneIdLower
      );
      if (targetAgent) {
        const t = Math.min(tick, targetAgent.path.length - 1);
        const pos = targetAgent.path[t] || targetAgent.start;
        const droneVec = new THREE.Vector3(pos.x, pos.y, pos.z);

        // Smoothly lerp orbit target to follow drone position
        controlsRef.current.target.lerp(droneVec, 0.08);

        // Cinematic close-up follow position: offset above and beside the drone
        const desiredPos = new THREE.Vector3(pos.x + 3.2, pos.y + 2.5, pos.z + 3.2);
        camera.position.lerp(desiredPos, 0.08);
        controlsRef.current.update();
      }
    } else if (cameraFocus?.mode === 'overview') {
      controlsRef.current.target.lerp(center, 0.06);
      camera.position.lerp(camPos, 0.06);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={center}
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 1.8}
      maxDistance={gridSize.x * 3}
    />
  );
};

// Unscanned pallet colour by priority: pale yellow (low) -> orange -> red (high).
// Green (scanned) and cyan (active target) stay reserved for pallet state.
const PRIORITY_STOPS = ['#fde68a', '#f97316', '#dc2626'].map(c => new THREE.Color(c));
const PRIORITY_GRADIENT_CSS = 'linear-gradient(to right, #fde68a, #f97316, #dc2626)';

/** Colour for a priority level t in [0, 1]. */
function priorityColor(t: number): THREE.Color {
  const scaled = Math.min(1, Math.max(0, t)) * (PRIORITY_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), PRIORITY_STOPS.length - 2);
  return PRIORITY_STOPS[i].clone().lerp(PRIORITY_STOPS[i + 1], scaled - i);
}

const VoxelWorld: React.FC<VoxelWorldProps> = ({
  gridSize, obstacles, agents, incidents, tick, warehouse, chargeStations = [], batteryEnabled, forklifts = [], pallets = [], clusters = [],
  scannedPalletIds = new Set(), activePalletIds = new Set(), cameraFocus = null, tickMs = PLAYBACK_TICK_MS
}) => {
  const center = useMemo(() => new THREE.Vector3((gridSize.x - 1) / 2, (gridSize.y - 1) / 2, (gridSize.z - 1) / 2), [gridSize]);
  // Look at the warehouse from the base's side, so the dock and its drones are in front of the stacks
  const camPos = useMemo(() => {
    const base = warehouse
      ? new THREE.Vector3(warehouse.position.x + warehouse.baseSize / 2, 0, warehouse.position.z + warehouse.baseSize / 2)
      : new THREE.Vector3(0, 0, 0);
    const towardBase = new THREE.Vector3(base.x - center.x, 0, base.z - center.z);
    if (towardBase.lengthSq() === 0) towardBase.set(1, 0, 1);
    const pos = center.clone().addScaledVector(towardBase.normalize(), Math.hypot(gridSize.x, gridSize.z));
    pos.y = gridSize.y * 1.2;
    return pos;
  }, [gridSize, center, warehouse?.position.x, warehouse?.position.z, warehouse?.baseSize]);

  const palletPositions = useMemo(() => new Map(pallets.map(p => [p.id, p.position])), [pallets]);

  // Only show collisions in the visualizer, not battery deaths
  const visibleCollisions = useMemo(() =>
    incidents.filter(i => i.type === 'collision' && i.time <= tick),
    [incidents, tick]);

  const visibleClusters = useMemo(
    () => clusters.filter(cluster => tick >= cluster.startTick && tick <= cluster.endTick),
    [clusters, tick]
  );

  // Priority is shown relative to the pallets in this world; equal weights map to the middle colour
  const weightRange = useMemo(() => {
    const weights = pallets.map(p => p.weight);
    return { min: Math.min(...weights), max: Math.max(...weights) };
  }, [pallets]);
  const priorityLevel = (weight: number) =>
    weightRange.max > weightRange.min ? (weight - weightRange.min) / (weightRange.max - weightRange.min) : 0.5;

  return (
    <div className="w-full h-full relative">
      {pallets.length > 0 && weightRange.max > weightRange.min && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded-md bg-slate-900/80 border border-slate-700 px-3 py-1.5 text-[10px] text-slate-300 flex items-center gap-2">
          <span>Pallet priority</span>
          <span>low</span>
          <span className="inline-block h-2 w-24 rounded-sm" style={{ background: PRIORITY_GRADIENT_CSS }} />
          <span>high</span>
          <span className="inline-block h-2 w-2 rounded-sm ml-2" style={{ background: '#06b6d4' }} /><span>target</span>
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#22c55e' }} /><span>scanned</span>
        </div>
      )}
      <Canvas camera={{ position: camPos, fov: 45 }} shadows>
        <color attach="background" args={['#0f172a']} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.4} />
        <pointLight position={[gridSize.x, gridSize.y * 2, gridSize.z]} intensity={1} castShadow />
        <Environment preset="city" />

        <CameraController
          cameraFocus={cameraFocus}
          agents={agents}
          tick={tick}
          center={center}
          camPos={camPos}
          gridSize={gridSize}
        />

        <GridBase size={gridSize} />

        <ObstacleField obstacles={obstacles} />

        {/* Render pallets with state-based colors */}
        {pallets.map((plt) => {
          const isScanned = scannedPalletIds.has(plt.id);
          const isActive = activePalletIds.has(plt.id);

          // Box color: green=scanned, cyan=active target, otherwise by priority
          const priority = priorityColor(priorityLevel(plt.weight));
          const boxColor = isScanned ? '#22c55e' : isActive ? '#06b6d4' : `#${priority.getHexString()}`;
          const emissive = isScanned ? '#166534' : isActive ? '#0e7490' : `#${priority.clone().multiplyScalar(0.4).getHexString()}`;
          const emissiveI = isActive ? 0.6 : isScanned ? 0.3 : 0.1;
          const baseColor = isScanned ? '#14532d' : '#8b5a2b';

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
                {/* Sensor type indicator, on all four sides so it shows from any view */}
                {SENSOR_TAG_SIDES.map((rotationY, side) => (
                  <group key={side} rotation={[0, rotationY, 0]}>
                    <mesh position={[0, 0, 0.41]}>
                      <planeGeometry args={[0.4, 0.2]} />
                      <meshBasicMaterial color={plt.payload_type === 'camera' ? '#3b82f6' : '#a855f7'} />
                    </mesh>
                  </group>
                ))}
              </mesh>
              {/* Scanned checkmark label */}
              {isScanned && (
                <Billboard position={[0, 0.6, 0]}>
                  <Text fontSize={0.25} color="#4ade80" anchorX="center" anchorY="middle">
                    ✓
                  </Text>
                </Billboard>
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
              palletPositions={palletPositions}
              tickMs={tickMs}
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
            <ForkliftMesh forklift={fl} tick={tick} tickMs={tickMs} />
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
