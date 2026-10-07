"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, useProgress } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { GlassCase, ModelErrorBoundary, Pedestal, ShoeModel } from "./shoe-model";
import { useWebglSupport } from "./use-webgl";
import { trackEvent } from "@/lib/track";

const HOME_DIR = new THREE.Vector3(1.15, 0.78, 1.55).normalize();

/** Distance that keeps the whole glass case in frame for the container's aspect ratio. */
function homePosition(aspect: number): [number, number, number] {
  const dist = 2.35 * Math.max(1, 1 / Math.max(0.5, aspect)) ** 0.9;
  return HOME_DIR.clone().multiplyScalar(dist).toArray() as [number, number, number];
}
const TARGET: [number, number, number] = [0, 0.28, 0];

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
      <div className="rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-ink-2 shadow-sm">Loading 3D model… {Math.round(progress)}%</div>
    </div>
  );
}

function ControlsBridge({ onReady }: { onReady: (api: { zoom: (f: number) => void }) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (!controls) return;
    onReady({
      zoom: (factor: number) => {
        const dir = camera.position.clone().sub(controls.target);
        const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, dir.length() * factor));
        camera.position.copy(controls.target.clone().add(dir.setLength(len)));
        controls.update();
      },
    });
  }, [camera, controls, onReady]);
  return null;
}

export default function ProductViewer({ modelUrl, productId, name, showCase = true }: { modelUrl: string; productId?: string; name: string; showCase?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const zoomApi = useRef<{ zoom: (f: number) => void } | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const webgl = useWebglSupport();
  const [error, setError] = useState(false);
  const [home, setHome] = useState<[number, number, number]>(() => homePosition(1));

  useEffect(() => {
    const el = wrapRef.current;
    if (el) setHome(homePosition(el.clientWidth / Math.max(1, el.clientHeight)));
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const interacted = useCallback(() => {
    if (productId) trackEvent("model_interaction", productId);
  }, [productId]);

  const reset = () => {
    const c = controlsRef.current;
    if (!c) return;
    c.object.position.set(...home);
    c.target.set(...TARGET);
    c.update();
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current?.requestFullscreen();
    } catch {
      // Fullscreen is optional (e.g. unsupported on iOS Safari for divs).
    }
  };

  if (webgl === false || error) {
    return (
      <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted">
        {error ? "The 3D model could not be loaded. Please refresh to try again." : "Your browser does not support WebGL, so the 3D viewer is unavailable. Product photos are shown instead."}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative size-full overflow-hidden bg-gradient-to-b from-white to-paper-2" onPointerDown={interacted} onWheel={interacted}>
      {webgl && (
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: home, fov: 35, near: 0.05, far: 50 }}
          gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }}
          aria-label={`Interactive 3D model of ${name}. Drag to rotate, pinch or scroll to zoom.`}
          role="img"
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              setError(true);
            });
          }}
        >
          <color attach="background" args={["#f4f1ec"]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[2.5, 4, 2]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
          <Environment resolution={256} frames={1}>
            <Lightformer intensity={2.2} position={[0, 3, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
            <Lightformer intensity={1.2} position={[-3, 1, 2]} rotation-y={Math.PI / 3} scale={[4, 2, 1]} />
            <Lightformer intensity={1.2} position={[3, 1, -2]} rotation-y={-Math.PI / 3} scale={[4, 2, 1]} />
            <Lightformer intensity={0.6} color="#ffe8c7" position={[0, 0.5, -4]} scale={[8, 2, 1]} />
          </Environment>
          <ModelErrorBoundary onError={() => setError(true)}>
            <Suspense fallback={null}>
              <group position={[0, showCase ? 0.013 : 0, 0]}>
                <ShoeModel url={modelUrl} size={1} />
              </group>
            </Suspense>
          </ModelErrorBoundary>
          {showCase && (
            <>
              <GlassCase />
              <Pedestal />
            </>
          )}
          <ContactShadows position={[0, showCase ? 0.014 : 0.001, 0]} opacity={0.45} scale={3} blur={2.2} far={1} frames={1} resolution={512} />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            target={TARGET}
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minDistance={0.7}
            maxDistance={5}
            minPolarAngle={0.15}
            maxPolarAngle={Math.PI / 2 - 0.02}
            autoRotate={autoRotate}
            autoRotateSpeed={1.4}
            onStart={() => setAutoRotate(false)}
          />
          <ControlsBridge onReady={(api) => (zoomApi.current = api)} />
        </Canvas>
      )}
      <Loader />
      <div className="absolute right-3 bottom-3 flex gap-1.5" role="toolbar" aria-label="3D viewer controls">
        <ViewerButton label={autoRotate ? "Pause auto-rotate" : "Auto-rotate"} onClick={() => setAutoRotate((v) => !v)}>
          {autoRotate ? <Pause className="size-4" /> : <Play className="size-4" />}
        </ViewerButton>
        <ViewerButton label="Zoom in" onClick={() => zoomApi.current?.zoom(0.8)}>
          <Plus className="size-4" />
        </ViewerButton>
        <ViewerButton label="Zoom out" onClick={() => zoomApi.current?.zoom(1.25)}>
          <Minus className="size-4" />
        </ViewerButton>
        <ViewerButton label="Reset camera" onClick={reset}>
          <RotateCcw className="size-4" />
        </ViewerButton>
        <ViewerButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </ViewerButton>
      </div>
      <p className="pointer-events-none absolute top-3 left-3 rounded-full bg-white/80 px-3 py-1 text-[11px] text-ink-2">Drag to rotate 360° · Pinch or scroll to zoom</p>
    </div>
  );
}

function ViewerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm ring-1 ring-line transition hover:bg-white active:scale-95"
    >
      {children}
    </button>
  );
}
