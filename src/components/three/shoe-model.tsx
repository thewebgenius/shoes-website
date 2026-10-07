"use client";

import { useGLTF } from "@react-three/drei";
import { Component, useMemo, type ReactNode } from "react";
import * as THREE from "three";

/**
 * Loads a real GLB/GLTF shoe and normalises it: longest horizontal axis along X,
 * scaled to `size` units long, centred, resting on y = 0.
 */
export function ShoeModel({ url, size = 1 }: { url: string; size?: number }) {
  // Draco/meshopt decoders are not used, so nothing is fetched from third-party CDNs.
  const gltf = useGLTF(url, false, false);
  const object = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const wrapper = new THREE.Group();
    wrapper.add(scene);
    let box = new THREE.Box3().setFromObject(scene);
    const dims = box.getSize(new THREE.Vector3());
    if (dims.z > dims.x) scene.rotation.y = Math.PI / 2;
    box = new THREE.Box3().setFromObject(scene);
    const sz = box.getSize(new THREE.Vector3());
    const s = size / Math.max(sz.x, sz.z, 1e-6);
    scene.scale.multiplyScalar(s);
    box = new THREE.Box3().setFromObject(scene);
    const c = box.getCenter(new THREE.Vector3());
    scene.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
    return wrapper;
  }, [gltf.scene, size]);

  return <primitive object={object} />;
}

/** Glass display case with a thin metal frame, sized around a shoe of length 1. */
export function GlassCase({ width = 1.35, depth = 0.8, height = 0.85, dark = false }: { width?: number; depth?: number; height?: number; dark?: boolean }) {
  const frame = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)), [width, height, depth]);
  return (
    <group position={[0, height / 2 + 0.002, 0]}>
      <mesh renderOrder={2}>
        <boxGeometry args={[width, height, depth]} />
        <meshPhysicalMaterial
          color={dark ? "#cfd8e3" : "#ffffff"}
          transparent
          opacity={dark ? 0.1 : 0.14}
          roughness={0.04}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          reflectivity={0.6}
          envMapIntensity={1.6}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={frame}>
        <lineBasicMaterial color={dark ? "#c9a46a" : "#b9b3a8"} transparent opacity={0.85} />
      </lineSegments>
    </group>
  );
}

export function Pedestal({ width = 1.45, depth = 0.9, height = 0.5, dark = false }: { width?: number; depth?: number; height?: number; dark?: boolean }) {
  return (
    <group position={[0, -height / 2, 0]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={dark ? "#1b1c20" : "#f2efe9"} roughness={0.55} metalness={dark ? 0.2 : 0} />
      </mesh>
      <mesh position={[0, height / 2 + 0.006, 0]}>
        <boxGeometry args={[width + 0.02, 0.012, depth + 0.02]} />
        <meshStandardMaterial color={dark ? "#a9834b" : "#d9d1c3"} roughness={0.3} metalness={dark ? 0.85 : 0.1} />
      </mesh>
    </group>
  );
}

/** Catches GLB load/parse failures so a broken asset never crashes the page. */
export class ModelErrorBoundary extends Component<{ children: ReactNode; onError?: () => void; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D model failed to load", error);
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
