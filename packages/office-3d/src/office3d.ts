import * as THREE from "three";
import { Crowd, type Person, type Status } from "./crowd";
import type { OfficePlan } from "./layout";
import { Town, phaseAt, SKY, type Phase } from "./town";
import { ModernTown, MODERN_SKY } from "./town-modern";

export type OfficeTheme = "modern" | "medieval";
import { crisp, pixTexture, texBox, type Kind } from "./pix";
import { PixelPost } from "./post";

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

/** A vertical sky gradient (top, horizon); the pixel pass turns it into dithered bands. */
function skyTexture(top: string, bottom: string) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const x = c.getContext("2d")!;
  const gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  x.fillStyle = gr;
  x.fillRect(0, 0, 4, 128);
  const t = crisp(c);
  t.magFilter = THREE.LinearFilter;
  return t;
}
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
  private camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 8, 90);
  private post?: PixelPost;
  private theme: OfficeTheme;
  private crowd = new Crowd();
  private rigs = new Map<string, Rig>();
  private furniture = new THREE.Group();
  private screens: THREE.MeshStandardMaterial[] = [];
  private builtFor = -1;
  private raf = 0;
  private last = 0;
  private observer: ResizeObserver;
  /** Mouse-wheel zoom (1 = the whole island in view) and drag-to-pan, in camera units. */
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private view = { mx: 0, my: 0, hw: 1, hh: 1 };
  private drag?: { x: number; y: number; px: number; py: number; moved: boolean };
  private unbind: Array<() => void> = [];
  /** The opening view: zoomed in on the office. Until the user zooms or drags, a resize re-applies it. */
  private home = { zoom: 1, x: 0, y: 0 };
  private touched = false;
  private agents: Office3DAgent[] = [];
  private town?: Town | ModernTown;
  private phase: Phase = "day";
  private phaseCheck = 0;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private deskLamps: THREE.MeshStandardMaterial[] = [];
  private flames: THREE.MeshStandardMaterial[] = [];

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
    private opts: { onFrame?: () => void; theme?: OfficeTheme } = {},
  ) {
    this.theme = opts.theme ?? "medieval";
    const modern = this.theme === "modern";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: modern });
    // Modern: drawn sharp at full resolution. Medieval: drawn small, then scaled up crisp (the pixel-art look).
    this.renderer.setPixelRatio(modern ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (modern) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.scene.background = new THREE.Color(MODERN_SKY.day);
    } else {
      this.post = new PixelPost(64, 64, 8, 90);
      this.scene.background = skyTexture(...SKY.day);
    }

    this.hemi = new THREE.HemisphereLight("#fff7ec", "#6d7a5a", 1.7);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    this.sun = sun;
    sun.position.set(-6, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);
    this.scene.add(this.furniture);

    this.bindControls();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.applyPhase(phaseAt());
    this.raf = requestAnimationFrame(this.frame);
  }

  private applyPhase(p: Phase) {
    this.phase = p;
    if (this.theme === "modern") {
      const look = {
        day: { sky: MODERN_SKY.day, hemi: ["#fff7ec", "#6d7a5a", 1.7], sun: ["#fff4e0", 2.3, [-6, 14, 9]] },
        dusk: { sky: MODERN_SKY.dusk, hemi: ["#ffd9b8", "#4a3f66", 1.25], sun: ["#ff9a5c", 1.7, [-12, 6, 7]] },
        night: { sky: MODERN_SKY.night, hemi: ["#8fa6ff", "#1a1f3a", 1.0], sun: ["#9db4ff", 0.8, [-6, 14, 9]] },
      }[p] as { sky: string; hemi: [string, string, number]; sun: [string, number, [number, number, number]] };
      (this.scene.background as THREE.Color).set(look.sky);
      this.hemi.color.set(look.hemi[0]);
      this.hemi.groundColor.set(look.hemi[1]);
      this.hemi.intensity = look.hemi[2];
      this.sun.color.set(look.sun[0]);
      this.sun.intensity = look.sun[1];
      this.sun.position.set(...look.sun[2]);
      this.town?.setPhase(p);
      return;
    }
    const look = {
      day: { sky: SKY.day, hemi: ["#fff1d6", "#7a8a4a", 1.5], sun: ["#ffe7c2", 2.4, [-6, 14, 9]], grade: [1.06, 1.0, 0.92] },
      dusk: { sky: SKY.dusk, hemi: ["#ffd9b8", "#4a3f66", 1.2], sun: ["#ff9a5c", 1.8, [-12, 6, 7]], grade: [1.1, 0.98, 0.9] },
      night: { sky: SKY.night, hemi: ["#8fa6ff", "#1a1f3a", 1.0], sun: ["#9db4ff", 0.8, [-6, 14, 9]], grade: [0.95, 1.0, 1.1] },
    }[p] as { sky: [string, string]; hemi: [string, string, number]; sun: [string, number, [number, number, number]]; grade: [number, number, number] };
    (this.scene.background as THREE.Texture | null)?.dispose();
    this.scene.background = skyTexture(...look.sky);
    this.post!.setGrade(look.grade);
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
    this.unbind.forEach((f) => f());
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.post?.dispose();
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------------

  private applyView() {
    const { mx, my, hw, hh } = this.view;
    const z = this.zoom;
    // keep the zoomed view inside the island's framing
    this.pan.x = Math.max(-(hw - hw / z), Math.min(hw - hw / z, this.pan.x));
    this.pan.y = Math.max(-(hh - hh / z), Math.min(hh - hh / z, this.pan.y));
    const cx = mx + this.pan.x;
    const cy = my + this.pan.y;
    Object.assign(this.camera, { left: cx - hw / z, right: cx + hw / z, top: cy + hh / z, bottom: cy - hh / z });
    this.camera.updateProjectionMatrix();
  }

  private bindControls() {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, o);
      this.unbind.push(() => t.removeEventListener(type, fn as EventListener, o));
    };
    on(c, "wheel", (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      const { hw, hh } = this.view;
      const z1 = this.zoom;
      const z2 = Math.max(1, Math.min(6, z1 * Math.exp(-e.deltaY * 0.0015)));
      // keep the point under the cursor where it is
      this.pan.x += nx * (hw / z1 - hw / z2);
      this.pan.y += ny * (hh / z1 - hh / z2);
      this.zoom = z2;
      this.touched = true;
      this.applyView();
    }, { passive: false });
    on(c, "pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, moved: false };
    });
    on(c, "pointermove", (e) => {
      const d = this.drag;
      if (!d || this.zoom <= 1) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      this.touched = true;
      const rect = c.getBoundingClientRect();
      this.pan.x = d.px - (dx / rect.width) * 2 * (this.view.hw / this.zoom);
      this.pan.y = d.py + (dy / rect.height) * 2 * (this.view.hh / this.zoom);
      this.applyView();
    });
    on(c, "pointerup", () => setTimeout(() => (this.drag = undefined), 0));
    // A drag is not a click on a person.
    on(c, "click", (e) => {
      if (this.drag?.moved) e.stopPropagation();
    }, { capture: true });
    on(c, "dblclick", () => {
      this.touched = false;
      this.zoom = this.home.zoom;
      this.pan = { x: this.home.x, y: this.home.y };
      this.applyView();
    });
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    if (this.post) {
      // Medieval: chunky pixels, rendered at a fraction of the screen size.
      const P = Math.max(1.5, Math.min(w, h) / 340);
      this.renderer.setSize(Math.ceil(w / P), Math.ceil(h / P), false);
      this.post.setSize(Math.ceil(w / P), Math.ceil(h / P));
    } else this.renderer.setSize(w, h, false);
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
    // Frame the whole island, from its underside up to the tallest roofs, like a diorama.
    const island = this.town instanceof Town ? this.town.extent : undefined;
    const ext = island ?? { x0: plan.minX - 2.6, x1: plan.maxX + 2.6, z0: plan.minZ - 2.6, z1: plan.maxZ + 2.6 };
    for (const x of [ext.x0, ext.x1]) for (const z of [ext.z0, ext.z1]) for (const y of island ? [-9.5, 6.5] : [0, WALL_H]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const pad = 0.6;
    let halfW = (maxX - minX) / 2 + pad;
    let halfH = (maxY - minY) / 2 + pad;
    if (halfW / halfH > w / h) halfH = halfW / (w / h);
    else halfW = halfH * (w / h);
    this.view = { mx: (minX + maxX) / 2, my: (minY + maxY) / 2, hw: halfW, hh: halfH };
    // Opening view: the office fills the screen; zooming out reveals the whole island.
    this.home = { zoom: 1, x: 0, y: 0 };
    if (island) {
      let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
      for (const x of [plan.minX - 1.2, plan.maxX + 1.2]) for (const z of [plan.minZ - 1.2, plan.maxZ + 1.2]) for (const y of [-0.5, WALL_H + 0.4]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
        ax = Math.min(ax, p.x); bx = Math.max(bx, p.x); ay = Math.min(ay, p.y); by = Math.max(by, p.y);
      }
      let ow = (bx - ax) / 2, oh = (by - ay) / 2;
      if (ow / oh > w / h) oh = ow / (w / h);
      else ow = oh * (w / h);
      this.home = { zoom: Math.max(1, Math.min(6, halfW / ow, halfH / oh)), x: (ax + bx) / 2 - this.view.mx, y: (ay + by) / 2 - this.view.my };
    }
    if (!this.touched) {
      this.zoom = this.home.zoom;
      this.pan = { x: this.home.x, y: this.home.y };
    }
    this.applyView();
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
      const idle = this.theme === "modern" ? "#1a2236" : "#3a2a14";
      m.emissive.set(s === "typing" ? "#6fc0ff" : s === "waiting" ? "#ffb547" : idle);
      m.emissiveIntensity = s ? 0.9 + Math.sin(now * 6 + i) * 0.1 : 0.4;
    });
    this.flames.forEach((m, i) => (m.emissiveIntensity = 1.5 + Math.sin(now * 9 + i * 2.3) * 0.35 + Math.sin(now * 17 + i) * 0.15));
    const statusOf = new Map<number, Status>();
    for (const p of this.crowd.list()) statusOf.set(p.desk, p.status);
    this.deskLamps.forEach((m, i) => {
      const s = statusOf.get(i);
      const c = s === "working" || s === "thinking" ? "#4f9dff" : s === "waiting-for-human" ? "#ffb020" : s === "failed" ? "#ff4d5e" : s === "done" ? "#3ddc84" : "#556070";
      m.emissive.set(c);
      m.color.set(c);
      m.emissiveIntensity = s && s !== "idle" ? 1.4 + Math.sin(now * 4 + i) * 0.4 : 0.15;
    });
    if (this.post) this.post.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    this.opts.onFrame?.();
  };

  // -------------------------------------------------------------------------
  // Room

  private buildRoom(plan: OfficePlan) {
    if (this.theme === "modern") return this.buildRoomModern(plan);
    this.builtFor = plan.desks.length;
    this.scene.remove(this.furniture);
    this.furniture.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.furniture = new THREE.Group();
    this.screens = [];
    this.deskLamps = [];
    this.flames = [];
    if (this.town) {
      this.scene.remove(this.town.group);
      this.town.dispose();
    }
    this.town = new Town(plan);
    this.scene.add(this.town.group);
    this.town.setPhase(this.phase);
    const g = this.furniture;
    const W = plan.maxX - plan.minX;
    const D = plan.maxZ - plan.minZ;
    const cx = (plan.minX + plan.maxX) / 2;
    const cz = (plan.minZ + plan.maxZ) / 2;
    const lx = plan.coffeeTable.x;
    const tz = plan.coffeeTable.z;
    const wood = "#9a6a3c";
    const dark = "#5a3b22";
    const flame = (x: number, y: number, z: number, w = 0.1, h = 0.14) => {
      const m = new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: "#ff8a1f", emissiveIntensity: 1.5 });
      this.flames.push(m);
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
      f.position.set(x, y, z);
      return f;
    };

    // The hall: stone base, plank floor, flagstone passage, red rug in the tavern corner.
    g.add(box(W + 0.5, 0.45, D + 0.5, "#c8bfae", cx + 0.25, -0.28, cz + 0.25, { receive: true, tex: "stone", scale: 1.2 }));
    g.add(box(W + 0.55, 0.06, D + 0.55, "#6f655a", cx + 0.25, -0.03, cz + 0.25));
    g.add(box(W, 0.1, D, "#d9a371", cx, -0.05, cz, { receive: true, tex: "plank", scale: 1.6 }));
    g.add(box(1.5, 0.012, D, "#cfc7b6", plan.corridorX, 0.006, cz, { receive: true, tex: "cobble", scale: 1.2 }));
    g.add(box(4.4, 0.014, 4.6, "#8a2a2a", lx, 0.007, tz + 0.6, { receive: true }));
    g.add(box(3.9, 0.016, 4.1, "#a63a36", lx, 0.008, tz + 0.6, { receive: true }));

    // Stone walls (north and west) with timber beams, shuttered windows, banners.
    g.add(box(W, WALL_H, 0.16, "#cfc8bb", cx, WALL_H / 2, plan.minZ - 0.08, { receive: true, tex: "stone", scale: 1.0 }));
    g.add(box(0.16, WALL_H, D, "#c4bdb0", plan.minX - 0.08, WALL_H / 2, cz, { receive: true, tex: "stone", scale: 1.0 }));
    g.add(box(W, 0.14, 0.22, dark, cx, WALL_H - 0.07, plan.minZ - 0.04));
    g.add(box(0.22, 0.14, D, dark, plan.minX - 0.04, WALL_H - 0.07, cz));
    g.add(box(W, 0.14, 0.2, dark, cx, 0.07, plan.minZ - 0.03));
    for (let x = plan.minX + 0.2; x < plan.maxX; x += 2.4) g.add(box(0.14, WALL_H, 0.2, dark, x, WALL_H / 2, plan.minZ - 0.03));
    for (let x = plan.minX + 1.4; x < plan.corridorX - 0.5; x += 2.4) {
      g.add(box(0.95, 1.15, 0.08, dark, x, 1.35, plan.minZ + 0.03));
      g.add(box(0.7, 0.9, 0.06, "#ffcf80", x, 1.35, plan.minZ + 0.05, { emissive: "#ffb347", emissiveIntensity: 0.4 }));
      g.add(box(0.06, 0.9, 0.07, dark, x, 1.35, plan.minZ + 0.07));
      g.add(box(0.7, 0.06, 0.07, dark, x, 1.35, plan.minZ + 0.07));
      for (const sx of [-1, 1]) g.add(box(0.22, 1.0, 0.05, "#7a4a2a", x + sx * 0.6, 1.35, plan.minZ + 0.05, { tex: "plank", scale: 0.6 }));
    }
    const banner = ["#9b2226", "#1d4e89", "#2d6a4f", "#6a3d9a"];
    for (let i = 0; i < 4; i++) {
      const px = plan.minX + 1.8 + i * 2.4 + (i > 1 ? 0.6 : 0);
      if (px > plan.corridorX - 1) break;
      g.add(box(0.5, 1.0, 0.03, banner[i]!, px, 1.5, plan.minZ + 0.1));
      g.add(box(0.5, 0.08, 0.035, "#e6c14a", px, 1.9, plan.minZ + 0.11));
      g.add(box(0.1, 0.1, 0.035, "#e6c14a", px, 1.55, plan.minZ + 0.11));
      g.add(box(0.36, 0.14, 0.03, banner[i]!, px, 0.9, plan.minZ + 0.1));
    }
    // A map on the west wall, a bookshelf and a rack of scrolls
    g.add(box(0.05, 1.0, 1.5, "#e8d8a8", plan.minX + 0.03, 1.4, plan.minZ + 3.2));
    for (let i = 0; i < 4; i++) g.add(box(0.06, 0.04, 0.9 - i * 0.15, ["#9b2226", "#2d6a4f", "#1d4e89", "#b08900"][i]!, plan.minX + 0.04, 1.7 - i * 0.2, plan.minZ + 3.0 + i * 0.08));
    g.add(box(0.35, 1.6, 1.4, wood, plan.minX + 0.18, 0.8, plan.maxZ - 1.6, { cast: true, tex: "plank", scale: 0.8 }));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) g.add(box(0.2, 0.32, 0.18, ["#9b2226", "#2d6a4f", "#b08900", "#1d4e89", "#6a3d9a"][(i + j) % 5]!, plan.minX + 0.32, 0.35 + i * 0.5, plan.maxZ - 2.1 + j * 0.24));
    // Rug under the writing desks
    g.add(box(DESK_SPAN, 0.014, D - 1.2, "#3f5a8a", (plan.minX + plan.corridorX) / 2 - 0.4, 0.008, cz + 0.2, { receive: true }));

    // Hearth in the tavern corner, with a hanging sign above it
    g.add(box(1.7, 1.3, 0.5, "#9a9288", lx, 0.65, plan.minZ + 0.25, { cast: true, tex: "stone", scale: 0.9 }));
    g.add(box(0.95, 0.75, 0.52, "#16100b", lx, 0.42, plan.minZ + 0.27));
    g.add(flame(lx - 0.15, 0.25, plan.minZ + 0.3, 0.16, 0.26));
    g.add(flame(lx + 0.12, 0.22, plan.minZ + 0.32, 0.14, 0.2));
    g.add(box(0.7, 0.07, 0.07, dark, lx, 0.12, plan.minZ + 0.3));
    g.add(sign("AGENT TOWN", lx, 1.82, plan.minZ + 0.03));

    // Writing desks: a parchment, an inkwell, a candle, and a glowing rune slate that shows what they do
    plan.desks.forEach((d) => {
      g.add(box(1.6, 0.08, 0.85, "#c08a52", d.x, 0.75, d.z, { cast: true, receive: true, tex: "plank", scale: 0.8 }));
      for (const [ox, oz] of [[-0.72, -0.35], [0.72, -0.35], [-0.72, 0.35], [0.72, 0.35]] as const) g.add(box(0.07, 0.75, 0.07, dark, d.x + ox, 0.375, d.z + oz));
      g.add(box(0.5, 0.025, 0.16, "#efe3bd", d.x, 0.8, d.z - 0.12));
      g.add(box(0.04, 0.12, 0.04, "#2a2a30", d.x + 0.3, 0.85, d.z - 0.1)); // ink
      g.add(box(0.1, 0.12, 0.1, "#8a8f98", d.x + 0.55, 0.85, d.z - 0.05)); // tankard
      g.add(box(0.05, 0.12, 0.05, "#f4ecd0", d.x - 0.6, 0.85, d.z + 0.05));
      g.add(flame(d.x - 0.6, 0.96, d.z + 0.05, 0.05, 0.07));
      // The slate stands on a small wooden stand, facing the person (north).
      g.add(box(0.1, 0.22, 0.1, dark, d.x, 0.9, d.z + 0.22));
      g.add(box(0.72, 0.46, 0.06, "#6f6a62", d.x, 1.2, d.z + 0.24, { cast: true, tex: "stone", scale: 0.5 }));
      const screen = new THREE.MeshStandardMaterial({ color: "#1c1710", emissive: "#3a2a14", emissiveIntensity: 0.4 });
      const sm = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.32, 0.01), screen);
      sm.position.set(d.x, 1.2, d.z + 0.205);
      g.add(sm);
      this.screens.push(screen);
      // Status gem on top of the slate: shows what this person is doing at a glance.
      const lamp = new THREE.MeshStandardMaterial({ color: "#556070", emissive: "#556070", emissiveIntensity: 0.15 });
      const lm = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), lamp);
      lm.position.set(d.x + 0.3, 1.5, d.z + 0.24);
      g.add(lm);
      this.deskLamps.push(lamp);
      // wooden chair (back on the north side)
      const s = d.seat;
      g.add(box(0.5, 0.08, 0.5, "#8a5a34", s.x, 0.44, s.z, { cast: true, tex: "plank", scale: 0.5 }));
      g.add(box(0.5, 0.55, 0.08, "#8a5a34", s.x, 0.72, s.z - 0.24, { cast: true, tex: "plank", scale: 0.5 }));
      g.add(box(0.08, 0.4, 0.08, dark, s.x, 0.2, s.z));
    });

    // Tavern corner: a barrel table, benches with red cushions, a chandelier
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.6, 10), new THREE.MeshStandardMaterial({ color: "#a9743f", roughness: 1, map: pixTexture("plank", 3, 1) }));
    barrel.position.set(lx, 0.3, tz);
    barrel.castShadow = barrel.receiveShadow = true;
    g.add(barrel, box(1.1, 0.06, 0.06, "#2b2b30", lx, 0.5, tz + 0.46));
    g.add(box(0.12, 0.14, 0.12, "#8a8f98", lx + 0.2, 0.67, tz), box(0.12, 0.14, 0.12, "#8a8f98", lx - 0.25, 0.67, tz + 0.1));
    const bench = (w: number, d: number, x: number, z: number, backX: number, backZ: number, bw: number, bd: number) => {
      g.add(box(w, 0.4, d, "#8a5a34", x, 0.2, z, { cast: true, tex: "plank", scale: 0.6 }));
      g.add(box(w * 0.94, 0.1, d * 0.88, "#a63a36", x, 0.45, z));
      g.add(box(bw, 0.55, bd, "#8a5a34", backX, 0.62, backZ, { cast: true, tex: "plank", scale: 0.6 }));
    };
    bench(2.4, 0.75, lx, tz + 1.25, lx, tz + 1.55, 2.4, 0.2);
    for (const side of [-1, 1]) bench(0.75, 1.5, lx + side * 1.65, tz - 0.25, lx + side * 1.95, tz - 0.25, 0.2, 1.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 14), new THREE.MeshStandardMaterial({ color: "#2b2b30", roughness: 0.6 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(lx, 1.7, tz + 0.3);
    g.add(ring, box(0.02, 0.6, 0.02, "#2b2b30", lx, 2.0, tz + 0.3));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(box(0.05, 0.12, 0.05, "#f4ecd0", lx + Math.cos(a) * 0.4, 1.78, tz + 0.3 + Math.sin(a) * 0.4));
      g.add(flame(lx + Math.cos(a) * 0.4, 1.88, tz + 0.3 + Math.sin(a) * 0.4, 0.05, 0.08));
    }
    // Plants in pots, and an ale barrel by the door
    for (const [x, z] of [[plan.minX + 0.4, plan.maxZ - 0.5], [plan.maxX - 0.4, plan.minZ + 0.4], [plan.corridorX - 0.9, plan.minZ + 0.4], [plan.maxX - 0.4, plan.maxZ - 0.4]] as const) g.add(plant(x, z));
    const ale = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.7, 10), new THREE.MeshStandardMaterial({ color: "#a9743f", roughness: 1, map: pixTexture("plank", 2, 1) }));
    ale.position.set(plan.maxX - 0.4, 0.35, tz + 2.6);
    ale.castShadow = true;
    g.add(ale, box(0.6, 0.05, 0.6, "#2b2b30", plan.maxX - 0.4, 0.25, tz + 2.6), box(0.6, 0.05, 0.6, "#2b2b30", plan.maxX - 0.4, 0.5, tz + 2.6));

    this.scene.add(g);
    this.resize();
  }

  // -------------------------------------------------------------------------
  // The modern office (the original 3D look)

  private buildRoomModern(plan: OfficePlan) {
    this.builtFor = plan.desks.length;
    this.scene.remove(this.furniture);
    this.furniture.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.furniture = new THREE.Group();
    this.screens = [];
    this.deskLamps = [];
    this.scene.remove(this.town?.group ?? new THREE.Group());
    this.town = new ModernTown(plan);
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
    g.add(signNeon("AGENT TOWN", lx, 1.55, plan.minZ + 0.03));
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
  o: { cast?: boolean; receive?: boolean; emissive?: string; emissiveIntensity?: number; tex?: Kind; scale?: number } = {},
): THREE.Mesh {
  if (o.tex) {
    const t = texBox(w, h, d, o.tex, color, o.scale ?? 1);
    t.position.set(x, y, z);
    t.castShadow = !!o.cast;
    t.receiveShadow = !!o.receive;
    return t;
  }
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
  c.width = 96;
  c.height = 24;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#5a3b22";
  ctx.fillRect(0, 0, 96, 24);
  ctx.fillStyle = "#7a5230";
  for (let i = 0; i < 24; i += 6) ctx.fillRect(0, i, 96, 1);
  ctx.fillStyle = "#2a1a0e";
  ctx.fillRect(0, 0, 96, 1);
  ctx.fillRect(0, 23, 96, 1);
  ctx.fillRect(0, 0, 1, 24);
  ctx.fillRect(95, 0, 1, 24);
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2a1a0e";
  ctx.fillText(text, 49, 14);
  ctx.fillStyle = "#f2c94c";
  ctx.fillText(text, 48, 13);
  const tex = crisp(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.position.set(x, y, z + 0.02);
  return m;
}

function signNeon(text: string, x: number, y: number, z: number) {
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
