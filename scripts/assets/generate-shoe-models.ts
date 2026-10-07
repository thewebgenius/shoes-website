/**
 * Generates original, stylised 3D shoe models (GLB) from parametric geometry.
 * These are real meshes (sole, upper, lining, collar, laces, straps, heels),
 * authored for this project and released as CC0 so the catalog has enough
 * sample assets without depending on unlicensed downloads.
 *
 * Usage: npx tsx scripts/assets/generate-shoe-models.ts
 */
import path from "node:path";
import * as THREE from "three";
import { Document, NodeIO, type Material as GMaterial } from "@gltf-transform/core";

const outDir = path.resolve(__dirname, "../../seed-assets/models");

type Rgb = [number, number, number];
type Surface = { color: Rgb; roughness: number; metalness?: number };
type Part = { geometry: THREE.BufferGeometry; surface: Surface; name: string };

const hex = (h: string): Rgb => {
  const c = new THREE.Color(h);
  // glTF expects linear colour factors.
  c.convertSRGBToLinear();
  return [c.r, c.g, c.b];
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Shared shoe shape
// ---------------------------------------------------------------------------

type ShapeSpec = {
  length: number; // metres, heel to toe
  width: number; // half-width at the ball of the foot
  soleThickness: number;
  heelLift: number; // extra midsole height at the heel
  toeSpring: number;
  heelHeight?: number; // raised heel for pumps (sole curves up)
  upperHeight: (t: number) => number; // height of the upper above the sole along the length
  collar: { centre: number; halfLength: number; halfAngle: number } | null;
};

/** Half width of the footprint at t (0 = heel, 1 = toe). */
function halfWidth(spec: ShapeSpec, t: number) {
  const p = 2.4;
  const e = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), p)), 1 / p);
  const ball = 0.8 + 0.2 * Math.exp(-Math.pow((t - 0.68) / 0.24, 2));
  return spec.width * e * ball;
}

/** Height of the sole's underside at t; pumps rise towards the heel. */
function baseY(spec: ShapeSpec, t: number) {
  const spring = spec.toeSpring * Math.pow(smooth(0.72, 1, t), 2);
  const heel = spec.heelHeight ? spec.heelHeight * (1 - smooth(0.12, 0.62, t)) : 0;
  return spring + heel;
}

function soleTopY(spec: ShapeSpec, t: number) {
  const lift = spec.heelHeight ? 0 : spec.heelLift * (1 - smooth(0.15, 0.75, t));
  return baseY(spec, t) + spec.soleThickness + lift;
}

/** A sole slab following the footprint with rounded walls. */
function soleGeometry(spec: ShapeSpec, opts: { inset: number; bottom: (t: number) => number; top: (t: number) => number }) {
  const N = 72;
  const ring = 48;
  const positions: number[] = [];
  const indices: number[] = [];
  const outline: Array<[number, number, number]> = []; // x, z, t
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    // walk the outline: map angle to t along length and side
    const t = 0.5 - 0.5 * Math.cos(a);
    const side = Math.sin(a) >= 0 ? 1 : -1;
    const hw = Math.max(0.0008, halfWidth(spec, t) - opts.inset);
    outline.push([t * spec.length, side * hw, t]);
  }
  // Rows: bottom ring, a few rounded rows, top ring
  const rows = [0, 0.15, 0.5, 0.85, 1];
  for (const r of rows) {
    const bulge = Math.sin(r * Math.PI) * 0.004;
    for (const [x, z, t] of outline) {
      const y = opts.bottom(t) + (opts.top(t) - opts.bottom(t)) * r;
      const s = z === 0 ? 0 : Math.sign(z);
      positions.push(x + (t < 0.02 ? -bulge : t > 0.98 ? bulge : 0), y, z + s * bulge);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < ring; i++) {
      const a = r * ring + i;
      const b = r * ring + ((i + 1) % ring);
      const c = (r + 1) * ring + i;
      const d = (r + 1) * ring + ((i + 1) % ring);
      indices.push(a, b, c, b, d, c);
    }
  }
  // caps (fan around centre)
  const capCentre = (rowIdx: number, flip: boolean) => {
    const y = rowIdx === 0 ? opts.bottom(0.5) : opts.top(0.5);
    const ci = positions.length / 3;
    positions.push(spec.length / 2, y, 0);
    for (let i = 0; i < ring; i++) {
      const a = rowIdx * ring + i;
      const b = rowIdx * ring + ((i + 1) % ring);
      if (flip) indices.push(ci, b, a);
      else indices.push(ci, a, b);
    }
  };
  capCentre(0, false);
  capCentre(rows.length - 1, true);
  void N;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Map (t along length, a around the cross-section) onto the upper surface. */
