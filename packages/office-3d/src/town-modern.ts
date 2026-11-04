import * as THREE from "three";
import type { OfficePlan } from "./layout";

/**
 * The modern town around the office (the original 3D look): grass, a plaza, a street with cars, neighbouring
 * buildings, a park with a pond, trees and street lamps. All geometry is made here.
 * Nothing tall stands south or east of the office (that is the camera side), so it never hides anyone.
 */

import type { Phase } from "./town";

export const MODERN_SKY: Record<Phase, string> = { day: "#9fd8ff", dusk: "#f3a77b", night: "#0e1430" };

type Glow = { mat: THREE.MeshStandardMaterial; on: number; at: Phase[] };
type Car = { g: THREE.Group; dir: number; speed: number };

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function mat(color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, ...o });
}

function bx(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, o: { cast?: boolean; receive?: boolean } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = !!o.cast;
  mesh.receiveShadow = !!o.receive;
  return mesh;
}

/** Albedo and "lit windows" textures for a building face. */
function windowTextures(wall: string, cols: number, rows: number, rand: () => number) {
  const S = 256;
  const a = document.createElement("canvas");
  const e = document.createElement("canvas");
  a.width = a.height = e.width = e.height = S;
  const ca = a.getContext("2d")!;
  const ce = e.getContext("2d")!;
  ca.fillStyle = wall;
  ca.fillRect(0, 0, S, S);
  ce.fillStyle = "#000";
  ce.fillRect(0, 0, S, S);
  const cw = S / cols;
  const rh = S / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const x = c * cw + cw * 0.2;
      const y = r * rh + rh * 0.22;
      const w = cw * 0.6;
      const h = rh * 0.52;
      ca.fillStyle = "#6f8fb5";
      ca.fillRect(x, y, w, h);
      ca.fillStyle = "rgba(255,255,255,.35)";
      ca.fillRect(x, y, w, h * 0.3);
      if (rand() < 0.55) {
        ce.fillStyle = rand() < 0.8 ? "#ffd27a" : "#9fd0ff";
        ce.fillRect(x, y, w, h);
      }
    }
  const t = (c: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  return { map: t(a), emissiveMap: t(e) };
}

export class ModernTown {
  readonly group = new THREE.Group();
  private glows: Glow[] = [];
  private cars: Car[] = [];
  private trees: THREE.Object3D[] = [];
  private water?: THREE.Mesh;
  private roadX: [number, number];
  private phase: Phase = "day";
  /** Warm lights inside the office for evening and night. */
  readonly indoor: THREE.PointLight[] = [];

