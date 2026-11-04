import * as THREE from "three";
import { Crowd, type Person, type Status } from "./crowd";
import type { OfficePlan } from "./layout";
import { Town, phaseAt, SKY, type Phase } from "./town";

/**
 * The 3D office view. Same interface as the 2D PixelOffice (setAgents, agentAt,
 * labelPositions, selectedId, destroy), so the page can switch between them.
 * Block-style, low-poly, all geometry made here (no outside models or art).
 */

export interface Office3DAgent {
  id: string;
  name: string;
  status: Status;
  tool?: string;
  /** Office character 0–5 (hair / skin / trousers). */
  look?: number;
  /** Shirt colour (the agent's colour). */
  color?: string;
  meetWith?: string;
}

export interface LabelPosition {
  id: string;
  x: number;
  y: number;
  seated: boolean;
}

const SKIN = ["#f1c27d", "#e0ac69", "#8d5524", "#ffdbac", "#c68642", "#f5d0b5"];
const HAIR = ["#5a3a22", "#d4a017", "#1b1b1b", "#e6e6e6", "#7a3e12", "#2b1d16"];
const PANTS = ["#2f3e5c", "#3a3a3a", "#4b3b2a", "#2e4a3b", "#333344", "#5c2f3e"];

const WALL_H = 2.3;
const DESK_SPAN = 7.4;

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  ring: THREE.Mesh;
  shirt: THREE.MeshStandardMaterial;
  key: string;
};

export class Office3D {
  selectedId: string | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  private crowd = new Crowd();
  private rigs = new Map<string, Rig>();
  private furniture = new THREE.Group();
  private screens: THREE.MeshStandardMaterial[] = [];
  private builtFor = -1;
  private raf = 0;
  private last = 0;
  private observer: ResizeObserver;
  private agents: Office3DAgent[] = [];
  private town?: Town;
  private phase: Phase = "day";
  private phaseCheck = 0;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private deskLamps: THREE.MeshStandardMaterial[] = [];

  static supported(): boolean {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: { onFrame?: () => void } = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(SKY.day);

    this.hemi = new THREE.HemisphereLight("#fff7ec", "#6d7a5a", 1.7);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    this.sun = sun;
    sun.position.set(-6, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);
    this.scene.add(this.furniture);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.applyPhase(phaseAt());
    this.raf = requestAnimationFrame(this.frame);
  }

  private applyPhase(p: Phase) {
    this.phase = p;
    const look = {
      day: { sky: SKY.day, hemi: ["#fff7ec", "#6d7a5a", 1.7], sun: ["#fff4e0", 2.3, [-6, 14, 9]] },
      dusk: { sky: SKY.dusk, hemi: ["#ffd9b8", "#4a3f66", 1.25], sun: ["#ff9a5c", 1.7, [-12, 6, 7]] },
      night: { sky: SKY.night, hemi: ["#8fa6ff", "#1a1f3a", 1.0], sun: ["#9db4ff", 0.8, [-6, 14, 9]] },
    }[p] as { sky: string; hemi: [string, string, number]; sun: [string, number, [number, number, number]] };
    (this.scene.background as THREE.Color).set(look.sky);
    this.hemi.color.set(look.hemi[0]);
    this.hemi.groundColor.set(look.hemi[1]);
    this.hemi.intensity = look.hemi[2];
    this.sun.color.set(look.sun[0]);
    this.sun.intensity = look.sun[1];
    this.sun.position.set(...look.sun[2]);
    this.town?.setPhase(p);
  }

  // -------------------------------------------------------------------------
  // Public interface (same as PixelOffice)