function upperPoint(spec: ShapeSpec, t0: number, a: number, shrink = 1): THREE.Vector3 {
  const t = Math.min(0.999, Math.max(0.001, t0));
  const hw = halfWidth(spec, t) * 0.97 * shrink;
  const h = spec.upperHeight(t) * shrink;
  const s = Math.sin(a);
  const y = soleTopY(spec, t) - 0.002 + h * Math.pow(Math.max(0, s), 0.75);
  const z = hw * Math.cos(a);
  return new THREE.Vector3(t * spec.length, y, z);
}

function inCollar(spec: ShapeSpec, t: number, a: number) {
  if (!spec.collar) return false;
  const { centre, halfLength, halfAngle } = spec.collar;
  const dt = (t - centre) / halfLength;
  const da = (a - Math.PI / 2) / halfAngle;
  return dt * dt + da * da < 1;
}

function upperGeometry(spec: ShapeSpec, shrink = 1, flip = false, tRange: [number, number] = [0.004, 0.996]) {
  const NT = 90;
  const NA = 64;
  const positions: number[] = [];
  const indices: number[] = [];
  const grid: number[][] = [];
  for (let i = 0; i <= NT; i++) {
    const t = tRange[0] + (tRange[1] - tRange[0]) * (i / NT);
    grid.push([]);
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * Math.PI;
      const p = upperPoint(spec, t, a, shrink);
      grid[i].push(positions.length / 3);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < NT; i++) {
    for (let j = 0; j < NA; j++) {
      const t = tRange[0] + (tRange[1] - tRange[0]) * ((i + 0.5) / NT);
      const a = ((j + 0.5) / NA) * Math.PI;
      if (inCollar(spec, t, a)) continue;
      const A = grid[i][j];
      const B = grid[i + 1][j];
      const C = grid[i][j + 1];
      const D = grid[i + 1][j + 1];
      if (flip) indices.push(A, C, B, B, C, D);
      else indices.push(A, B, C, B, D, C);
    }
  }
  // close the heel and toe ends with fans
  const closeEnd = (i: number, reverse: boolean) => {
    const ci = positions.length / 3;
    const t = tRange[0] + (tRange[1] - tRange[0]) * (i / NT);
    const c = upperPoint(spec, t, Math.PI / 2, shrink);
    positions.push(c.x, (c.y + soleTopY(spec, t)) / 2, 0);
    for (let j = 0; j < NA; j++) {
      const a = ((j + 0.5) / NA) * Math.PI;
      if (inCollar(spec, t, a)) continue;
      if (reverse !== flip) indices.push(ci, grid[i][j], grid[i][j + 1]);
      else indices.push(ci, grid[i][j + 1], grid[i][j]);
    }
  };
  closeEnd(0, true);
  closeEnd(NT, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Padded tube around the collar opening. */
function collarGeometry(spec: ShapeSpec, radius: number) {
  if (!spec.collar) return null;
  const { centre, halfLength, halfAngle } = spec.collar;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 80; i++) {
    const th = (i / 80) * Math.PI * 2;
    const t = centre + Math.cos(th) * halfLength * 1.01;
    const a = Math.PI / 2 + Math.sin(th) * halfAngle * 1.01;
    pts.push(upperPoint(spec, t, a));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  return new THREE.TubeGeometry(curve, 160, radius, 10, true);
}

/** A tube that follows the upper surface along a path in (t, a) space. */
function surfaceStripe(spec: ShapeSpec, path: Array<[number, number]>, radius: number, lift = 0.002) {
  const pts = path.map(([t, a]) => {
    const p = upperPoint(spec, t, a);
    const n = new THREE.Vector3(0, Math.sin(a), Math.cos(a)).normalize();
    return p.add(n.multiplyScalar(lift));
  });
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 64, radius, 8, false);
}

function laces(spec: ShapeSpec, from: number, to: number, count: number, radius = 0.0028) {
  const geos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const t = from + ((to - from) * k) / Math.max(1, count - 1);
    const path: Array<[number, number]> = [];
    for (let s = 0; s <= 8; s++) path.push([t + (s % 2 ? 0.004 : 0), Math.PI / 2 - 0.42 + (0.84 * s) / 8]);
    geos.push(surfaceStripe(spec, path, radius, 0.004));
  }
  return mergeAll(geos);
}