  constructor(plan: OfficePlan) {
    const g = this.group;
    const cx = (plan.minX + plan.maxX) / 2;
    const r = rng(7);
    const GROUND = -0.5;

    // Grass, plaza, street
    g.add(bx(220, 0.2, 220, mat("#7cc86b"), cx, GROUND - 0.1, (plan.minZ + plan.maxZ) / 2, { receive: true }));
    g.add(bx(plan.maxX - plan.minX + 2.6, 0.08, plan.maxZ - plan.minZ + 2.6, mat("#d8d3c8"), cx, GROUND + 0.04, (plan.minZ + plan.maxZ) / 2, { receive: true }));
    const roadZ = plan.maxZ + 3.7;
    this.roadX = [cx - 36, cx + 36];
    g.add(bx(72, 0.08, 1.1, mat("#d8d3c8"), cx, GROUND + 0.04, plan.maxZ + 1.75, { receive: true }));
    g.add(bx(72, 0.06, 2.8, mat("#3c4150"), cx, GROUND + 0.03, roadZ, { receive: true }));
    g.add(bx(72, 0.08, 1.1, mat("#d8d3c8"), cx, GROUND + 0.04, roadZ + 1.95, { receive: true }));
    for (let x = this.roadX[0]; x < this.roadX[1]; x += 2.2) g.add(bx(1.0, 0.01, 0.1, mat("#f5f0d0"), x, GROUND + 0.07, roadZ));
    // Flower beds along the plaza
    for (let i = 0; i < 9; i++) {
      const fx = plan.minX + 1 + i * ((plan.maxX - plan.minX - 2) / 8);
      const fz = plan.maxZ + 1.0;
      g.add(bx(0.55, 0.14, 0.3, mat("#7a5230"), fx, GROUND + 0.15, fz));
      for (let k = 0; k < 4; k++) g.add(bx(0.1, 0.1, 0.1, mat(["#ff6b9d", "#ffd23f", "#ff8c42", "#c77dff"][(i + k) % 4]!), fx - 0.2 + k * 0.13, GROUND + 0.26, fz));
    }

    // Buildings behind the office (north) and houses to the west
    const northZ = plan.minZ - 3.6;
    const palette = ["#e8a87c", "#85c1c9", "#c38d9e", "#9bc995", "#e7d27c", "#a29bfe", "#f19c79"];
    let x = plan.minX - 9;
    for (let i = 0; x < plan.maxX + 16; i++) {
      const w = 3 + r() * 2.4;
      const h = 3 + r() * 3.2;
      const d = 3 + r() * 2;
      g.add(this.building(w, h, d, x + w / 2, northZ - d / 2, palette[i % palette.length]!, r, true));
      x += w + 0.5 + r() * 0.8;
    }
    for (let i = 0; i < 3; i++) {
      const z = plan.minZ + 1.2 + i * 4.4;
      g.add(this.house(plan.minX - 5.2 - (i % 2) * 1.2, z, palette[(i + 3) % palette.length]!, r));
    }
    g.add(this.house(plan.minX - 11, plan.maxZ - 1, palette[2]!, r));

    // East park: pond, trees, benches
    const px = plan.maxX + 6.2;
    const pz = (plan.minZ + plan.maxZ) / 2;
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.06, 28), new THREE.MeshStandardMaterial({ color: "#4fa8e8", roughness: 0.15, metalness: 0.25, emissive: "#1d5f9e", emissiveIntensity: 0.25 }));
    pond.scale.z = 0.7;
    pond.position.set(px, GROUND + 0.09, pz + 0.2);
    pond.receiveShadow = true;
    this.water = pond;
    g.add(pond);
    g.add(bx(0.5, 0.08, 0.5, mat("#8bc26d"), px - 1, GROUND + 0.16, pz));
    for (const dz of [-2.6, 2.8]) {
      g.add(bx(1.1, 0.12, 0.35, mat("#8a5a34"), px + 0.2, GROUND + 0.4, pz + dz, { cast: true }));
      g.add(bx(1.1, 0.3, 0.06, mat("#8a5a34"), px + 0.2, GROUND + 0.6, pz + dz + (dz < 0 ? -0.15 : 0.15), { cast: true }));
    }
    for (let i = 0; i < 16; i++) {
      const tx = plan.maxX + 4 + r() * 12;
      const tz = plan.minZ - 3 + r() * (plan.maxZ - plan.minZ + 4.6);
      if (Math.hypot(tx - px, (tz - pz) / 0.7) < 3.2) continue;
      this.tree(tx, tz, 0.8 + r() * 0.55, r() < 0.3, r);
    }
    // Trees between the houses and along the street
    for (let i = 0; i < 12; i++) this.tree(plan.minX - 3.3 + r() * 2, plan.minZ - 1 + r() * (plan.maxZ - plan.minZ + 3), 0.7 + r() * 0.4, r() < 0.4, r);
    for (let i = 0; i < 14; i++) this.tree(cx - 30 + i * 4.5 + r() * 2, roadZ + 3.5 + r() * 1.5, 0.8 + r() * 0.5, r() < 0.3, r);

    // Street lamps
    for (let lx = plan.minX - 6; lx < plan.maxX + 14; lx += 5.5) this.lamp(lx, plan.maxZ + 2.1);

    // Cars
    const colors = ["#ef476f", "#ffd166", "#06d6a0", "#4f86f7", "#f78c6b", "#e0e0e8"];
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 ? -1 : 1;
      const car = this.car(colors[i % colors.length]!);
      car.position.set(this.roadX[0] + r() * 72, GROUND + 0.1, roadZ + dir * -0.65);
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      this.cars.push({ g: car, dir, speed: 1.6 + r() * 1.4 });
      g.add(car);
    }

    // Warm light inside the office when it is dark
    for (const [lx, lz] of [
      [plan.minX + (plan.corridorX - plan.minX) / 2, (plan.minZ + plan.maxZ) / 2],
      [plan.coffeeTable.x, plan.coffeeTable.z + 0.6],
    ] as const) {
      const l = new THREE.PointLight("#ffcf9a", 0, 11, 1.4);
      l.position.set(lx, 2.1, lz);
      this.indoor.push(l);
      g.add(l);
    }
    this.setPhase("day");
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  setPhase(phase: Phase) {
    this.phase = phase;
    for (const gl of this.glows) gl.mat.emissiveIntensity = gl.at.includes(phase) ? gl.on : 0;
    const k = phase === "day" ? 0 : phase === "dusk" ? 12 : 22;
    this.indoor.forEach((l) => (l.intensity = k));
  }

  update(t: number, dt: number) {
    for (const c of this.cars) {
      c.g.position.x += c.dir * c.speed * dt;
      if (c.g.position.x > this.roadX[1]) c.g.position.x = this.roadX[0];
      if (c.g.position.x < this.roadX[0]) c.g.position.x = this.roadX[1];
    }
    this.trees.forEach((tr, i) => {
      tr.rotation.z = Math.sin(t * 0.9 + i) * 0.025;
      tr.rotation.x = Math.cos(t * 0.7 + i * 1.7) * 0.02;
    });
    if (this.water) this.water.scale.x = 1 + Math.sin(t * 1.3) * 0.015;
  }

  // -------------------------------------------------------------------------

  private glow(m: THREE.MeshStandardMaterial, on: number, at: Phase[] = ["dusk", "night"]) {
    this.glows.push({ mat: m, on, at });
    m.emissiveIntensity = 0;
  }

  private building(w: number, h: number, d: number, x: number, z: number, color: string, r: () => number, flat: boolean) {
    const grp = new THREE.Group();
    const rows = Math.max(2, Math.round(h / 1.1));
    const cols = Math.max(2, Math.round(w / 1.0));
    const face = (cw: number) => {
      const t = windowTextures(color, Math.max(2, Math.round(cw / 1.0)), rows, r);
      const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: "#ffffff", roughness: 0.85 });
      this.glow(m, 1.1);
      return m;
    };
    void cols;
    const plain = mat(color);
    const top = mat("#6b6f7c");
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [face(d), plain, top, plain, face(w), plain]);
    body.position.set(0, h / 2 - 0.5, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);
    if (flat) {
      grp.add(bx(w * 0.4, 0.5, d * 0.4, mat("#8d909c"), w * 0.15, h - 0.25, 0));
      grp.add(bx(w + 0.2, 0.15, d + 0.2, mat("#565a68"), 0, h - 0.43, 0));
    }
    grp.position.set(x, 0, z);
    return grp;
  }

  private house(x: number, z: number, color: string, r: () => number) {
    const grp = new THREE.Group();
    const w = 2.6;
    const d = 2.6;
    const h = 1.8;
    const t = windowTextures(color, 2, 1, r);
    const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: "#ffffff", roughness: 0.85 });
    this.glow(m, 1.1);
    const plain = mat(color);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [m, plain, plain, plain, m, plain]);
    body.position.y = h / 2 - 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), mat("#b5533c"));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 0.1;
    roof.castShadow = true;
    grp.add(body, roof, bx(0.35, 0.8, 0.35, mat("#8a5a34"), 0.7, h + 0.45, -0.5, { cast: true }));
    grp.position.set(x, 0, z);
    return grp;
  }

  private tree(x: number, z: number, s: number, pine: boolean, r: () => number) {
    const g = new THREE.Group();
    g.add(bx(0.22 * s, 0.9 * s, 0.22 * s, mat("#7a5230"), 0, 0.45 * s - 0.5, 0, { cast: true }));
    const greens = ["#3f9b4f", "#4caf50", "#5fb760", "#2e8b57"];
    const green = mat(greens[Math.floor(r() * greens.length)]!, { flatShading: true });
    if (pine) {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((0.95 - i * 0.22) * s, 0.9 * s, 7), green);
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

  private lamp(x: number, z: number) {
    const m = new THREE.MeshStandardMaterial({ color: "#fff1c4", emissive: "#ffd27a", roughness: 0.4 });
    this.glow(m, 2.2);
    const g = new THREE.Group();
    g.add(bx(0.07, 1.9, 0.07, mat("#2d3142"), 0, 0.45, 0, { cast: true }));
    g.add(bx(0.35, 0.06, 0.06, mat("#2d3142"), -0.15, 1.4, 0));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m);
    bulb.position.set(-0.3, 1.34, 0);
    g.add(bulb);
    g.position.set(x, 0, z);
    this.group.add(g);
  }

  private car(color: string) {
    const g = new THREE.Group();
    const body = mat(color, { roughness: 0.45, metalness: 0.25 });
    g.add(bx(1.3, 0.3, 0.64, body, 0, 0.22, 0, { cast: true }));
    g.add(bx(0.7, 0.28, 0.58, mat("#cfe6f5", { roughness: 0.2, metalness: 0.2 }), -0.08, 0.5, 0, { cast: true }));
    for (const [wx, wz] of [[-0.42, -0.3], [0.42, -0.3], [-0.42, 0.3], [0.42, 0.3]] as const) g.add(bx(0.22, 0.22, 0.08, mat("#1d1d26"), wx, 0.1, wz));
    const head = new THREE.MeshStandardMaterial({ color: "#fff6d0", emissive: "#ffe9a0" });
    this.glow(head, 2.5);
    g.add(bx(0.04, 0.09, 0.14, head, 0.66, 0.26, -0.2), bx(0.04, 0.09, 0.14, head, 0.66, 0.26, 0.2));
    return g;
  }
}
