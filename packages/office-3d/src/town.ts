import * as THREE from "three";
import type { OfficePlan } from "./layout";
import { crisp, pixTexture, texBox, type Kind } from "./pix";

/**
 * A medieval town around the office: cobbled square and road, timber-framed houses, a castle
 * keep and round towers, a windmill, a market, a well, torches, horse carts and trees.
 * All geometry is made here. Nothing tall stands south or east of the office (the camera side),
 * so it never hides anyone.
 */

export type Phase = "day" | "dusk" | "night";

/** Day, dusk or night from the local clock. */
export function phaseAt(date = new Date()): Phase {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 17.5) return "day";
  if (h >= 17.5 && h < 20) return "dusk";
  return "night";
}

/** Sky gradient: [top, horizon]. */
export const SKY: Record<Phase, [string, string]> = { day: ["#4f9fe0", "#d6ecf2"], dusk: ["#4a3f84", "#f6a86a"], night: ["#060a1c", "#1c2652"] };

type Glow = { mat: THREE.MeshStandardMaterial; on: number; at: Phase[] };
type Cart = { g: THREE.Group; dir: number; speed: number; legs: THREE.Object3D[] };

function waterTexture() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 32;
  const x = c.getContext("2d")!;
  x.fillStyle = "#4aa3e8";
  x.fillRect(0, 0, 8, 32);
  x.fillStyle = "#a9dcff";
  for (const [i, j, h] of [[1, 2, 6], [4, 10, 8], [6, 20, 5], [2, 24, 6], [5, 4, 3]] as const) x.fillRect(i, j, 1, h);
  x.fillStyle = "#2f7fc4";
  for (const [i, j, h] of [[0, 14, 6], [3, 18, 7], [7, 7, 5]] as const) x.fillRect(i, j, 1, h);
  const t = crisp(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function mat(color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...o });
}

function bx(w: number, h: number, d: number, m: THREE.Material | string, x: number, y: number, z: number, o: { cast?: boolean; receive?: boolean } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === "string" ? mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = !!o.cast;
  mesh.receiveShadow = !!o.receive;
  return mesh;
}

function tbx(w: number, h: number, d: number, kind: Kind, color: string, x: number, y: number, z: number, scale = 1, o: { cast?: boolean; receive?: boolean } = {}) {
  const m = texBox(w, h, d, kind, color, scale);
  m.position.set(x, y, z);
  m.castShadow = !!o.cast;
  m.receiveShadow = !!o.receive;
  return m;
}

/** Wall face: plaster or stone with a pixel timber frame and small windows (some lit at night). */
function wallTextures(kind: "stone" | "plaster", tint: string, cols: number, rows: number, rand: () => number) {
  const W = 16 * cols;
  const H = 16 * rows;
  const a = document.createElement("canvas");
  const e = document.createElement("canvas");
  a.width = e.width = W;
  a.height = e.height = H;
  const ca = a.getContext("2d")!;
  const ce = e.getContext("2d")!;
  ca.fillStyle = tint;
  ca.fillRect(0, 0, W, H);
  ce.fillStyle = "#000";
  ce.fillRect(0, 0, W, H);
  // texture detail: speckles (plaster) or brick lines (stone)
  for (let y = 0; y < H; y += 4) {
    if (kind === "stone") {
      ca.fillStyle = "rgba(0,0,0,.28)";
      ca.fillRect(0, y, W, 1);
      for (let x = (y / 4) % 2 ? 4 : 0; x < W; x += 8) ca.fillRect(x, y, 1, 4);
    }
  }
  if (kind === "plaster") {
    for (let k = 0; k < W * H * 0.04; k++) {
      ca.fillStyle = `rgba(0,0,0,${rand() * 0.1})`;
      ca.fillRect((rand() * W) | 0, (rand() * H) | 0, 1, 1);
    }
    // timber frame: dark beams around each floor and a cross brace
    ca.fillStyle = "#4a2f1a";
    for (let r = 0; r <= rows; r++) ca.fillRect(0, Math.min(H - 2, r * 16 - 1), W, 2);
    for (let c = 0; c <= cols; c++) ca.fillRect(Math.min(W - 2, c * 16 - 1), 0, 2, H);
  }
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const x = c * 16 + 5;
      const y = r * 16 + 4;
      ca.fillStyle = "#2b2118";
      ca.fillRect(x - 1, y - 1, 8, 10);
      ca.fillStyle = "#4b6a8a";
      ca.fillRect(x, y, 6, 8);
      ca.fillStyle = "#2b2118";
      ca.fillRect(x + 3, y, 1, 8);
      ca.fillRect(x, y + 4, 6, 1);
      if (rand() < 0.55) {
        ce.fillStyle = "#ffb347";
        ce.fillRect(x, y, 6, 8);
        ce.fillStyle = "#000";
        ce.fillRect(x + 3, y, 1, 8);
        ce.fillRect(x, y + 4, 6, 1);
      }
    }
  return { map: crisp(a), emissiveMap: crisp(e) };
}