function strap(spec: ShapeSpec, t: number, widthT: number, aFrom: number, aTo: number, thickness: number) {
  // A curved band laid over the upper.
  const NA = 32;
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = [t - widthT / 2, t + widthT / 2];
  for (const [ri, tt] of rows.entries()) {
    for (let layer = 0; layer < 2; layer++) {
      for (let j = 0; j <= NA; j++) {
        const a = aFrom + ((aTo - aFrom) * j) / NA;
        const p = upperPoint(spec, tt, a);
        const n = new THREE.Vector3(0, Math.sin(a), Math.cos(a)).normalize();
        p.add(n.multiplyScalar(0.0015 + layer * thickness));
        positions.push(p.x, p.y, p.z);
      }
    }
    void ri;
  }
  const row = NA + 1;
  const idx = (r: number, layer: number, j: number) => (r * 2 + layer) * row + j;
  for (let j = 0; j < NA; j++) {
    // outer
    indices.push(idx(0, 1, j), idx(1, 1, j), idx(0, 1, j + 1), idx(1, 1, j), idx(1, 1, j + 1), idx(0, 1, j + 1));
    // inner
    indices.push(idx(0, 0, j), idx(0, 0, j + 1), idx(1, 0, j), idx(1, 0, j), idx(0, 0, j + 1), idx(1, 0, j + 1));
    // edges
    indices.push(idx(0, 0, j), idx(0, 1, j), idx(0, 0, j + 1), idx(0, 1, j), idx(0, 1, j + 1), idx(0, 0, j + 1));
    indices.push(idx(1, 0, j), idx(1, 0, j + 1), idx(1, 1, j), idx(1, 1, j), idx(1, 0, j + 1), idx(1, 1, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function mergeAll(geos: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0 : g0;
    const pos = g.getAttribute("position");
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const nor = g.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) indices.push(g.index.getX(i) + offset);
    else for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    offset += pos.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  out.setIndex(indices);
  return out;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type Palette = { upper: string; accent: string; sole: string; outsole: string; lining: string; lace?: string };

const SURF = {
  leather: (c: string): Surface => ({ color: hex(c), roughness: 0.42 }),
  mesh: (c: string): Surface => ({ color: hex(c), roughness: 0.82 }),
  rubber: (c: string): Surface => ({ color: hex(c), roughness: 0.9 }),
  foam: (c: string): Surface => ({ color: hex(c), roughness: 0.65 }),
  suede: (c: string): Surface => ({ color: hex(c), roughness: 0.95 }),
  metal: (c: string): Surface => ({ color: hex(c), roughness: 0.25, metalness: 1 }),
};

function baseParts(spec: ShapeSpec, p: Palette, upperSurface: Surface, opts: { collarRadius?: number } = {}): Part[] {
  const parts: Part[] = [];
  parts.push({
    name: "outsole",
    geometry: soleGeometry(spec, { inset: -0.0015, bottom: (t) => baseY(spec, t), top: (t) => baseY(spec, t) + 0.006 }),
    surface: SURF.rubber(p.outsole),
  });
  parts.push({
    name: "midsole",
    geometry: soleGeometry(spec, { inset: 0, bottom: (t) => baseY(spec, t) + 0.005, top: (t) => soleTopY(spec, t) }),
    surface: SURF.foam(p.sole),
  });
  parts.push({ name: "upper", geometry: upperGeometry(spec), surface: upperSurface });
  parts.push({ name: "lining", geometry: upperGeometry(spec, 0.94, true), surface: SURF.suede(p.lining) });
  const collar = collarGeometry(spec, opts.collarRadius ?? 0.0055);
  if (collar) parts.push({ name: "collar", geometry: collar, surface: SURF.suede(p.lining) });
  return parts;
}

function runner(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.28,
    width: 0.05,
    soleThickness: 0.024,
    heelLift: 0.012,
    toeSpring: 0.012,
    upperHeight: (t) => 0.02 + 0.055 * Math.sin(Math.PI * Math.pow(Math.min(1, t * 1.02), 0.85)) + 0.018 * (1 - smooth(0, 0.3, t)),
    collar: { centre: 0.18, halfLength: 0.2, halfAngle: 0.62 },
  };
  const parts = baseParts(spec, p, SURF.mesh(p.upper));
  parts.push({ name: "laces", geometry: laces(spec, 0.42, 0.66, 6), surface: SURF.mesh(p.lace ?? p.lining) });
  const swoosh: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) swoosh.push([0.12 + i * 0.045, 0.32 + 0.35 * Math.sin((i / 12) * Math.PI) * (1 - i / 16)]);
  parts.push({ name: "stripe", geometry: surfaceStripe(spec, swoosh, 0.004), surface: SURF.leather(p.accent) });
  const swoosh2 = swoosh.map(([t, a]) => [t, Math.PI - a] as [number, number]);
  parts.push({ name: "stripe-medial", geometry: surfaceStripe(spec, swoosh2, 0.004), surface: SURF.leather(p.accent) });
  parts.push({ name: "heel-tab", geometry: surfaceStripe(spec, [[0.01, Math.PI / 2 - 0.3], [0.004, Math.PI / 2], [0.01, Math.PI / 2 + 0.3]], 0.006), surface: SURF.leather(p.accent) });
  return parts;
}

function court(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.28,
    width: 0.051,
    soleThickness: 0.026,
    heelLift: 0.004,
    toeSpring: 0.006,
    upperHeight: (t) => 0.026 + 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.0)) * (t > 0.5 ? 1 : 0.85 + 0.3 * t) ,
    collar: { centre: 0.17, halfLength: 0.21, halfAngle: 0.66 },
  };
  const parts = baseParts(spec, p, SURF.leather(p.upper), { collarRadius: 0.0065 });
  parts.push({ name: "laces", geometry: laces(spec, 0.42, 0.64, 6, 0.0026), surface: SURF.mesh(p.lace ?? p.upper) });
  // heel counter panel and toe-cap stitch line
  parts.push({ name: "heel-panel", geometry: strap(spec, 0.06, 0.1, 0.25, Math.PI - 0.25, 0.0015), surface: SURF.leather(p.accent) });
  parts.push({ name: "side-stripe", geometry: surfaceStripe(spec, [[0.3, 0.28], [0.36, 0.55], [0.42, 0.85]], 0.005), surface: SURF.leather(p.accent) });
  parts.push({ name: "side-stripe-medial", geometry: surfaceStripe(spec, [[0.3, Math.PI - 0.28], [0.36, Math.PI - 0.55], [0.42, Math.PI - 0.85]], 0.005), surface: SURF.leather(p.accent) });
  return parts;
}

