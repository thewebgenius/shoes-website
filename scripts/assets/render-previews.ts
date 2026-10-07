/**
 * Renders every GLB in seed-assets/models to a studio product image using
 * headless Chromium + three.js. The renders are used as seed product photos
 * and as reference images for the visual-search index.
 *
 * Usage: npx tsx scripts/assets/render-previews.ts [--bg=#ffffff] [--out=seed-assets/images] [--angle=front34] [--only=name]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(__dirname, "../..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const outDir = path.resolve(root, args.out ?? "seed-assets/images");
const bg = args.bg ?? "#ffffff";
const angle = args.angle ?? "front34";
const only = args.only as string | undefined;
const size = Number(args.size ?? 1000);

const MIME: Record<string, string> = { ".js": "text/javascript", ".glb": "model/gltf-binary", ".html": "text/html" };

const page = `<!doctype html><html><head><style>html,body{margin:0;background:${bg}}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head>
<body><script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const size = ${size};
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setSize(size, size);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("${bg}");
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 4, 3); key.castShadow = true; scene.add(key);
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.12 }));
shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.receiveShadow = true; scene.add(shadowPlane);
window.renderModel = async (url, angle) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  const obj = gltf.scene;
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const box = new THREE.Box3().setFromObject(obj);
  const sizeV = box.getSize(new THREE.Vector3());
  const s = 1 / Math.max(sizeV.x, sizeV.y, sizeV.z);
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(obj);
  const c = box2.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, box2.min.y, c.z));
  // Long axis along X: rotate if the model is longer along Z.
  if (sizeV.z > sizeV.x) obj.rotation.y = Math.PI / 2;
  scene.add(obj);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const h = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y;
  const views = { front34: [1.35, 0.85, 1.55], side: [0.0, 0.35, 2.3], top: [0.2, 2.2, 0.6], back34: [-1.4, 0.8, -1.4] };
  const v = views[angle] || views.front34;
  cam.position.set(v[0], v[1], v[2]);
  cam.lookAt(0, h * 0.42, 0);
  renderer.render(scene, cam);
  return true;
};
window.ready = true;
</script></body></html>`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file: string | null = null;
    if (url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(page);
    }
    if (url.startsWith("/three/")) file = path.join(root, "node_modules", url);
    if (url.startsWith("/models/")) file = path.join(root, "seed-assets", url);
    if (!file || !file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const models = fs.readdirSync(path.join(root, "seed-assets/models")).filter((f) => f.endsWith(".glb") && (!only || f.includes(only)));
  for (const m of models) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    p.on("pageerror", (e) => console.error(m, e.message));
    await p.goto(`http://127.0.0.1:${port}/`);
    await p.waitForFunction(() => (window as any).ready === true);
    await p.evaluate(([u, a]) => (window as any).renderModel(u, a), [`/models/${m}`, angle]);
    const out = path.join(outDir, m.replace(/\.glb$/, `${angle === "front34" ? "" : "-" + angle}.png`));
    await p.locator("canvas").screenshot({ path: out });
    console.log("rendered", out);
    await p.close();
  }
  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