function flagTexture(color: string, trim: string) {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 10;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  x.fillRect(0, 0, 16, 10);
  x.fillStyle = trim;
  x.fillRect(0, 0, 16, 2);
  x.fillRect(0, 8, 16, 2);
  x.fillRect(6, 3, 4, 4);
  return crisp(c);
}

export class Town {
  readonly group = new THREE.Group();
  private glows: Glow[] = [];
  private torches: THREE.MeshStandardMaterial[] = [];
  private carts: Cart[] = [];
  private trees: THREE.Object3D[] = [];
  private flags: THREE.Object3D[] = [];
  private sails?: THREE.Group;
  private water?: THREE.Mesh;
  private roadX: [number, number];
  private roadZ = 0;
  private clouds: THREE.Object3D[] = [];
  private fall?: THREE.MeshStandardMaterial;
  private bounds = { x0: 0, x1: 0, z0: 0, z1: 0 };
  /** The island's footprint, so the camera can frame all of it. */
  get extent() {
    return this.bounds;
  }
  private phase: Phase = "day";
  /** Warm lights inside the office for evening and night. */
  readonly indoor: THREE.PointLight[] = [];

  constructor(plan: OfficePlan) {
    const g = this.group;
    const cx = (plan.minX + plan.maxX) / 2;
    const cz = (plan.minZ + plan.maxZ) / 2;
    const r = rng(11);
    const GROUND = -0.5;

    // The town floats on its own island: grass on top, stepped rock below.
    const ix0 = plan.minX - 12.5;
    const ix1 = plan.maxX + 12;
    const iz0 = plan.minZ - 9.5;
    const iz1 = plan.maxZ + 7.4;
    this.bounds = { x0: ix0, x1: ix1, z0: iz0, z1: iz1 };
    const iw = ix1 - ix0;
    const icx = (ix0 + ix1) / 2;
    const icz = (iz0 + iz1) / 2;
    g.add(tbx(iw, 0.4, iz1 - iz0, "grass", "#79b04c", icx, GROUND - 0.2, icz, 2.2, { receive: true }));
    g.add(tbx(iw + 0.3, 0.5, iz1 - iz0 + 0.3, "dirt", "#8b6a45", icx, GROUND - 0.55, icz, 1.6));
    for (let k = 1; k <= 7; k++) {
      // Each ledge steps in a little more than the one above, so the cliff face shows and ends in a blunt point.
      const shrink = 0.9 * Math.pow(k, 1.5) + (k % 2) * 0.4;
      g.add(tbx(iw - shrink * 1.4, 1.35, iz1 - iz0 - shrink, "rock", k % 2 ? "#a58461" : "#8f7050", icx + ((k % 3) - 1) * 0.4, GROUND - 1.1 - k * 1.2, icz + ((k % 2) - 0.5) * 0.4, 1.8, { cast: true, receive: true }));
    }
    // A few small rocks drifting below
    for (let i = 0; i < 5; i++) g.add(tbx(0.8 + r() * 0.9, 0.7 + r() * 0.5, 0.8 + r() * 0.8, "rock", "#8f7050", ix0 - 3 + r() * (iw + 6), -10.5 - r() * 3, iz0 + r() * (iz1 - iz0), 1.2, { cast: true }));
    // Clouds drifting past below the island
    for (let i = 0; i < 6; i++) {
      const cl = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#9bb4d8", emissiveIntensity: 0.35, roughness: 1, flatShading: true });
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.8, 0), m);
        b.scale.y = 0.55;
        b.position.set(k * 1.1 - 1.6, r() * 0.3, (r() - 0.5) * 0.8);
        cl.add(b);
      }
      cl.position.set(ix0 - 6 + r() * (iw + 12), -8 - r() * 2.5, iz0 - 4 + r() * (iz1 - iz0 + 8));
      this.clouds.push(cl);
      g.add(cl);
    }
    g.add(tbx(plan.maxX - plan.minX + 2.6, 0.08, plan.maxZ - plan.minZ + 2.6, "cobble", "#d8cdb6", cx, GROUND + 0.04, cz, 1.6, { receive: true }));
    const roadZ = plan.maxZ + 3.7;
    this.roadZ = roadZ;
    this.roadX = [ix0 + 0.6, ix1 - 0.6];
    g.add(tbx(iw, 0.08, 1.1, "cobble", "#d8cdb6", icx, GROUND + 0.04, plan.maxZ + 1.75, 1.6, { receive: true }));
    g.add(tbx(iw, 0.06, 2.8, "dirt", "#b0895f", icx, GROUND + 0.03, roadZ, 1.6, { receive: true }));
    g.add(tbx(iw, 0.08, 0.9, "cobble", "#d8cdb6", icx, GROUND + 0.04, roadZ + 1.85, 1.6, { receive: true }));
    // Hedges and flowers along the square
    for (let i = 0; i < 9; i++) {
      const fx = plan.minX + 1 + i * ((plan.maxX - plan.minX - 2) / 8);
      const fz = plan.maxZ + 1.0;
      g.add(tbx(0.7, 0.26, 0.32, "grass", "#3f8a3f", fx, GROUND + 0.2, fz, 0.5, { cast: true }));
      for (let k = 0; k < 3; k++) g.add(bx(0.08, 0.08, 0.08, ["#ff6b9d", "#ffd23f", "#ffffff", "#c77dff"][(i + k) % 4]!, fx - 0.22 + k * 0.22, GROUND + 0.37, fz + 0.12));
    }

    // Behind the office (north): houses, round towers and a keep
    const northZ = plan.minZ - 3.8;
    const walls = ["#e8d9b5", "#d9c7a0", "#cfd8c0", "#e2c9a8"];
    const roofs = ["#a8442f", "#8c3b2a", "#3f5f8a", "#5a6b3a"];
    let x = plan.minX - 8;
    for (let i = 0; x < ix1 - 4; i++) {
      const pick = r();
      if (pick < 0.4) {
        const w = 2.8 + r() * 1.4;
        const d = 2.8 + r() * 1.4;
        g.add(this.timberHouse(w, 2.4 + r() * 1.6, d, x + w / 2, northZ - d / 2, walls[i % walls.length]!, roofs[i % roofs.length]!, r));
        x += w + 0.5 + r() * 0.6;
      } else if (pick < 0.75) {
        const rad = 1.0 + r() * 0.35;
        g.add(this.tower(rad, 5 + r() * 2.2, x + rad, northZ - rad - 0.4, roofs[(i + 1) % roofs.length]!, r));
        x += rad * 2 + 0.6;
      } else {
        const w = 4.2 + r() * 1.2;
        g.add(this.keep(w, 4 + r() * 1.2, 3.6, x + w / 2, northZ - 1.8, r));
        x += w + 0.6;
      }
    }
    // West: houses and a windmill
    for (let i = 0; i < 3; i++) {
      const z = plan.minZ + 1.2 + i * 4.4;
      g.add(this.timberHouse(2.6, 1.8, 2.6, plan.minX - 5.2 - (i % 2) * 1.2, z, walls[(i + 1) % walls.length]!, roofs[(i + 2) % roofs.length]!, r));
    }
    g.add(this.windmill(plan.minX - 10.2, plan.maxZ - 0.8));

    // East: market stalls, a well, a pond and trees (all low)
    const px = plan.maxX + 6.4;
    const pz = cz;
    const fx = px + 0.6;
    const fz = pz + 2.2;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.4, 8), mat("#cfc7b6", { map: pixTexture("stone", 4, 1) }));
    basin.position.set(fx, GROUND + 0.2, fz);
    basin.castShadow = basin.receiveShadow = true;
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.05, 8), new THREE.MeshStandardMaterial({ color: "#4aa3e8", roughness: 0.3, emissive: "#1d6fb8", emissiveIntensity: 0.35 }));
    pond.position.set(fx, GROUND + 0.4, fz);
    this.water = pond;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 8), mat("#d8d0bf", { map: pixTexture("stone", 2, 2) }));
    pillar.position.set(fx, GROUND + 0.8, fz);
    pillar.castShadow = true;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.2, 0.18, 8), mat("#cfc7b6", { map: pixTexture("stone", 2, 1) }));
    bowl.position.set(fx, GROUND + 1.25, fz);
    bowl.castShadow = true;
    g.add(basin, pond, pillar, bowl);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      g.add(bx(0.07, 0.5, 0.07, "#8fd0ff", fx + Math.cos(a) * 0.38, GROUND + 1.0, fz + Math.sin(a) * 0.38));
    }
    // A stream from the fountain runs over the island's east edge as a waterfall.
    const wt = waterTexture();
    this.fall = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.4, emissive: "#2a7fd0", emissiveIntensity: 0.3 });
    const streamLen = ix1 - (fx + 1.3);
    const stream = new THREE.Mesh(new THREE.BoxGeometry(streamLen, 0.05, 0.9), this.fall);
    stream.position.set(fx + 1.3 + streamLen / 2, GROUND + 0.05, fz);
    const fall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 9, 0.9), this.fall);
    fall.position.set(ix1 + 0.05, GROUND - 4.45, fz);
    g.add(stream, fall);
    g.add(this.stall(plan.maxX + 3.6, plan.minZ + 0.2, "#c0392b"));
    g.add(this.stall(plan.maxX + 3.6, plan.minZ + 2.8, "#2b6cb0"));
    g.add(this.well(plan.maxX + 3.1, plan.maxZ - 0.4));
    for (let i = 0; i < 16; i++) {
      const tx = plan.maxX + 7 + r() * 4;
      const tz = plan.minZ - 3 + r() * (plan.maxZ - plan.minZ + 4.6);
      if (Math.abs(tz - fz) < 1.4 || Math.hypot(tx - fx, tz - fz) < 2.2) continue;
      this.tree(tx, tz, 0.8 + r() * 0.55, r() < 0.45, r);
    }
    for (let i = 0; i < 12; i++) this.tree(plan.minX - 3.3 + r() * 2, plan.minZ - 1 + r() * (plan.maxZ - plan.minZ + 3), 0.7 + r() * 0.4, r() < 0.5, r);
    for (let i = 0; i < 12; i++) this.tree(ix0 + 2 + i * ((iw - 4) / 11) + r(), roadZ + 2.7, 0.55 + r() * 0.3, r() < 0.5, r);

    // Torches along the square
    for (let lx = plan.minX - 6; lx < ix1 - 1; lx += 5.5) this.torch(lx, plan.maxZ + 2.1);

    // Horse carts on the road
    const cloth = ["#9b2226", "#1d4e89", "#2d6a4f", "#b08900", "#6a3d9a"];
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? -1 : 1;
      const cart = this.cart(cloth[i % cloth.length]!, i === 1);
      cart.g.position.set(this.roadX[0] + 2 + r() * (iw - 5), GROUND + 0.1, roadZ + dir * -0.65);
      cart.g.rotation.y = dir > 0 ? 0 : Math.PI;
      this.carts.push({ g: cart.g, dir, speed: 0.9 + r() * 0.8, legs: cart.legs });
      g.add(cart.g);
    }

    // Warm light inside the office when it is dark
    for (const [lx, lz] of [
      [plan.minX + (plan.corridorX - plan.minX) / 2, cz],
      [plan.coffeeTable.x, plan.coffeeTable.z + 0.6],
    ] as const) {
      const l = new THREE.PointLight("#ffbf80", 0, 11, 1.4);
      l.position.set(lx, 2.1, lz);
      this.indoor.push(l);
      g.add(l);
    }
    this.setPhase("day");
  }

  setPhase(phase: Phase) {
    this.phase = phase;
    for (const gl of this.glows) gl.mat.emissiveIntensity = gl.at.includes(phase) ? gl.on : 0;
    const k = phase === "day" ? 0 : phase === "dusk" ? 12 : 22;
    this.indoor.forEach((l) => (l.intensity = k));
  }

  update(t: number, dt: number) {
    for (const c of this.carts) {
      c.g.position.x += c.dir * c.speed * dt;
      if ((c.g.position.x > this.roadX[1] && c.dir > 0) || (c.g.position.x < this.roadX[0] && c.dir < 0)) {
        c.dir = -c.dir; // turn round at the island's edge
        c.g.rotation.y = c.dir > 0 ? 0 : Math.PI;
        c.g.position.z = this.roadZ - c.dir * 0.65;
      }
      c.legs.forEach((leg, i) => (leg.rotation.z = Math.sin(t * c.speed * 7 + (i % 2 ? Math.PI : 0)) * 0.5));
    }
    this.trees.forEach((tr, i) => {
      tr.rotation.z = Math.sin(t * 0.9 + i) * 0.025;
      tr.rotation.x = Math.cos(t * 0.7 + i * 1.7) * 0.02;
    });
    this.flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 2.4 + i * 1.3) * 0.35));
    if (this.sails) this.sails.rotation.x = t * 0.45;
    if (this.fall?.map) this.fall.map.offset.y = -t * 0.9;
    for (const [i, c] of this.clouds.entries()) {
      c.position.x += dt * (0.25 + (i % 3) * 0.1);
      if (c.position.x > this.bounds.x1 + 8) c.position.x = this.bounds.x0 - 8;
    }
    if (this.water) this.water.scale.x = 1 + Math.sin(t * 1.3) * 0.015;
    const base = this.phase === "day" ? 0.7 : 2.4;
    this.torches.forEach((m, i) => (m.emissiveIntensity = base * (0.85 + 0.15 * Math.sin(t * 9 + i * 2.1) + 0.08 * Math.sin(t * 23 + i))));
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }

  // -------------------------------------------------------------------------

  private glow(m: THREE.MeshStandardMaterial, on: number, at: Phase[] = ["dusk", "night"]) {
    this.glows.push({ mat: m, on, at });
    m.emissiveIntensity = 0;
  }

  private wallMat(kind: "stone" | "plaster", tint: string, cols: number, rows: number, r: () => number) {
    const t = wallTextures(kind, tint, Math.max(1, cols), Math.max(1, rows), r);
    const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: "#ffffff", roughness: 0.95 });
    this.glow(m, 1.3);
    return m;
  }

  private roof(w: number, h: number, d: number, color: string, y: number) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), mat(color, { map: pixTexture("tile", 3, 2) }));
    m.rotation.y = Math.PI / 4;
    m.scale.set(w, h, d);
    m.position.y = y + h / 2;
    m.castShadow = true;
    return m;
  }

  private timberHouse(w: number, h: number, d: number, x: number, z: number, wall: string, roof: string, r: () => number) {
    const grp = new THREE.Group();
    const rows = Math.max(1, Math.round(h / 1.0));
    const stone = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.55, d + 0.1), mat("#9a9288", { map: pixTexture("stone", Math.max(1, w / 1.3), 1) }));
    stone.position.y = -0.22;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [this.wallMat("plaster", wall, w, rows, r), mat(wall), mat("#8a6f4a"), mat(wall), this.wallMat("plaster", wall, w, rows, r), mat(wall)]);
    body.position.y = h / 2 + 0.05;
    body.castShadow = body.receiveShadow = true;
    const rh = 1.5 + h * 0.15;
    grp.add(stone, body, this.roof(w + 0.5, rh, d + 0.5, roof, h + 0.05));
    // Stone chimney with a cap, a wooden door with steps and a lantern, an awning, ivy and a barrel.
    grp.add(tbx(0.38, 1.0, 0.38, "stone", "#a79f93", w * 0.22, h + rh * 0.55, -d * 0.18, 0.5, { cast: true }), bx(0.5, 0.08, 0.5, "#6f6a62", w * 0.22, h + rh * 0.55 + 0.54, -d * 0.18));
    const dx = -w * 0.22;
    grp.add(tbx(0.5, 0.85, 0.06, "plank", "#7a4a2a", dx, 0.42, d / 2 + 0.03, 0.4), bx(0.5, 0.08, 0.08, "#4a2f1a", dx, 0.86, d / 2 + 0.04), tbx(0.7, 0.1, 0.35, "stone", "#9a9288", dx, -0.1, d / 2 + 0.22, 0.5));
    const lamp = new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: "#ff9a2f", roughness: 0.5 });
    lamp.emissiveIntensity = 1.0;
    this.torches.push(lamp);
    grp.add(bx(0.05, 0.05, 0.2, "#2b2b30", dx + 0.55, 0.95, d / 2 + 0.1), new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), lamp));
    (grp.children[grp.children.length - 1] as THREE.Mesh).position.set(dx + 0.55, 0.8, d / 2 + 0.2);
    if (r() < 0.6) {
      for (let i = 0; i < 6; i++) grp.add(bx(0.2 + r() * 0.2, 0.16, 0.06, i % 2 ? "#3f8a3f" : "#2f6f35", w / 2 + 0.02 + (i % 2) * 0.02, 0.2 + i * 0.28 + r() * 0.1, -d * 0.3 + r() * 0.5));
    }
    if (r() < 0.55) {
      const aw = bx(w * 0.5, 0.06, 0.55, "#b3412c", w * 0.22, 1.05, d / 2 + 0.3);
      aw.rotation.x = 0.35;
      aw.castShadow = true;
      grp.add(aw, bx(w * 0.5, 0.05, 0.1, "#f1e6c0", w * 0.22, 0.82, d / 2 + 0.55));
    }
    grp.add(tbx(0.34, 0.45, 0.34, "plank", "#a9743f", dx - 0.65, -0.05, d / 2 + 0.35, 0.4, { cast: true }));
    grp.position.set(x, 0, z);
    return grp;
  }

  private tower(rad: number, h: number, x: number, z: number, roof: string, r: () => number) {
    const grp = new THREE.Group();
    const tex = pixTexture("stone", Math.round(rad * 4), Math.round(h * 0.9));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.08, h, 10), mat("#a79f93", { map: tex }));
    body.position.y = h / 2 - 0.5;
    body.castShadow = body.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 1.3, rad * 2.1, 10), mat(roof, { map: pixTexture("tile", 5, 2) }));
    cap.position.y = h - 0.5 + rad;
    cap.castShadow = true;
    grp.add(body, cap);
    // arrow slits on the sides the camera sees
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshStandardMaterial({ color: "#1a140e", emissive: "#ffb347", roughness: 1 });
      this.glow(m, 1.6);
      for (const a of [0.55, 1.1]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.06), m);
        s.position.set(Math.sin(a) * rad * 1.02, i * 1.5 + 1.2, Math.cos(a) * rad * 1.02);
        s.rotation.y = a;
        grp.add(s);
      }
    }
    this.addFlag(grp, 0, h - 0.5 + rad * 2.1 + 0.4, 0, r);
    grp.position.set(x, 0, z);
    return grp;
  }

  private keep(w: number, h: number, d: number, x: number, z: number, r: () => number) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [this.wallMat("stone", "#a79f93", Math.round(w / 1.3), Math.round(h / 1.2), r), mat("#a79f93", { map: pixTexture("stone", 2, 2) }), mat("#7d776d"), mat("#a79f93"), this.wallMat("stone", "#a79f93", Math.round(d / 1.3), Math.round(h / 1.2), r), mat("#a79f93", { map: pixTexture("stone", 2, 2) })]);
    body.position.y = h / 2 - 0.5;
    body.castShadow = body.receiveShadow = true;
    grp.add(body);
    // crenellations
    const top = h - 0.5;
    for (let i = 0; i < Math.floor(w / 0.7); i++) for (const sz of [-1, 1]) grp.add(tbx(0.4, 0.4, 0.3, "stone", "#a79f93", -w / 2 + 0.35 + i * 0.7, top + 0.2, sz * (d / 2 - 0.15), 0.8, { cast: true }));
    for (let i = 0; i < Math.floor(d / 0.7); i++) for (const sx of [-1, 1]) grp.add(tbx(0.3, 0.4, 0.4, "stone", "#a79f93", sx * (w / 2 - 0.15), top + 0.2, -d / 2 + 0.35 + i * 0.7, 0.8, { cast: true }));
    // gate
    grp.add(bx(1.0, 1.4, 0.08, "#5a3b22", 0, 0.2, d / 2 + 0.02));
    this.addFlag(grp, w / 2 - 0.5, top + 0.4, 0, r, 1.6);
    this.addFlag(grp, -w / 2 + 0.5, top + 0.4, 0, r, 1.6);
    grp.position.set(x, 0, z);
    return grp;
  }

  private addFlag(parent: THREE.Object3D, x: number, y: number, z: number, r: () => number, pole = 1.1) {
    const cols = [["#9b2226", "#e6c14a"], ["#1d4e89", "#e6c14a"], ["#2d6a4f", "#f1e6c0"]][Math.floor(r() * 3)]!;
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.add(bx(0.06, pole, 0.06, "#3a2a1a", 0, pole / 2, 0));
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ map: flagTexture(cols[0]!, cols[1]!), side: THREE.DoubleSide, roughness: 1 }));
    cloth.position.set(0.38, pole - 0.25, 0);
    const pivot = new THREE.Group();
    pivot.add(cloth);
    pivot.position.set(0.03, 0, 0);
    holder.add(pivot);
    this.flags.push(pivot);
    parent.add(holder);
  }

  private windmill(x: number, z: number) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.35, 3.4, 8), mat("#e2d3b0", { map: pixTexture("plaster", 3, 3) }));
    body.position.y = 1.7 - 0.5;
    body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.2, 8), mat("#6b4a2f", { map: pixTexture("tile", 4, 2) }));
    cap.position.y = 3.4 - 0.5 + 0.6;
    cap.castShadow = true;
    const sails = new THREE.Group();
    sails.position.set(1.0, 2.9, 0);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.x = (i * Math.PI) / 2;
      arm.add(bx(0.06, 2.4, 0.06, "#5a3b22", 0, 1.2, 0));
      arm.add(bx(0.04, 1.5, 0.55, "#efe3bd", 0.03, 1.55, 0.3));
      sails.add(arm);
    }
    this.sails = sails;
    grp.add(body, cap, sails);
    grp.position.set(x, 0, z);
    return grp;
  }

  private stall(x: number, z: number, color: string) {
    const grp = new THREE.Group();
    for (const [dx, dz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]] as const) grp.add(bx(0.06, 1.2, 0.06, "#5a3b22", dx, 0.1, dz, { cast: true }));
    grp.add(tbx(1.4, 0.1, 0.9, "plank", "#c08a52", 0, 0.1 - 0.5 + 0.7, 0, 0.8, { cast: true }));
    for (let i = 0; i < 6; i++) grp.add(bx(0.24, 0.05, 1.1, i % 2 ? "#f1e6c0" : color, -0.6 + i * 0.24, 0.78, 0, { cast: true }));
    for (const [dx, c] of [[-0.4, "#d9534f"], [0, "#e8c547"], [0.4, "#6cc070"]] as const) grp.add(bx(0.22, 0.14, 0.22, c, dx, 0.32, 0));
    grp.add(tbx(0.4, 0.4, 0.4, "plank", "#a67444", 0.95, -0.3, 0.2, 0.4, { cast: true }));
    grp.position.set(x, 0, z);
    return grp;
  }

  private well(x: number, z: number) {
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.65, 10), mat("#a79f93", { map: pixTexture("stone", 4, 1) }));
    ring.position.y = -0.17;
    ring.castShadow = true;
    grp.add(ring, bx(0.07, 1.0, 0.07, "#5a3b22", -0.45, 0.3, 0), bx(0.07, 1.0, 0.07, "#5a3b22", 0.45, 0.3, 0), bx(1.1, 0.06, 0.07, "#5a3b22", 0, 0.8, 0));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.45, 4), mat("#8c3b2a", { map: pixTexture("tile", 2, 1) }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 1.05;
    grp.add(roof);
    grp.position.set(x, 0, z);
    return grp;
  }

  private tree(x: number, z: number, s: number, pine: boolean, r: () => number) {
    const g = new THREE.Group();
    g.add(tbx(0.22 * s, 0.9 * s, 0.22 * s, "plank", "#7a5230", 0, 0.45 * s - 0.5, 0, 0.3, { cast: true }));
    const greens = ["#3f9b4f", "#4caf50", "#2e8b57", "#5a9e3a"];
    const green = mat(greens[Math.floor(r() * greens.length)]!, { flatShading: true, map: pixTexture("grass", 2, 2) });
    if (pine) {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((0.95 - i * 0.22) * s, 0.9 * s, 6), green);
        cone.position.y = (1.0 + i * 0.6) * s - 0.5;
        cone.castShadow = true;
        g.add(cone);
      }
    } else {
      const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 * s, 0), green);
      a.position.y = 1.5 * s - 0.5;
      a.castShadow = true;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 0), green);
      b.position.set(0.4 * s, 1.15 * s - 0.5, 0.2 * s);
      b.castShadow = true;
      g.add(a, b);
    }
    g.position.set(x, 0, z);
    this.group.add(g);
    this.trees.push(g);
  }

  private torch(x: number, z: number) {
    const g = new THREE.Group();
    g.add(tbx(0.1, 1.5, 0.1, "plank", "#5a3b22", 0, 0.25, 0, 0.5, { cast: true }));
    g.add(bx(0.22, 0.1, 0.22, "#3a3a42", 0, 1.03, 0));
    const flame = new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: "#ff8a1f", roughness: 0.5 });
    flame.emissiveIntensity = 0.7;
    this.torches.push(flame);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.16), flame);
    f.position.y = 1.2;
    g.add(f);
    g.position.set(x, 0, z);
    this.group.add(g);
  }

  private cart(color: string, rider: boolean) {
    const g = new THREE.Group();
    const wood = "#8a5a34";
    const horse = new THREE.Group();
    horse.position.x = 1.15;
    const coat = ["#6b4423", "#3b2a1c", "#d8d2c4", "#8a5a34"][Math.floor(color.length * 7) % 4]!;
    horse.add(bx(0.78, 0.36, 0.3, coat, 0, 0.44, 0, { cast: true }));
    const neck = bx(0.18, 0.4, 0.2, coat, 0.4, 0.66, 0, { cast: true });
    neck.rotation.z = -0.4;
    horse.add(neck, bx(0.3, 0.17, 0.17, coat, 0.62, 0.84, 0, { cast: true }), bx(0.08, 0.2, 0.06, "#222", 0.5, 0.95, 0), bx(0.08, 0.3, 0.1, "#222", -0.43, 0.46, 0));
    const legs: THREE.Object3D[] = [];
    for (const [lx, lz] of [[-0.3, -0.11], [-0.3, 0.11], [0.3, -0.11], [0.3, 0.11]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.3, lz);
      pivot.add(bx(0.08, 0.34, 0.08, coat, 0, -0.17, 0));
      horse.add(pivot);
      legs.push(pivot);
    }
    g.add(horse);
    g.add(bx(0.9, 0.08, 0.56, wood, -0.2, 0.28, 0, { cast: true }));
    for (const sz of [-1, 1]) g.add(bx(0.9, 0.2, 0.05, wood, -0.2, 0.4, sz * 0.27, { cast: true }));
    g.add(bx(0.05, 0.2, 0.56, wood, -0.65, 0.4, 0), bx(0.5, 0.06, 0.05, "#5a3b22", 0.55, 0.3, 0));
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), mat("#5a3b22"));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(-0.2, 0.2, sz * 0.31);
      g.add(wheel);
    }
    g.add(bx(0.55, 0.22, 0.4, color, -0.25, 0.46, 0, { cast: true }), bx(0.22, 0.2, 0.22, "#d8c58a", -0.45, 0.6, 0.05, { cast: true }));
    if (rider) g.add(bx(0.16, 0.3, 0.16, "#2d6a4f", -0.5, 0.78, 0, { cast: true }), bx(0.16, 0.16, 0.16, "#e0ac69", -0.5, 1.0, 0, { cast: true }));
    return { g, legs };
  }
}
