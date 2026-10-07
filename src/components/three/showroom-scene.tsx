"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, useProgress } from "@react-three/drei";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { GlassCase, ModelErrorBoundary, Pedestal, ShoeModel } from "./shoe-model";
import { useWebglSupport } from "./use-webgl";
import { trackEvent } from "@/lib/track";

export type ShowroomItem = {
  id: string;
  slug: string;
  name: string;
  modelUrl: string;
  subtitle: string;
  rating: { average: number; count: number };
  modelSource: string;
};

const SPACING_X = 1.9;
const FOV = 40;
const SPACING_Z = 2.5;

function layout(count: number, cols: number) {
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, count - r * cols);
    const c = i % cols;
    const x = (c - (inRow - 1) / 2) * SPACING_X;
    const z = (r - (rows - 1) / 2) * SPACING_Z;
    return new THREE.Vector3(x, 0, z);
  });
}

/** Camera that frames every case, computed from the field of view and viewport aspect. */
function homeView(count: number, cols: number, aspect: number) {
  const rows = Math.ceil(count / cols);
  const halfW = (Math.min(cols, count) * SPACING_X) / 2 + 0.2;
  const halfD = (rows * SPACING_Z) / 2 + 0.2;
  const vHalf = THREE.MathUtils.degToRad(FOV / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const elev = 0.62; // radians above the horizon
  const distW = halfW / Math.tan(hHalf) + halfD;
  // projected depth of the rows seen from the elevated camera
  const distD = (halfD * Math.sin(elev) + 0.6) / Math.tan(vHalf) + halfD * Math.cos(elev);
  const dist = Math.max(distW, distD, 3.5) * 0.95;
  return {
    position: new THREE.Vector3(0, Math.sin(elev) * dist + 0.3, Math.cos(elev) * dist),
    target: new THREE.Vector3(0, 0.3, 0),
  };
}

function Glow() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,226,180,0.55)");
    grad.addColorStop(1, "rgba(255,226,180,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.0135, 0]}>
      <planeGeometry args={[1.3, 0.75]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/** Name plate drawn to a canvas texture (no DOM overlays, cheap on mobile). */
function Label({ text, selected }: { text: string; selected: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    const font = "600 44px Inter, ui-sans-serif, system-ui, sans-serif";
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 64;
    c.width = w;
    c.height = 84;
    g.font = font;
    g.fillStyle = selected ? "#a9834b" : "rgba(0,0,0,0.62)";
    const r = 42;
    g.beginPath();
    g.roundRect(0, 0, w, 84, r);
    g.fill();
    g.fillStyle = "#ffffff";
    g.textBaseline = "middle";
    g.fillText(text, 32, 44);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { texture: t, aspect: w / 84 };
  }, [text, selected]);
  useEffect(() => () => texture.dispose(), [texture]);
  const h = 0.16;
  return (
    <sprite position={[0, 1.02, 0.1]} scale={[h * aspect, h, 1]} renderOrder={5}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function Spinner() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 2;
  });
  return (
    <mesh ref={ref} position={[0, 0.25, 0]}>
      <torusGeometry args={[0.14, 0.012, 8, 32, Math.PI * 1.5]} />
      <meshBasicMaterial color="#a9834b" />
    </mesh>
  );
}

function DisplayCase({
  item,
  position,
  selected,
  autoRotate,
  onSelect,
}: {
  item: ShowroomItem;
  position: THREE.Vector3;
  selected: boolean;
  autoRotate: boolean;
  onSelect: () => void;
}) {
  const spin = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  useFrame((_, d) => {
    if (spin.current && autoRotate) spin.current.rotation.y += d * (selected ? 0.6 : 0.35);
  });
  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <Pedestal dark height={0.7} />
      <Glow />
      <group ref={spin} position={[0, 0.014, 0]}>
        <ModelErrorBoundary fallback={<Spinner />}>
          <Suspense fallback={<Spinner />}>
            <ShoeModel url={item.modelUrl} size={1} />
          </Suspense>
        </ModelErrorBoundary>
      </group>
      <GlassCase dark />
      <spotLight position={[0, 2.4, 0.4]} angle={0.5} penumbra={0.8} intensity={selected || hover ? 9 : 5} color="#ffe2b8" distance={4} decay={1.5} />
      <Label text={item.name} selected={selected} />
    </group>
  );
}

function CameraRig({
  focus,
  home,
  resetKey,
  zoomRef,
}: {
  focus: THREE.Vector3 | null;
  home: { position: THREE.Vector3; target: THREE.Vector3 };
  resetKey: number;
  zoomRef: React.MutableRefObject<((f: number) => void) | null>;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (focus) {
      goal.current = { position: focus.clone().add(new THREE.Vector3(0.9, 1.0, 2.1)), target: focus.clone().add(new THREE.Vector3(0, 0.3, 0)) };
    } else {
      goal.current = { position: home.position.clone(), target: home.target.clone() };
    }
  }, [focus, home, resetKey]);

  useEffect(() => {
    zoomRef.current = (factor: number) => {
      if (!controls) return;
      goal.current = null;
      const dir = camera.position.clone().sub(controls.target);
      const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, dir.length() * factor));
      camera.position.copy(controls.target.clone().add(dir.setLength(len)));
      controls.update();
    };
  }, [camera, controls, zoomRef]);

  useFrame((_, d) => {
    if (!goal.current || !controls) return;
    const k = 1 - Math.pow(0.0015, d);
    camera.position.lerp(goal.current.position, k);
    controls.target.lerp(goal.current.target, k);
    controls.update();
    if (camera.position.distanceTo(goal.current.position) < 0.01 && controls.target.distanceTo(goal.current.target) < 0.01) goal.current = null;
  });

  useEffect(() => {
    if (!controls) return;
    const cancel = () => (goal.current = null);
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);
  return null;
}