  setAgents(agents: Office3DAgent[]) {
    this.agents = agents;
    const now = performance.now() / 1000;
    this.crowd.setAgents(agents.map((a) => ({ id: a.id, status: a.status, meetWith: a.meetWith })), now);
    if (this.crowd.plan.desks.length !== this.builtFor) this.buildRoom(this.crowd.plan);
    const ids = new Set(agents.map((a) => a.id));
    for (const [id, rig] of this.rigs) {
      if (!ids.has(id)) {
        this.scene.remove(rig.root);
        this.rigs.delete(id);
      }
    }
    for (const a of agents) {
      const look = (a.look ?? hash(a.id)) % SKIN.length;
      const key = `${look}|${a.color ?? ""}`;
      const rig = this.rigs.get(a.id);
      if (rig && rig.key === key) continue;
      if (rig) this.scene.remove(rig.root);
      const next = makeRig(a.id, look, a.color ?? "#6c7bd8");
      this.rigs.set(a.id, next);
      this.scene.add(next.root);
    }
  }

  agentAt(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects([...this.rigs.values()].map((r) => r.root), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.agentId) o = o.parent;
      if (o) return String(o.userData.agentId);
    }
    return null;
  }

  labelPositions(): LabelPosition[] {
    const rect = this.canvas.getBoundingClientRect();
    const out: LabelPosition[] = [];
    const v = new THREE.Vector3();
    for (const p of this.crowd.list()) {
      const rig = this.rigs.get(p.id);
      if (!rig) continue;
      v.set(rig.root.position.x, rig.root.position.y + (p.pose === "sit" ? 1.25 : 1.55), rig.root.position.z).project(this.camera);
      out.push({ id: p.id, x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, seated: p.pose === "sit" });
    }
    return out;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------------

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setSize(w, h, false);
    const plan = this.crowd.plan;
    const cx = (plan.minX + plan.maxX) / 2;
    const cz = (plan.minZ + plan.maxZ) / 2;
    // Isometric-ish view from the south-east.
    const dir = new THREE.Vector3(0.9, 1.25, 1.35).normalize();
    this.camera.position.set(cx + dir.x * 40, dir.y * 40, cz + dir.z * 40);
    this.camera.lookAt(cx, 0, cz);
    this.camera.updateMatrixWorld();
    // Fit the floor and walls: project the room's corners into camera space.
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const M = 2.6; // a strip of town around the office stays in view
    for (const x of [plan.minX - M, plan.maxX + M]) for (const z of [plan.minZ - M, plan.maxZ + M]) for (const y of [0, WALL_H]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const pad = 0.6;
    let halfW = (maxX - minX) / 2 + pad;
    let halfH = (maxY - minY) / 2 + pad;
    if (halfW / halfH > w / h) halfH = halfW / (w / h);
    else halfW = halfH * (w / h);
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    Object.assign(this.camera, { left: mx - halfW, right: mx + halfW, top: my + halfH, bottom: my - halfH });
    this.camera.updateProjectionMatrix();
  }

  private frame = (ms: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const now = ms / 1000;
    const dt = Math.min(0.1, this.last ? now - this.last : 0);
    this.last = now;
    this.crowd.update(dt, now);
    this.town?.update(now, dt);
    if (now - this.phaseCheck > 30) {
      this.phaseCheck = now;
      const p = phaseAt();
      if (p !== this.phase) this.applyPhase(p);
    }
    const typingDesks = new Map<number, "typing" | "waiting">();
    for (const p of this.crowd.list()) {
      const rig = this.rigs.get(p.id);
      if (!rig) continue;
      pose(rig, p, now, this.selectedId === p.id);
      if (p.place.kind === "desk" && !p.path.length) {
        if (p.typing) typingDesks.set(p.desk, "typing");
        else if (p.status === "waiting-for-human") typingDesks.set(p.desk, "waiting");
      }
    }
    this.screens.forEach((m, i) => {
      const s = typingDesks.get(i);
      m.emissive.set(s === "typing" ? "#5fb3ff" : s === "waiting" ? "#ffb547" : "#1a2236");
      m.emissiveIntensity = s ? 0.9 + Math.sin(now * 6 + i) * 0.1 : 0.4;
    });
    const statusOf = new Map<number, Status>();
    for (const p of this.crowd.list()) statusOf.set(p.desk, p.status);
    this.deskLamps.forEach((m, i) => {
      const s = statusOf.get(i);
      const c = s === "working" || s === "thinking" ? "#4f9dff" : s === "waiting-for-human" ? "#ffb020" : s === "failed" ? "#ff4d5e" : s === "done" ? "#3ddc84" : "#556070";
      m.emissive.set(c);
      m.color.set(c);
      m.emissiveIntensity = s && s !== "idle" ? 1.4 + Math.sin(now * 4 + i) * 0.4 : 0.15;
    });
    this.renderer.render(this.scene, this.camera);
    this.opts.onFrame?.();
  };

  // -------------------------------------------------------------------------
  // Room

  private buildRoom(plan: OfficePlan) {
    this.builtFor = plan.desks.length;
    this.scene.remove(this.furniture);
    this.furniture.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.furniture = new THREE.Group();
    this.screens = [];
    this.deskLamps = [];
    this.scene.remove(this.town?.group ?? new THREE.Group());
    this.town = new Town(plan);
    this.scene.add(this.town.group);
    this.town.setPhase(this.phase);
    const g = this.furniture;
    const W = plan.maxX - plan.minX;
    const D = plan.maxZ - plan.minZ;

    // The building's base, so the cut-away room reads as a building and not a floating tile.
    g.add(box(W + 0.5, 0.45, D + 0.5, "#cdbfae", (plan.minX + plan.maxX) / 2 + 0.25, -0.28, (plan.minZ + plan.maxZ) / 2 + 0.25, { receive: true }));
    g.add(box(W + 0.55, 0.06, D + 0.55, "#8e7f6e", (plan.minX + plan.maxX) / 2 + 0.25, -0.03, (plan.minZ + plan.maxZ) / 2 + 0.25));
    // Floor: warm wood for the desks, blue carpet for the lounge, a lighter corridor.
    g.add(box(W, 0.1, D, "#b98a5e", (plan.minX + plan.maxX) / 2, -0.05, (plan.minZ + plan.maxZ) / 2, { receive: true }));
    g.add(box(1.5, 0.012, D, "#cfb08a", plan.corridorX, 0.006, (plan.minZ + plan.maxZ) / 2, { receive: true }));
    const lx = plan.coffeeTable.x;
    g.add(box(4.4, 0.014, 4.6, "#4b67b8", lx, 0.007, plan.coffeeTable.z + 0.6, { receive: true }));
    // Floorboard lines
    for (let x = plan.minX + 0.6; x < plan.corridorX - 0.8; x += 0.6) g.add(box(0.015, 0.011, D, "#a77b52", x, 0.005, (plan.minZ + plan.maxZ) / 2));

    // Walls (north and west) with skirting, windows and a sign.
    g.add(box(W, WALL_H, 0.16, "#ece4d8", (plan.minX + plan.maxX) / 2, WALL_H / 2, plan.minZ - 0.08, { receive: true }));
    g.add(box(0.16, WALL_H, D, "#e4dbcd", plan.minX - 0.08, WALL_H / 2, (plan.minZ + plan.maxZ) / 2, { receive: true }));
    g.add(box(W, 0.12, 0.04, "#8a6a4d", (plan.minX + plan.maxX) / 2, 0.06, plan.minZ + 0.02));
    for (let x = plan.minX + 1.4; x < plan.corridorX - 0.5; x += 2.4) {
      g.add(box(1.3, 0.9, 0.05, "#9fd3ff", x, 1.45, plan.minZ + 0.02, { emissive: "#6fb6ff", emissiveIntensity: 0.35 }));
      g.add(box(1.4, 0.06, 0.08, "#ffffff", x, 0.97, plan.minZ + 0.05));
    }
    // Posters and a whiteboard
    const posters = ["#ff6b9d", "#4f86f7", "#ffd23f", "#06d6a0"];
    for (let i = 0; i < 4; i++) {
      const px = plan.minX + 1.8 + i * 2.4 + (i > 1 ? 0.6 : 0);
      if (px > plan.corridorX - 1) break;
      g.add(box(0.5, 0.7, 0.03, "#ffffff", px, 1.6, plan.minZ + 0.03));
      g.add(box(0.42, 0.28, 0.035, posters[i]!, px, 1.78, plan.minZ + 0.04));
      g.add(box(0.3, 0.05, 0.035, "#c8ccd8", px, 1.5, plan.minZ + 0.04));
      g.add(box(0.22, 0.05, 0.035, "#c8ccd8", px, 1.4, plan.minZ + 0.04));
    }
    g.add(box(0.05, 1.0, 1.7, "#f8fafc", plan.minX + 0.03, 1.5, plan.minZ + 3.2));
    for (let i = 0; i < 4; i++) g.add(box(0.06, 0.04, 0.9 - i * 0.15, ["#e63946", "#2a9d8f", "#4f86f7", "#e9c46a"][i]!, plan.minX + 0.04, 1.8 - i * 0.2, plan.minZ + 3.0 + i * 0.08));
    // Rug under the desks
    g.add(box(DESK_SPAN, 0.014, D - 1.2, "#7d93c9", (plan.minX + plan.corridorX) / 2 - 0.4, 0.008, (plan.minZ + plan.maxZ) / 2 + 0.2, { receive: true }));
    // Pendant lights over the lounge
    for (const dx of [-1.2, 1.2]) {
      g.add(box(0.02, 0.8, 0.02, "#2b2b2b", lx + dx, 2.0, plan.coffeeTable.z + 0.3));
      const lampMat = new THREE.MeshStandardMaterial({ color: "#ffe9b8", emissive: "#ffd27a", emissiveIntensity: 0.9 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lampMat);
      bulb.position.set(lx + dx, 1.55, plan.coffeeTable.z + 0.3);
      g.add(bulb);
    }
    g.add(sign("AGENT TOWN", lx, 1.55, plan.minZ + 0.03));
    // Bookshelf + clock on the west wall
    g.add(box(0.35, 1.6, 1.4, "#7b5a3c", plan.minX + 0.18, 0.8, plan.maxZ - 1.6, { cast: true }));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) g.add(box(0.2, 0.32, 0.18, ["#e76f51", "#2a9d8f", "#e9c46a", "#4f86f7", "#9b5de5"][(i + j) % 5]!, plan.minX + 0.32, 0.35 + i * 0.5, plan.maxZ - 2.1 + j * 0.24));

    // Desks with monitors and chairs
    plan.desks.forEach((d) => {
      g.add(box(1.6, 0.08, 0.85, "#d9b88f", d.x, 0.75, d.z, { cast: true, receive: true }));
      for (const [ox, oz] of [[-0.72, -0.35], [0.72, -0.35], [-0.72, 0.35], [0.72, 0.35]] as const) g.add(box(0.06, 0.75, 0.06, "#6b4f36", d.x + ox, 0.375, d.z + oz));
      // Monitor on the south half of the desk, screen facing the person (north).
      g.add(box(0.08, 0.22, 0.08, "#333", d.x, 0.9, d.z + 0.22));
      g.add(box(0.7, 0.42, 0.05, "#222533", d.x, 1.18, d.z + 0.24, { cast: true }));
      const screen = new THREE.MeshStandardMaterial({ color: "#0e1424", emissive: "#1a2236", emissiveIntensity: 0.4 });
      const sm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.01), screen);
      sm.position.set(d.x, 1.18, d.z + 0.21);
      g.add(sm);
      this.screens.push(screen);
      g.add(box(0.5, 0.025, 0.16, "#e8e8e8", d.x, 0.8, d.z - 0.12));
      g.add(box(0.1, 0.12, 0.1, "#f4f1ea", d.x + 0.55, 0.85, d.z - 0.05)); // mug
      // Status lamp on the monitor: shows what this person is doing at a glance.
      const lamp = new THREE.MeshStandardMaterial({ color: "#556070", emissive: "#556070", emissiveIntensity: 0.15 });
      const lm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lamp);
      lm.position.set(d.x + 0.3, 1.46, d.z + 0.24);
      g.add(lm);
      this.deskLamps.push(lamp);
      // chair (back on the north side)
      const s = d.seat;
      g.add(box(0.5, 0.08, 0.5, "#3d5a80", s.x, 0.44, s.z, { cast: true }));
      g.add(box(0.5, 0.55, 0.08, "#3d5a80", s.x, 0.72, s.z - 0.24, { cast: true }));
      g.add(box(0.06, 0.4, 0.06, "#2b2b2b", s.x, 0.2, s.z));
    });

    // Lounge: three sofas around a coffee table (the meeting spot)
    const tz = plan.coffeeTable.z;
    g.add(box(1.1, 0.35, 0.7, "#8b5e3c", lx, 0.32, tz, { cast: true, receive: true }));
    g.add(box(0.18, 0.1, 0.18, "#f4f1ea", lx + 0.2, 0.54, tz));
    const sofa = "#c0394b";
    g.add(box(2.4, 0.42, 0.75, sofa, lx, 0.21, tz + 1.25, { cast: true }));
    g.add(box(2.4, 0.5, 0.2, sofa, lx, 0.62, tz + 1.55, { cast: true }));
    for (const side of [-1, 1]) {
      g.add(box(0.75, 0.42, 1.5, sofa, lx + side * 1.65, 0.21, tz - 0.25, { cast: true }));
      g.add(box(0.2, 0.5, 1.5, sofa, lx + side * 1.95, 0.62, tz - 0.25, { cast: true }));
    }
    // Plants, water cooler, kitchen counter
    for (const [x, z] of [[plan.minX + 0.4, plan.maxZ - 0.5], [plan.maxX - 0.4, plan.minZ + 0.4], [plan.corridorX - 0.9, plan.minZ + 0.4], [plan.maxX - 0.4, plan.maxZ - 0.4]] as const) g.add(plant(x, z));
    g.add(box(0.4, 1.0, 0.4, "#dfe7ef", plan.maxX - 0.4, 0.5, tz + 2.6, { cast: true }));
    g.add(box(0.3, 0.35, 0.3, "#7cc0ff", plan.maxX - 0.4, 1.2, tz + 2.6, { emissive: "#3a8fd8", emissiveIntensity: 0.2 }));

    this.scene.add(g);
    this.resize();
  }
}