function highTop(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.285,
    width: 0.052,
    soleThickness: 0.028,
    heelLift: 0.004,
    toeSpring: 0.008,
    upperHeight: (t) => 0.028 + 0.05 * Math.sin(Math.PI * Math.min(1, t)) + 0.09 * (1 - smooth(0.05, 0.42, t)),
    collar: { centre: 0.16, halfLength: 0.17, halfAngle: 0.5 },
  };
  const parts = baseParts(spec, p, SURF.leather(p.upper), { collarRadius: 0.007 });
  parts.push({ name: "laces", geometry: laces(spec, 0.36, 0.64, 8, 0.0026), surface: SURF.mesh(p.lace ?? p.lining) });
  parts.push({ name: "ankle-patch", geometry: strap(spec, 0.13, 0.08, 0.15, 0.7, 0.0015), surface: SURF.leather(p.accent) });
  parts.push({ name: "toe-cap", geometry: strap(spec, 0.92, 0.12, 0.2, Math.PI - 0.2, 0.0012), surface: SURF.rubber(p.sole) });
  return parts;
}

function chelsea(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.29,
    width: 0.048,
    soleThickness: 0.016,
    heelLift: 0.014,
    toeSpring: 0.006,
    upperHeight: (t) => 0.03 + 0.045 * Math.sin(Math.PI * Math.min(1, t)) + 0.12 * (1 - smooth(0.12, 0.45, t)),
    collar: { centre: 0.17, halfLength: 0.15, halfAngle: 0.42 },
  };
  const parts = baseParts(spec, p, SURF.leather(p.upper), { collarRadius: 0.004 });
  parts.push({ name: "elastic-lateral", geometry: strap(spec, 0.2, 0.07, 0.25, 0.75, 0.001), surface: SURF.mesh(p.accent) });
  parts.push({ name: "elastic-medial", geometry: strap(spec, 0.2, 0.07, Math.PI - 0.75, Math.PI - 0.25, 0.001), surface: SURF.mesh(p.accent) });
  parts.push({ name: "pull-tab", geometry: surfaceStripe(spec, [[0.03, Math.PI / 2 - 0.15], [0.005, Math.PI / 2 + 0.3], [0.03, Math.PI / 2 + 0.6]], 0.004, 0.01), surface: SURF.mesh(p.accent) });
  return parts;
}