function Loader() {
  const { active, progress, loaded, total } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white/90" role="status">
      Loading shoes {loaded}/{total} · {Math.round(progress)}%
    </div>
  );
}

export default function ShowroomScene({ items, title }: { items: ShowroomItem[]; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  const [aspect, setAspect] = useState(1.6);
  const [selected, setSelected] = useState<number | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const zoomRef = useRef<((f: number) => void) | null>(null);
  const webgl = useWebglSupport();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      setCols(w < 640 ? 2 : w < 1024 ? 3 : 4);
      setAspect(w / Math.max(1, e.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const positions = useMemo(() => layout(items.length, cols), [items.length, cols]);
  const home = useMemo(() => homeView(items.length, cols, aspect), [items.length, cols, aspect]);
  const current = selected !== null ? items[selected] : null;

  const select = (i: number | null) => {
    setSelected(i);
    if (i !== null) trackEvent("model_interaction", items[i].id);
  };
  const step = (dir: 1 | -1) => select(selected === null ? 0 : (selected + dir + items.length) % items.length);

  if (webgl === false) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-white/70">
        Your browser does not support WebGL, so the 3D showroom can’t be displayed. Browse the list of shoes below instead.
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative size-full select-none" onKeyDown={(e) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "Escape") select(null);
    }}>
      {webgl && (
        <Canvas
          dpr={[1, 1.6]}
          camera={{ position: home.position.toArray() as [number, number, number], fov: FOV, near: 0.1, far: 80 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onPointerMissed={() => select(null)}
          aria-label={`3D showroom: ${title}. ${items.length} shoes in glass display cases.`}
          role="img"
        >
          <color attach="background" args={["#0d0e10"]} />
          <fog attach="fog" args={["#0d0e10", 9, 26]} />
          <ambientLight intensity={0.25} />
          <hemisphereLight args={["#fff3e0", "#111111", 0.35]} />
          <Environment resolution={256} frames={1}>
            <Lightformer intensity={1.6} position={[0, 4, 2]} rotation-x={Math.PI / 2} scale={[10, 4, 1]} />
            <Lightformer intensity={0.8} color="#ffd9a8" position={[-5, 1.5, 0]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
            <Lightformer intensity={0.8} color="#cfe3ff" position={[5, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
          </Environment>
          <mesh rotation-x={-Math.PI / 2} position={[0, -0.7, 0]} receiveShadow>
            <circleGeometry args={[30, 64]} />
            <meshStandardMaterial color="#141519" roughness={0.35} metalness={0.4} />
          </mesh>
          {items.map((item, i) => (
            <DisplayCase key={item.id} item={item} position={positions[i]} selected={selected === i} autoRotate={autoRotate} onSelect={() => select(i)} />
          ))}
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minDistance={1.6}
            maxDistance={30}
            minPolarAngle={0.2}
            maxPolarAngle={Math.PI / 2 - 0.08}
          />
          <CameraRig focus={current ? positions[selected!] : null} home={home} resetKey={resetKey} zoomRef={zoomRef} />
        </Canvas>
      )}
      <Loader />

      <div className="absolute top-3 right-3 flex flex-col gap-1.5" role="toolbar" aria-label="Showroom controls">
        <SceneButton label={autoRotate ? "Pause rotation" : "Rotate shoes"} onClick={() => setAutoRotate((v) => !v)}>
          {autoRotate ? <Pause className="size-4" /> : <Play className="size-4" />}
        </SceneButton>
        <SceneButton label="Zoom in" onClick={() => zoomRef.current?.(0.8)}>
          <Plus className="size-4" />
        </SceneButton>
        <SceneButton label="Zoom out" onClick={() => zoomRef.current?.(1.25)}>
          <Minus className="size-4" />
        </SceneButton>
        <SceneButton
          label="Reset camera"
          onClick={() => {
            setSelected(null);
            setResetKey((k) => k + 1);
          }}
        >
          <RotateCcw className="size-4" />
        </SceneButton>
      </div>

      <div className="absolute bottom-3 left-1/2 flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col gap-2">
        {current ? (
          <div className="rounded-2xl bg-white/95 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display truncate text-lg font-semibold">{current.name}</p>
                <p className="truncate text-sm text-muted">{current.subtitle}</p>
                {current.rating.count > 0 && (
                  <p className="mt-1 text-xs text-ink-2">
                    ★ {current.rating.average.toFixed(1)} · {current.rating.count} review{current.rating.count === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <button type="button" className="rounded-full p-1.5 text-muted hover:bg-paper-2" aria-label="Close" onClick={() => select(null)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/products/${current.slug}`} className="btn-primary btn-sm">
                Open in 3D &amp; reviews
              </Link>
              <Link href={`/try-on?product=${current.slug}`} className="btn-ghost btn-sm">
                Try it on
              </Link>
            </div>
          </div>
        ) : (
          <p className="mx-auto rounded-full bg-black/55 px-4 py-1.5 text-center text-xs text-white/85">Tap a display case to inspect a shoe · drag to look around</p>
        )}
        <div className="flex items-center justify-center gap-2">
          <SceneButton label="Previous shoe" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </SceneButton>
          <span className="min-w-16 text-center text-xs text-white/70 tabular-nums">{selected === null ? `${items.length} shoes` : `${selected + 1} / ${items.length}`}</span>
          <SceneButton label="Next shoe" onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </SceneButton>
        </div>
      </div>
    </div>
  );
}

function SceneButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow ring-1 ring-black/10 transition hover:bg-white active:scale-95"
    >
      {children}
    </button>
  );
}