// ---------------------------------------------------------------------------
// Builders

function box(
  w: number,
  h: number,
  d: number,
  color: string,
  x: number,
  y: number,
  z: number,
  o: { cast?: boolean; receive?: boolean; emissive?: string; emissiveIntensity?: number } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, emissive: o.emissive ?? "#000000", emissiveIntensity: o.emissiveIntensity ?? 0 }),
  );
  m.position.set(x, y, z);
  m.castShadow = !!o.cast;
  m.receiveShadow = !!o.receive;
  return m;
}

function plant(x: number, z: number) {
  const g = new THREE.Group();
  g.add(box(0.36, 0.38, 0.36, "#b5651d", x, 0.19, z, { cast: true }));
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: "#3f9b4f", roughness: 0.8, flatShading: true }));
  leaves.position.set(x, 0.75, z);
  leaves.castShadow = true;
  const top = leaves.clone();
  top.scale.setScalar(0.65);
  top.position.y = 1.1;
  g.add(leaves, top);
  return g;
}

function sign(text: string, x: number, y: number, z: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1b1630";
  ctx.fillRect(0, 0, 512, 128);
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ff7ab6";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffd1e6";
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.9 }));
  m.position.set(x, y, z + 0.02);
  return m;
}

function part(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A block-style person facing -z. Pivots at hips and shoulders for walking / sitting / typing. */
function makeRig(id: string, look: number, shirtColor: string): Rig {
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[look], roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: HAIR[look], roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: PANTS[look], roughness: 0.9 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1d1d26" });

  const root = new THREE.Group();
  root.userData.agentId = id;
  const body = new THREE.Group();
  root.add(body);

  const leg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.1, 0.46, 0);
    pivot.add(part(0.15, 0.46, 0.17, pants, 0, -0.23, 0));
    pivot.add(part(0.16, 0.07, 0.24, dark, 0, -0.43, -0.03));
    body.add(pivot);
    return pivot;
  };
  const legL = leg(-1);
  const legR = leg(1);
  body.add(part(0.44, 0.5, 0.26, shirt, 0, 0.71, 0));
  const arm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.29, 0.93, 0);
    pivot.add(part(0.12, 0.42, 0.14, shirt, 0, -0.18, 0));
    pivot.add(part(0.11, 0.09, 0.12, skin, 0, -0.42, 0));
    body.add(pivot);
    return pivot;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0);
  head.add(part(0.34, 0.33, 0.31, skin, 0, 0.18, 0));
  head.add(part(0.37, 0.12, 0.34, hair, 0, 0.37, 0.01));
  head.add(part(0.37, 0.25, 0.08, hair, 0, 0.24, 0.15));
  head.add(part(0.05, 0.05, 0.02, dark, -0.08, 0.2, -0.16));
  head.add(part(0.05, 0.05, 0.02, dark, 0.08, 0.2, -0.16));
  body.add(head);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 24), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  root.add(ring);
  return { root, body, legL, legR, armL, armR, head, ring, shirt, key: `${look}|${shirtColor}` };
}