function hiker(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.295,
    width: 0.054,
    soleThickness: 0.03,
    heelLift: 0.008,
    toeSpring: 0.014,
    upperHeight: (t) => 0.03 + 0.05 * Math.sin(Math.PI * Math.min(1, t)) + 0.1 * (1 - smooth(0.08, 0.45, t)),
    collar: { centre: 0.17, halfLength: 0.17, halfAngle: 0.5 },
  };
  const parts = baseParts(spec, p, SURF.suede(p.upper), { collarRadius: 0.009 });
  parts.push({ name: "laces", geometry: laces(spec, 0.33, 0.66, 8, 0.003), surface: SURF.mesh(p.lace ?? "#c2410c") });
  parts.push({ name: "mudguard", geometry: strap(spec, 0.86, 0.26, 0.05, Math.PI - 0.05, 0.0015), surface: SURF.rubber(p.accent) });
  parts.push({ name: "heel-guard", geometry: strap(spec, 0.05, 0.1, 0.05, Math.PI - 0.05, 0.0015), surface: SURF.rubber(p.accent) });
  return parts;
}

function loafer(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.285,
    width: 0.047,
    soleThickness: 0.012,
    heelLift: 0.016,
    toeSpring: 0.005,
    upperHeight: (t) => 0.024 + 0.044 * Math.sin(Math.PI * Math.min(1, t * 1.02)) + 0.008 * (1 - smooth(0, 0.2, t)),
    collar: { centre: 0.25, halfLength: 0.27, halfAngle: 0.78 },
  };
  const parts = baseParts(spec, p, SURF.leather(p.upper), { collarRadius: 0.004 });
  parts.push({ name: "saddle", geometry: strap(spec, 0.57, 0.05, 0.6, Math.PI - 0.6, 0.002), surface: SURF.leather(p.accent) });
  parts.push({ name: "apron-seam", geometry: surfaceStripe(spec, Array.from({ length: 13 }, (_, i) => [0.6 + 0.3 * Math.sin((i / 12) * Math.PI), 0.55 + ((Math.PI - 1.1) * i) / 12] as [number, number]), 0.0018), surface: SURF.leather(p.accent) });
  return parts;
}

function pump(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.26,
    width: 0.041,
    soleThickness: 0.006,
    heelLift: 0,
    toeSpring: 0.004,
    heelHeight: 0.075,
    upperHeight: (t) => 0.016 + 0.03 * Math.sin(Math.PI * Math.min(1, t)) * smooth(0.45, 0.8, t) + 0.014 * (1 - smooth(0, 0.3, t)),
    collar: { centre: 0.36, halfLength: 0.36, halfAngle: 0.92 },
  };
  const parts = baseParts(spec, p, SURF.leather(p.upper), { collarRadius: 0.0022 });
  // stiletto heel block: tapered cylinder under the heel
  const heel = new THREE.CylinderGeometry(0.009, 0.004, spec.heelHeight!, 20);
  heel.translate(0.026, spec.heelHeight! / 2, 0);
  parts.push({ name: "heel", geometry: heel, surface: SURF.leather(p.accent) });
  const tip = new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 16);
  tip.translate(0.026, 0.003, 0);
  parts.push({ name: "heel-tip", geometry: tip, surface: SURF.rubber(p.outsole) });
  return parts;
}

