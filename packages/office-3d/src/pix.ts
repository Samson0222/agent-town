import * as THREE from "three";

/**
 * Tiny hand-drawn-style textures (made in code, nearest-neighbour filtered) for the medieval pixel look.
 * They are light and neutral: a material's colour tints them.
 */
export type Kind = "stone" | "plank" | "cobble" | "grass" | "tile" | "plaster" | "dirt";

const base = new Map<Kind, THREE.CanvasTexture>();

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const g = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;

function draw(kind: Kind): HTMLCanvasElement {
  const N = 32;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const x = c.getContext("2d")!;
  const r = rand(kind.length * 977 + 13);
  x.fillStyle = g(235);
  x.fillRect(0, 0, N, N);
  const px = (i: number, j: number, v: number, w = 1, h = 1) => {
    x.fillStyle = g(v);
    x.fillRect(i, j, w, h);
  };
  switch (kind) {
    case "stone": {
      // Brick rows, each brick a slightly different grey, dark mortar lines.
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 8 : 0;
        for (let col = -1; col < 3; col++) {
          const bx = col * 16 + off;
          px(bx, row * 8, 200 + r() * 55, 16, 8);
          for (let k = 0; k < 5; k++) px(bx + 1 + ((r() * 13) | 0), row * 8 + 1 + ((r() * 5) | 0), 170 + r() * 40, 2, 1);
          px(bx, row * 8, 120, 16, 1);
          px(bx, row * 8, 120, 1, 8);
        }
      }
      break;
    }
    case "plank": {
      for (let row = 0; row < 4; row++) {
        px(0, row * 8, 215 + r() * 40, N, 8);
        px(0, row * 8 + 7, 120, N, 1);
        const cut = (r() * N) | 0;
        px(cut, row * 8, 130, 1, 7);
        for (let k = 0; k < 6; k++) px((r() * N) | 0, row * 8 + 1 + ((r() * 5) | 0), 170 + r() * 30, 3 + ((r() * 4) | 0), 1);
      }
      break;
    }
    case "cobble": {
      px(0, 0, 105, N, N);
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 4 : 0;
        for (let col = -1; col < 4; col++) {
          const bx = col * 8 + off;
          px(bx + 1, row * 8 + 1, 175 + r() * 70, 6, 6);
          px(bx + 2, row * 8 + 1, 235, 3, 1);
        }
      }
      break;
    }
    case "grass": {
      px(0, 0, 225, N, N);
      for (let k = 0; k < 90; k++) px((r() * N) | 0, (r() * N) | 0, r() < 0.5 ? 195 : 250, 1, 1);
      for (let k = 0; k < 10; k++) {
        const i = (r() * N) | 0;
        const j = (r() * N) | 0;
        px(i, j, 170, 1, 2);
        px(i + 1, j + 1, 170, 1, 1);
      }
      break;
    }
    case "tile": {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const bx = col * 8 + (row % 2 ? 4 : 0);
          px(bx, row * 8, 200 + r() * 55, 8, 8);
          px(bx, row * 8 + 7, 110, 8, 1);
          px(bx + 7, row * 8, 150, 1, 8);
          px(bx + 1, row * 8, 255, 5, 1);
        }
      }
      break;
    }
    case "plaster": {
      for (let k = 0; k < 40; k++) px((r() * N) | 0, (r() * N) | 0, 205 + r() * 35, 2, 1);
      break;
    }
    case "dirt": {
      px(0, 0, 215, N, N);
      for (let k = 0; k < 80; k++) px((r() * N) | 0, (r() * N) | 0, 160 + r() * 80, 1 + ((r() * 2) | 0), 1);
      break;
    }
  }
  return c;
}

export function pixTexture(kind: Kind, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  let t = base.get(kind);
  if (!t) {
    t = new THREE.CanvasTexture(draw(kind));
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    base.set(kind, t);
  }
  if (repeatX === 1 && repeatY === 1) return t;
  const c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(repeatX, repeatY);
  return c;
}

/** A canvas made crisp: nearest-neighbour, for signs, flags and windows. */
export function crisp(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** A box whose texture keeps the same size on every face (one tile = `scale` world units). */
export function texBox(w: number, h: number, d: number, kind: Kind, color: string, scale = 1, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const sizes: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [sw, sh] = sizes[f]!;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * sw) / scale, (uv.getY(i) * sh) / scale);
    }
  }
  uv.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map: pixTexture(kind), color, roughness: 0.95, metalness: 0, ...extra });
  return new THREE.Mesh(geo, m);
}