/** Put a rig into the pose for this moment. */
function pose(r: Rig, p: Person, t: number, selected: boolean) {
  r.root.position.set(p.x, 0, p.z);
  r.root.rotation.y = -p.facing;
  r.ring.visible = selected;
  const hop = p.hopUntil > t ? Math.abs(Math.sin((p.hopUntil - t) * Math.PI * 2.5)) * 0.28 : 0;
  r.body.position.y = hop;
  r.head.rotation.set(0, 0, 0);
  if (p.pose === "walk") {
    const s = Math.sin(t * 10) * 0.55;
    r.legL.rotation.x = s;
    r.legR.rotation.x = -s;
    r.armL.rotation.x = -s * 0.8;
    r.armR.rotation.x = s * 0.8;
    r.body.position.y += Math.abs(Math.cos(t * 10)) * 0.03;
    return;
  }
  if (p.pose === "stand") {
    r.legL.rotation.x = r.legR.rotation.x = 0;
    r.armL.rotation.x = r.armR.rotation.x = 0;
    r.head.rotation.y = Math.sin(t * 0.7 + p.desk) * 0.25;
    return;
  }
  // Seated: thighs forward, shins down (legs approximated as a single bent block).
  r.legL.rotation.x = r.legR.rotation.x = Math.PI / 2;
  r.body.position.y += 0.0;
  if (p.typing) {
    const k = Math.sin(t * 16);
    r.armL.rotation.x = Math.PI / 2.6 + k * 0.08;
    r.armR.rotation.x = Math.PI / 2.6 - k * 0.08;
    r.head.rotation.x = -0.12 + Math.sin(t * 2) * 0.03;
  } else if (p.place.kind === "lounge") {
    // chatting
    r.armL.rotation.x = 0.5;
    r.armR.rotation.x = 0.35 + Math.max(0, Math.sin(t * 3)) * 0.35;
    r.head.rotation.x = Math.sin(t * 4) * 0.08;
    r.head.rotation.y = Math.sin(t * 0.9) * 0.3;
  } else {
    r.armL.rotation.x = r.armR.rotation.x = 0.55;
    r.head.rotation.y = p.status === "waiting-for-human" ? Math.sin(t * 2) * 0.35 : 0;
  }
}