function balletFlat(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.255,
    width: 0.043,
    soleThickness: 0.008,
    heelLift: 0.004,
    toeSpring: 0.003,
    upperHeight: (t) => 0.018 + 0.03 * Math.sin(Math.PI * Math.min(1, t)) * smooth(0.4, 0.8, t) + 0.012 * (1 - smooth(0, 0.3, t)),
    collar: { centre: 0.36, halfLength: 0.36, halfAngle: 0.95 },
  };
  const parts = baseParts(spec, p, SURF.leather(p.upper), { collarRadius: 0.003 });
  const bow = new THREE.TorusKnotGeometry(0.008, 0.0025, 64, 8, 2, 1);
  const tip = upperPoint(spec, 0.73, Math.PI / 2);
  bow.scale(1, 0.6, 1.4);
  bow.translate(tip.x, tip.y + 0.004, tip.z);
  parts.push({ name: "bow", geometry: bow, surface: SURF.leather(p.accent) });
  return parts;
}

function slide(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.27,
    width: 0.05,
    soleThickness: 0.028,
    heelLift: 0.004,
    toeSpring: 0.004,
    upperHeight: () => 0.04,
    collar: null,
  };
  const parts: Part[] = [
    {
      name: "outsole",
      geometry: soleGeometry(spec, { inset: -0.001, bottom: (t) => baseY(spec, t), top: (t) => baseY(spec, t) + 0.007 }),
      surface: SURF.rubber(p.outsole),
    },
    {
      name: "footbed",
      geometry: soleGeometry(spec, { inset: 0, bottom: (t) => baseY(spec, t) + 0.006, top: (t) => soleTopY(spec, t) }),
      surface: SURF.foam(p.sole),
    },
  ];
  // wide band over the forefoot
  const bandSpec: ShapeSpec = { ...spec, upperHeight: () => 0.045 };
  parts.push({ name: "band", geometry: strap(bandSpec, 0.66, 0.22, 0.02, Math.PI - 0.02, 0.006), surface: SURF.leather(p.upper) });
  parts.push({ name: "band-logo", geometry: strap(bandSpec, 0.66, 0.06, 1.1, Math.PI - 1.1, 0.008), surface: SURF.leather(p.accent) });
  return parts;
}

function sandal(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.26,
    width: 0.046,
    soleThickness: 0.018,
    heelLift: 0.006,
    toeSpring: 0.004,
    upperHeight: () => 0.032,
    collar: null,
  };
  const parts: Part[] = [
    {
      name: "outsole",
      geometry: soleGeometry(spec, { inset: -0.001, bottom: (t) => baseY(spec, t), top: (t) => baseY(spec, t) + 0.006 }),
      surface: SURF.rubber(p.outsole),
    },
    {
      name: "footbed",
      geometry: soleGeometry(spec, { inset: 0, bottom: (t) => baseY(spec, t) + 0.005, top: (t) => soleTopY(spec, t) }),
      surface: SURF.foam(p.sole),
    },
  ];
  for (const [t, w] of [
    [0.8, 0.05],
    [0.6, 0.05],
    [0.12, 0.04],
  ] as const) {
    parts.push({ name: `strap-${t}`, geometry: strap({ ...spec, upperHeight: () => (t < 0.3 ? 0.05 : 0.036) }, t, w, 0.02, Math.PI - 0.02, 0.003), surface: SURF.leather(t < 0.3 ? p.accent : p.upper) });
  }
  const buckle = new THREE.TorusGeometry(0.007, 0.0015, 8, 24);
  const bp = upperPoint({ ...spec, upperHeight: () => 0.05 }, 0.12, 0.25);
  buckle.rotateY(Math.PI / 2);
  buckle.translate(bp.x, bp.y, bp.z + 0.003);
  parts.push({ name: "buckle", geometry: buckle, surface: SURF.metal("#d4af37") });
  return parts;
}

function kidsVelcro(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.19,
    width: 0.04,
    soleThickness: 0.02,
    heelLift: 0.004,
    toeSpring: 0.01,
    upperHeight: (t) => 0.024 + 0.045 * Math.sin(Math.PI * Math.min(1, t)) + 0.02 * (1 - smooth(0.0, 0.35, t)),
    collar: { centre: 0.16, halfLength: 0.19, halfAngle: 0.62 },
  };
  const parts = baseParts(spec, p, SURF.mesh(p.upper), { collarRadius: 0.006 });
  parts.push({ name: "strap-1", geometry: strap(spec, 0.46, 0.07, 0.35, Math.PI - 0.1, 0.004), surface: SURF.leather(p.accent) });
  parts.push({ name: "strap-2", geometry: strap(spec, 0.6, 0.07, 0.35, Math.PI - 0.1, 0.004), surface: SURF.leather(p.accent) });
  parts.push({ name: "toe-bumper", geometry: strap(spec, 0.93, 0.12, 0.1, Math.PI - 0.1, 0.002), surface: SURF.rubber(p.sole) });
  const star: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) star.push([0.2 + 0.04 * Math.cos((i / 10) * Math.PI * 2), 0.5 + 0.18 * Math.sin((i / 10) * Math.PI * 2)]);
  parts.push({ name: "badge", geometry: surfaceStripe(spec, star, 0.003), surface: SURF.leather(p.lace ?? "#facc15") });
  return parts;
}

function kidsHigh(p: Palette): Part[] {
  const spec: ShapeSpec = {
    length: 0.195,
    width: 0.041,
    soleThickness: 0.021,
    heelLift: 0.002,
    toeSpring: 0.008,
    upperHeight: (t) => 0.022 + 0.04 * Math.sin(Math.PI * Math.min(1, t)) + 0.06 * (1 - smooth(0.05, 0.42, t)),
    collar: { centre: 0.16, halfLength: 0.17, halfAngle: 0.5 },
  };
  const parts = baseParts(spec, p, SURF.leather(p.upper), { collarRadius: 0.006 });
  parts.push({ name: "laces", geometry: laces(spec, 0.36, 0.64, 6, 0.0022), surface: SURF.mesh(p.lace ?? "#ffffff") });
  parts.push({ name: "toe-cap", geometry: strap(spec, 0.92, 0.12, 0.15, Math.PI - 0.15, 0.0015), surface: SURF.rubber(p.sole) });
  parts.push({ name: "ankle-patch", geometry: strap(spec, 0.12, 0.08, 0.15, 0.7, 0.0015), surface: SURF.leather(p.accent) });
  return parts;
}

const STYLES = { runner, court, highTop, chelsea, hiker, loafer, pump, balletFlat, slide, sandal, kidsVelcro, kidsHigh };

export const MODEL_SPECS: Array<{ file: string; style: keyof typeof STYLES; palette: Palette }> = [
  { file: "aero-runner-cobalt", style: "runner", palette: { upper: "#1d4ed8", accent: "#f8fafc", sole: "#f1f5f9", outsole: "#1e293b", lining: "#0f172a", lace: "#e2e8f0" } },
  { file: "aero-runner-coral", style: "runner", palette: { upper: "#fb7185", accent: "#fff7ed", sole: "#fff7ed", outsole: "#9f1239", lining: "#4c0519", lace: "#ffe4e6" } },
  { file: "court-classic-white", style: "court", palette: { upper: "#f8fafc", accent: "#166534", sole: "#f1f5f9", outsole: "#d6d3d1", lining: "#e7e5e4" } },
  { file: "court-classic-blush", style: "court", palette: { upper: "#fce7f3", accent: "#be185d", sole: "#fafaf9", outsole: "#e7e5e4", lining: "#fdf2f8" } },
  { file: "summit-high-black", style: "highTop", palette: { upper: "#18181b", accent: "#dc2626", sole: "#fafafa", outsole: "#27272a", lining: "#3f3f46", lace: "#fafafa" } },
  { file: "chelsea-tan", style: "chelsea", palette: { upper: "#92400e", accent: "#1c1917", sole: "#292524", outsole: "#1c1917", lining: "#451a03" } },
  { file: "trail-hiker-olive", style: "hiker", palette: { upper: "#57534e", accent: "#3f6212", sole: "#1c1917", outsole: "#0c0a09", lining: "#292524", lace: "#ea580c" } },
  { file: "penny-loafer-burgundy", style: "loafer", palette: { upper: "#7f1d1d", accent: "#450a0a", sole: "#1c1917", outsole: "#0c0a09", lining: "#d6d3d1" } },
  { file: "stiletto-pump-noir", style: "pump", palette: { upper: "#0a0a0a", accent: "#0a0a0a", sole: "#7f1d1d", outsole: "#0a0a0a", lining: "#d6c6b8" } },
  { file: "stiletto-pump-nude", style: "pump", palette: { upper: "#d6b39a", accent: "#c8a083", sole: "#a16207", outsole: "#57534e", lining: "#f5e6da" } },
  { file: "ballet-flat-rose", style: "balletFlat", palette: { upper: "#f9a8d4", accent: "#be185d", sole: "#fdf2f8", outsole: "#9d174d", lining: "#fff1f2" } },
  { file: "cloud-slide-sand", style: "slide", palette: { upper: "#d6c7a1", accent: "#78716c", sole: "#f5f5f4", outsole: "#a8a29e", lining: "#e7e5e4" } },
  { file: "riviera-sandal-cognac", style: "sandal", palette: { upper: "#b45309", accent: "#78350f", sole: "#e7d5bd", outsole: "#44403c", lining: "#e7d5bd" } },
  { file: "kids-velcro-sky", style: "kidsVelcro", palette: { upper: "#38bdf8", accent: "#f97316", sole: "#ffffff", outsole: "#0369a1", lining: "#0c4a6e", lace: "#facc15" } },
  { file: "kids-velcro-berry", style: "kidsVelcro", palette: { upper: "#c026d3", accent: "#22d3ee", sole: "#ffffff", outsole: "#701a75", lining: "#4a044e", lace: "#fde047" } },
  { file: "kids-high-lime", style: "kidsHigh", palette: { upper: "#84cc16", accent: "#1e3a8a", sole: "#fafafa", outsole: "#365314", lining: "#1a2e05", lace: "#ffffff" } },
];

async function writeGlb(file: string, parts: Part[]) {
  const doc = new Document();
  doc.createBuffer();
  const buffer = doc.getRoot().listBuffers()[0];
  const scene = doc.createScene("Shoe");
  const root = doc.createNode("Shoe");
  scene.addChild(root);
  const matCache = new Map<string, GMaterial>();

  // Centre the shoe on the origin, resting on y = 0.
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox!);
  }
  const centre = box.getCenter(new THREE.Vector3());

  for (const part of parts) {
    const g = part.geometry.index ? part.geometry : part.geometry;
    g.translate(-centre.x, -box.min.y, -centre.z);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const pos = g.getAttribute("position").array as Float32Array;
    const nor = g.getAttribute("normal").array as Float32Array;
    const key = JSON.stringify(part.surface);
    let mat = matCache.get(key);
    if (!mat) {
      mat = doc
        .createMaterial(part.name)
        .setBaseColorFactor([...part.surface.color, 1])
        .setRoughnessFactor(part.surface.roughness)
        .setMetallicFactor(part.surface.metalness ?? 0)
        .setDoubleSided(part.name === "upper" || part.name.startsWith("strap") || part.name === "band");
      matCache.set(key, mat);
    }
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(nor)).setBuffer(buffer))
      .setMaterial(mat);
    if (g.index) {
      const idx = g.index.array;
      const arr = pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
      prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(arr).setBuffer(buffer));
    }
    const mesh = doc.createMesh(part.name).addPrimitive(prim);
    root.addChild(doc.createNode(part.name).setMesh(mesh));
  }
  doc.getRoot().getAsset().generator = "stridehaus parametric shoe generator (CC0)";
  await new NodeIO().write(file, doc);
}

async function main() {
  for (const spec of MODEL_SPECS) {
    const parts = STYLES[spec.style](spec.palette);
    const file = path.join(outDir, `${spec.file}.glb`);
    await writeGlb(file, parts);
    console.log("wrote", file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
