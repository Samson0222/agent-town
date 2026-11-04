/**
 * Draws the medieval art set for the 2D office (Agent Town's own art, made in code).
 *
 *   node packages/pixel-office/scripts/build-medieval-assets.mjs
 *
 * It writes apps/web/public/pixel-office/medieval/assets/ with the same structure and ids as the
 * modern set, so the same engine loads either one. Floors and walls are grayscale patterns (the
 * engine tints them from the layout); furniture is drawn in colour; characters get tunics.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../../../apps/web/public/pixel-office/assets");
const DEST = resolve(here, "../../../apps/web/public/pixel-office/medieval/assets");

// ---------------------------------------------------------------------------- PNG

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
function encodePng(img) {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.d.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function decodePng(buf) {
  let pos = 8;
  let w = 0, h = 0, depth = 8, type = 6;
  const idat = [];
  let plte = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const t = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (t === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    else if (t === "IDAT") idat.push(data);
    else if (t === "PLTE") plte = data;
    else if (t === "tRNS") trns = data;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error("only 8-bit PNGs");
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= ch ? px[y * stride + i - ch] : 0;
      const b = y ? px[(y - 1) * stride + i] : 0;
      const c = y && i >= ch ? px[(y - 1) * stride + i - ch] : 0;
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[y * stride + i] = r & 255;
    }
  }
  const img = new Img(w, h);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (type === 6) [r, g, b, a] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
    else if (type === 2) [r, g, b] = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
    else if (type === 0) r = g = b = px[i];
    else if (type === 4) { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    else { const k = px[i]; [r, g, b] = [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2]]; a = trns && k < trns.length ? trns[k] : 255; }
    img.d.set([r, g, b, a], i * 4);
  }
  return img;
}

// ---------------------------------------------------------------------------- drawing

class Img {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  p(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return this;
    const [r, g, b, a = 255] = typeof c === "string" ? hex(c) : c;
    this.d.set([r, g, b, a], (y * this.w + x) * 4);
    return this;
  }
  get(x, y) { const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  r(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c); return this; }
  /** Filled box with a dark outline, a light top edge and a dark bottom edge. */
  box(x, y, w, h, fill, o = {}) {
    const { out = OUT, hi, lo } = o;
    this.r(x, y, w, h, out).r(x + 1, y + 1, w - 2, h - 2, fill);
    if (hi) this.r(x + 1, y + 1, w - 2, 1, hi);
    if (lo) this.r(x + 1, y + h - 2, w - 2, 1, lo);
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.0) this.p(cx + x, cy + y, c);
    return this;
  }
}
const hexCache = new Map();
function hex(s) {
  let v = hexCache.get(s);
  if (!v) {
    const t = s.replace("#", "");
    v = [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16), t.length > 6 ? parseInt(t.slice(6, 8), 16) : 255];
    hexCache.set(s, v);
  }
  return v;
}
let seed = 1;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const sprite = (w, h, fn) => { const i = new Img(w, h); fn(i); return i; };

const OUT = "#2a1a10";
const W = { d: "#5a3a22", m: "#8a5a34", l: "#b07a44", h: "#d09a58" };
const IRON = { d: "#33363f", m: "#5b606c", l: "#8a909c" };
const RED = { d: "#6e1a1d", m: "#9b2226", l: "#c0392b" };
const PARCH = { d: "#b89a5e", m: "#e0cc96", l: "#f3e6bd" };
const GREEN = { d: "#245a2c", m: "#3f8f3f", l: "#6cc070" };
const CLAY = { d: "#7a3d22", m: "#b5603a", l: "#d98050" };
const GOLD = "#e6c14a";
const BLUE = { d: "#1c3a66", m: "#2f5fa3", l: "#5b8fd6" };

// ---------------------------------------------------------------------------- floors / walls (grayscale; tinted by the layout)

const g = (v) => [v | 0, v | 0, v | 0, 255];
function floor(kind) {
  seed = kind * 977 + 11;
  const f = new Img(16, 16);
  const speck = (n, lo, hi) => { for (let k = 0; k < n; k++) f.p(rnd() * 16, rnd() * 16, g(lo + rnd() * (hi - lo))); };
  if (kind === 0 || kind === 6) {
    // oak planks, each its own tone
    for (let r = 0; r < 4; r++) {
      f.r(0, r * 4, 16, 4, g(190 + rnd() * 55));
      f.r(0, r * 4 + 3, 16, 1, g(110));
      f.r(((r * 7) % 12) + 2, r * 4, 1, 3, g(120));
      for (let k = 0; k < 3; k++) f.r(rnd() * 14, r * 4 + 1 + (rnd() * 2 | 0), 2 + (rnd() * 3 | 0), 1, g(165));
    }
  } else if (kind === 1 || kind === 7) {
    // flagstones: big irregular slabs
    f.r(0, 0, 16, 16, g(105));
    for (const [x, y, w, h] of [[0, 0, 9, 7], [9, 0, 7, 9], [0, 7, 7, 9], [7, 9, 9, 7], [7, 7, 2, 2]]) { f.r(x + 1, y + 1, w - 1, h - 1, g(175 + rnd() * 70)); f.r(x + 1, y + 1, w - 1, 1, g(245)); }
    speck(10, 150, 210);
  } else if (kind === 2) {
    // cobbles
    f.r(0, 0, 16, 16, g(95));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = c * 4 + (r % 2 ? 2 : 0) - (r % 2 ? 0 : 0); f.r(x + 1, r * 4 + 1, 3, 3, g(170 + rnd() * 80)); f.p(x + 1, r * 4 + 1, g(250)); }
  } else if (kind === 3) {
    // terracotta tiles
    f.r(0, 0, 16, 16, g(120));
    for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) { f.r(x + 1, y + 1, 7, 7, g(185 + rnd() * 50)); f.r(x + 1, y + 1, 7, 1, g(245)); }
  } else if (kind === 4) {
    // straw
    f.r(0, 0, 16, 16, g(200));
    for (let k = 0; k < 40; k++) { const x = rnd() * 16, y = rnd() * 16; f.r(x, y, 3 + (rnd() * 3 | 0), 1, g(rnd() < 0.5 ? 245 : 150)); }
  } else if (kind === 5) {
    // slate squares, checker
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) f.p(x, y, g(((x >> 3) + (y >> 3)) % 2 ? 150 : 215));
    f.r(0, 0, 16, 1, g(110)); f.r(0, 8, 16, 1, g(110)); f.r(0, 0, 1, 16, g(110)); f.r(8, 0, 1, 16, g(110));
  } else {
    // mossy stone
    f.r(0, 0, 16, 16, g(110));
    for (const [x, y, w, h] of [[0, 0, 8, 8], [8, 0, 8, 8], [0, 8, 8, 8], [8, 8, 8, 8]]) { f.r(x + 1, y + 1, w - 1, h - 1, g(170 + rnd() * 60)); }
    speck(14, 120, 240);
  }
  return f;
}

/** Wall pieces keep the original shape (alpha) but become stone brick. */
function wallFrom(src) {
  const out = new Img(src.w, src.h);
  seed = 99;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const [r, gg, b, a] = src.get(x, y);
      if (!a) continue;
      const lum = (r * 0.3 + gg * 0.59 + b * 0.11);
      if (lum < 90) { out.p(x, y, [Math.max(0, r - 10), Math.max(0, gg - 10), Math.max(0, b - 10), a]); continue; }
      // brick pattern: courses 4px tall, bricks 8px wide, offset every other course
      const course = Math.floor(y / 4);
      const bx = (x + (course % 2 ? 4 : 0)) % 8;
      const mortar = y % 4 === 3 || bx === 7;
      const tone = 168 + (((Math.floor((x + (course % 2 ? 4 : 0)) / 8) * 37 + course * 53) % 5) * 9);
      out.p(x, y, mortar ? [120, 120, 120, a] : [y % 4 === 0 ? 235 : tone, y % 4 === 0 ? 235 : tone, y % 4 === 0 ? 235 : tone, a]);
    }
  return out;
}

// ---------------------------------------------------------------------------- furniture

const F = {};

F.BIN = () => sprite(16, 16, (i) => {
  i.box(3, 3, 10, 12, W.m, { hi: W.l });
  for (let y = 5; y < 14; y++) { i.p(6, y, W.d); i.p(9, y, W.d); }
  i.r(2, 5, 12, 1, IRON.m); i.r(2, 11, 12, 1, IRON.m);
  i.r(3, 2, 10, 2, W.d);
});
F.BARREL = () => sprite(16, 16, (i) => {
  i.ellipse(8, 8, 6, 7, OUT); i.ellipse(8, 8, 5, 6, W.m);
  i.r(3, 4, 10, 1, IRON.m); i.r(3, 11, 10, 1, IRON.m);
  for (const x of [6, 9]) for (let y = 2; y < 14; y++) i.p(x, y, W.d);
  i.r(5, 1, 6, 1, W.l);
});
F.BOOKSHELF = () => sprite(32, 16, (i) => {
  i.box(0, 3, 32, 12, W.m, { hi: W.l });
  i.r(1, 5, 30, 7, W.d);
  const cols = [RED.m, BLUE.m, GREEN.m, GOLD, PARCH.m, RED.l];
  let x = 2;
  for (let k = 0; x < 29; k++) { const w = 2 + (k % 3); const h = 4 + (k * 3) % 3; i.r(x, 12 - h, w, h, cols[k % cols.length]); i.p(x, 12 - h, "#ffffff55"); x += w + 1; }
  i.r(1, 12, 30, 1, W.l);
});
F.DOUBLE_BOOKSHELF = () => sprite(32, 32, (i) => {
  i.box(0, 2, 32, 30, W.m, { hi: W.l });
  const cols = [RED.m, BLUE.m, GREEN.m, GOLD, PARCH.m, RED.l, "#6a3d9a"];
  for (const y0 of [4, 17]) {
    i.r(2, y0, 28, 11, W.d);
    let x = 3;
    for (let k = 0; x < 28; k++) { const w = 2 + (k % 3); const h = 6 + ((k * 5 + y0) % 4); i.r(x, y0 + 11 - h, w, h, cols[(k + y0) % cols.length]); i.p(x, y0 + 11 - h, "#ffffff44"); x += w + 1; }
    i.r(2, y0 + 11, 28, 2, W.l);
  }
  i.r(0, 0, 32, 3, W.d); i.r(0, 1, 32, 1, W.m);
});
F.CACTUS = () => sprite(16, 32, (i) => { // potted fern
  i.box(3, 22, 10, 9, CLAY.m, { hi: CLAY.l, lo: CLAY.d });
  for (const [x, y, w, h] of [[2, 10, 4, 12], [6, 4, 4, 18], [10, 10, 4, 12], [4, 14, 3, 8], [9, 14, 3, 8]]) { i.r(x, y, w, h, GREEN.m); i.r(x + 1, y, 1, h, GREEN.l); }
  i.p(7, 3, GREEN.l);
});
F.CLOCK = () => sprite(16, 32, (i) => { // heater shield
  i.r(7, 5, 2, 22, IRON.l); i.r(5, 8, 6, 2, GOLD); // sword behind
  i.box(2, 9, 12, 14, RED.m, { hi: RED.l });
  i.r(7, 10, 2, 12, GOLD); i.r(4, 14, 8, 2, GOLD);
  i.r(3, 22, 10, 1, OUT); i.r(5, 23, 6, 1, OUT); i.r(7, 24, 2, 1, OUT);
  i.r(4, 22, 8, 1, RED.d); i.r(6, 23, 4, 1, RED.d);
});
F.COFFEE = () => sprite(16, 16, (i) => { // tankard
  i.box(4, 6, 7, 9, IRON.l, { hi: "#ffffff" }); i.r(5, 7, 5, 2, "#f3e6bd"); i.r(5, 9, 5, 5, "#c98a2b");
  i.r(11, 8, 3, 1, IRON.m); i.r(13, 8, 1, 4, IRON.m); i.r(11, 11, 3, 1, IRON.m);
});
F.COFFEE_TABLE = () => sprite(32, 32, (i) => {
  i.ellipse(16, 17, 15, 11, OUT); i.ellipse(16, 16, 14, 10, W.l); i.ellipse(16, 15, 12, 8, W.h);
  for (let y = 9; y <= 21; y += 4) i.r(6, y, 20, 1, W.l);
  i.r(8, 24, 16, 3, W.d); i.r(13, 26, 6, 5, W.d); i.r(11, 30, 10, 2, OUT);
  i.p(16, 12, "#f4ecd0"); i.r(15, 13, 3, 1, "#f4ecd0");
});
function stool(i, w = 16, h = 16) {
  i.ellipse(8, 7, 6, 3, OUT); i.ellipse(8, 6, 5, 3, RED.l); i.ellipse(8, 5, 4, 2, RED.m);
  i.r(3, 9, 2, 6, W.d); i.r(11, 9, 2, 6, W.d); i.r(7, 10, 2, 5, W.m);
}
F.CUSHIONED_BENCH = () => sprite(16, 16, (i) => stool(i));
F.CUSHIONED_CHAIR_FRONT = () => sprite(16, 16, (i) => { i.box(3, 0, 10, 7, W.m); i.r(4, 1, 8, 5, RED.m); i.r(3, 7, 10, 4, RED.l); i.r(3, 11, 2, 5, W.d); i.r(11, 11, 2, 5, W.d); });
F.CUSHIONED_CHAIR_BACK = () => sprite(16, 16, (i) => { i.box(3, 0, 10, 11, W.m, { hi: W.l }); i.r(4, 3, 8, 1, W.d); i.r(3, 11, 2, 5, W.d); i.r(11, 11, 2, 5, W.d); });
F.CUSHIONED_CHAIR_SIDE = () => sprite(16, 16, (i) => { i.box(2, 0, 4, 11, W.m); i.r(5, 6, 9, 4, RED.l); i.r(5, 6, 9, 1, RED.m); i.r(3, 11, 2, 5, W.d); i.r(11, 10, 2, 6, W.d); });
function deskTop(i, w, h, edge) {
  i.r(0, 0, w, h, OUT); i.r(1, 1, w - 2, h - 2, W.h);
  for (let y = 5; y < h - 2; y += 5) i.r(1, y, w - 2, 1, W.l);
  for (let k = 0; k < w / 6; k++) i.r(2 + k * 6, 1, 1, h - 2, W.l);
  i.r(1, h - 1, w - 2, 1, OUT);
}
F.DESK_FRONT = () => sprite(48, 32, (i) => {
  deskTop(i, 48, 22);
  i.r(0, 22, 48, 5, OUT); i.r(1, 22, 46, 4, W.m); i.r(1, 22, 46, 1, W.l);
  for (let x = 4; x < 46; x += 6) i.r(x, 24, 3, 1, W.d);
  i.r(2, 26, 4, 6, W.d); i.r(42, 26, 4, 6, W.d); i.r(1, 31, 6, 1, OUT); i.r(41, 31, 6, 1, OUT);
  i.r(7, 27, 34, 2, W.d);
});
F.DESK_SIDE = () => sprite(16, 64, (i) => {
  deskTop(i, 16, 58);
  i.r(0, 58, 16, 4, OUT); i.r(1, 58, 14, 3, W.m);
  i.r(2, 61, 4, 3, W.d); i.r(10, 61, 4, 3, W.d);
});
F.TABLE_FRONT = () => sprite(48, 64, (i) => {
  i.r(0, 0, 48, 56, OUT); i.r(1, 1, 46, 54, W.h);
  for (let y = 7; y < 54; y += 7) i.r(1, y, 46, 1, W.l);
  i.r(15, 1, 18, 54, RED.m); i.r(15, 1, 1, 54, GOLD); i.r(32, 1, 1, 54, GOLD); // runner
  for (let y = 4; y < 52; y += 6) i.r(23, y, 2, 1, GOLD);
  for (const [x, y] of [[6, 10], [6, 38], [38, 10], [38, 38]]) { i.ellipse(x + 2, y + 2, 3, 2, "#f3e6bd"); i.ellipse(x + 2, y + 2, 2, 1, "#ffffff"); }
  for (const [x, y] of [[20, 6], [26, 46]]) { i.r(x, y, 2, 4, "#f4ecd0"); i.p(x, y - 1, "#ffb347"); }
  i.ellipse(24, 28, 4, 2, "#d9a24a"); i.ellipse(24, 27, 3, 1, "#f0c068");
  i.r(0, 56, 48, 4, OUT); i.r(1, 56, 46, 3, W.m); i.r(1, 56, 46, 1, W.l);
  i.r(2, 59, 5, 5, W.d); i.r(41, 59, 5, 5, W.d);
});
F.HANGING_PLANT = () => sprite(16, 32, (i) => { // hanging lantern
  for (let y = 0; y < 8; y += 2) { i.p(7, y, IRON.l); i.p(8, y + 1, IRON.m); }
  i.r(5, 8, 6, 2, IRON.m); i.box(4, 10, 8, 12, "#ffcf70", { out: IRON.d }); i.r(7, 11, 2, 10, IRON.d);
  i.r(6, 13, 4, 6, "#fff3c0"); i.r(7, 14, 2, 4, "#ffffff");
  i.r(5, 22, 6, 2, IRON.m); i.p(8, 24, IRON.d);
});
F.LARGE_PAINTING = () => sprite(32, 32, (i) => { // tapestry
  i.r(2, 0, 28, 2, W.d); i.r(0, 1, 32, 2, W.m);
  i.box(3, 3, 26, 27, RED.m, { out: RED.d });
  i.r(5, 5, 22, 1, GOLD); i.r(5, 26, 22, 1, GOLD);
  i.r(12, 10, 8, 10, "#f3e6bd"); i.r(10, 8, 12, 3, "#f3e6bd"); i.r(13, 12, 2, 4, RED.d); i.r(17, 12, 2, 4, RED.d);
  i.r(10, 7, 2, 3, "#f3e6bd"); i.r(15, 6, 2, 4, "#f3e6bd"); i.r(20, 7, 2, 3, "#f3e6bd");
  for (let x = 4; x < 28; x += 4) { i.r(x, 30, 2, 2, GOLD); }
});
F.FIREPLACE = () => sprite(32, 32, (i) => {
  i.box(0, 2, 32, 30, "#8a8478", { hi: "#b3ad9f" });
  for (let y = 6; y < 30; y += 5) i.r(1, y, 30, 1, "#5f5a52");
  for (let x = 4; x < 30; x += 8) i.r(x, 3, 1, 28, "#6e6a60");
  i.r(0, 0, 32, 4, "#6e6a60"); i.r(0, 0, 32, 1, OUT);
  i.box(6, 12, 20, 20, "#1b1410", { out: OUT });
  i.r(8, 26, 16, 5, "#2f2118");
  for (const [x, y, w, h, c] of [[9, 20, 14, 8, "#e0521a"], [11, 16, 10, 10, "#ff8a1f"], [13, 18, 6, 8, "#ffc15a"], [15, 21, 3, 5, "#fff3c0"]]) i.r(x, y, w, h, c);
  i.r(8, 28, 16, 2, W.d); i.r(10, 27, 3, 2, W.m); i.r(19, 27, 3, 2, W.m);
});
F.LARGE_PLANT = () => sprite(32, 48, (i) => {
  i.ellipse(16, 40, 10, 7, OUT); i.ellipse(16, 40, 9, 6, W.m);
  i.r(7, 36, 18, 2, IRON.m); i.r(8, 43, 16, 2, IRON.m); i.r(15, 28, 2, 10, W.d);
  for (const [x, y, rx, ry] of [[16, 12, 12, 9], [8, 20, 8, 7], [24, 20, 8, 7], [16, 24, 8, 6]]) { i.ellipse(x, y, rx, ry, GREEN.d); i.ellipse(x, y - 1, rx - 1, ry - 1, GREEN.m); i.ellipse(x - 2, y - 3, rx - 4, ry - 4, GREEN.l); }
  for (const [x, y] of [[10, 10], [20, 8], [14, 18], [22, 22]]) i.p(x, y, "#d63a2f");
});
function slate(i, glow, variant) {
  // a stone tablet on a wooden stand, runes glow when it is working
  i.box(1, 3, 14, 17, IRON.m, { hi: IRON.l });
  i.r(3, 5, 10, 13, glow ? "#0e2236" : "#1b1a1f");
  if (glow) {
    const c = ["#6fd0ff", "#9be8ff", "#5fb3ff"][variant % 3];
    const rows = [[4, 6], [6, 3], [5, 7], [3, 5]];
    rows.forEach(([x, w], k) => { i.r(4 + ((x + variant) % 3), 6 + k * 3, w + (variant % 2), 1, c); i.p(4 + ((x + w + variant) % 6), 7 + k * 3, "#ffffff"); });
  } else { i.r(5, 8, 3, 1, "#3a3a46"); i.r(6, 12, 4, 1, "#3a3a46"); }
  i.r(5, 20, 6, 3, W.d); i.r(3, 22, 10, 2, W.m); i.r(2, 24, 12, 2, W.d);
}
F.PC_FRONT_ON_1 = () => sprite(16, 32, (i) => { slate(i, true, 0); i.r(3, 27, 4, 2, PARCH.m); i.r(11, 27, 2, 3, "#2a2a30"); i.r(12, 24, 1, 4, "#f3e6bd"); });
F.PC_FRONT_ON_2 = () => sprite(16, 32, (i) => { slate(i, true, 1); i.r(3, 27, 4, 2, PARCH.m); i.r(11, 27, 2, 3, "#2a2a30"); i.r(12, 24, 1, 4, "#f3e6bd"); });
F.PC_FRONT_ON_3 = () => sprite(16, 32, (i) => { slate(i, true, 2); i.r(3, 27, 4, 2, PARCH.m); i.r(11, 27, 2, 3, "#2a2a30"); i.r(12, 24, 1, 4, "#f3e6bd"); });
F.PC_FRONT_OFF = () => sprite(16, 32, (i) => { slate(i, false, 0); i.r(3, 27, 4, 2, PARCH.m); i.r(11, 27, 2, 3, "#2a2a30"); i.r(12, 24, 1, 4, "#f3e6bd"); });
F.PC_BACK = () => sprite(16, 32, (i) => { i.box(1, 3, 14, 17, W.m, { hi: W.l }); i.r(3, 8, 10, 1, W.d); i.r(3, 14, 10, 1, W.d); i.r(7, 3, 2, 17, W.d); i.r(5, 20, 6, 3, W.d); i.r(3, 22, 10, 2, W.m); i.r(2, 24, 12, 2, W.d); });
F.PC_SIDE = () => sprite(16, 32, (i) => { i.box(5, 3, 5, 17, IRON.m, { hi: IRON.l }); i.r(4, 5, 2, 13, "#1b1a1f"); i.r(6, 20, 3, 3, W.d); i.r(4, 22, 8, 2, W.m); i.r(3, 24, 10, 2, W.d); });
function herb(i, a, b) {
  i.box(3, 22, 10, 9, CLAY.m, { hi: CLAY.l, lo: CLAY.d }); i.r(3, 22, 10, 2, CLAY.d);
  for (const [x, y, w, h] of a) { i.r(x, y, w, h, GREEN.m); i.r(x, y, 1, h, GREEN.l); }
  for (const [x, y] of b) { i.r(x, y, 2, 2, "#f0d040"); i.p(x, y, "#ffffff"); }
}
F.PLANT = () => sprite(16, 32, (i) => herb(i, [[2, 12, 3, 10], [6, 6, 4, 16], [11, 11, 3, 11], [4, 16, 2, 6], [9, 15, 2, 7]], [[7, 4], [2, 10], [12, 9]]));
F.PLANT_2 = () => sprite(16, 32, (i) => herb(i, [[1, 14, 4, 8], [4, 8, 3, 14], [8, 4, 3, 18], [11, 10, 3, 12]], [[9, 2]]));
F.POT = () => sprite(16, 16, (i) => { i.box(3, 4, 10, 11, CLAY.m, { hi: CLAY.l, lo: CLAY.d }); i.r(2, 3, 12, 3, CLAY.d); i.r(3, 3, 10, 1, CLAY.l); });
F.SMALL_PAINTING = () => sprite(16, 32, (i) => { // red pennant
  i.r(2, 2, 12, 1, W.m); i.p(1, 2, W.d); i.p(14, 2, W.d);
  i.r(3, 3, 10, 22, RED.m); i.r(3, 3, 10, 1, RED.d);
  i.r(7, 8, 2, 8, GOLD); i.r(5, 11, 6, 2, GOLD);
  i.r(3, 25, 5, 3, RED.m); i.r(8, 25, 5, 3, RED.m); i.r(5, 28, 1, 1, RED.d); i.r(10, 28, 1, 1, RED.d);
});
F.SMALL_PAINTING_2 = () => sprite(16, 32, (i) => { // blue pennant
  i.r(2, 2, 12, 1, W.m); i.p(1, 2, W.d); i.p(14, 2, W.d);
  i.r(3, 3, 10, 22, BLUE.m); i.r(3, 3, 10, 1, BLUE.d);
  i.ellipse(8, 12, 3, 3, "#f3e6bd"); i.ellipse(8, 12, 1, 1, BLUE.m);
  i.r(3, 25, 5, 3, BLUE.m); i.r(8, 25, 5, 3, BLUE.m);
});
F.SMALL_TABLE_FRONT = () => sprite(32, 32, (i) => {
  deskTop(i, 32, 20);
  i.r(0, 20, 32, 4, OUT); i.r(1, 20, 30, 3, W.m); i.r(1, 20, 30, 1, W.l);
  i.r(2, 23, 4, 9, W.d); i.r(26, 23, 4, 9, W.d);
});
F.SMALL_TABLE_SIDE = () => sprite(16, 48, (i) => { deskTop(i, 16, 42); i.r(0, 42, 16, 4, OUT); i.r(1, 42, 14, 3, W.m); i.r(2, 45, 4, 3, W.d); i.r(10, 45, 4, 3, W.d); });
function benchFront(i) {
  i.box(0, 0, 32, 7, W.m, { hi: W.l }); i.r(2, 2, 28, 3, W.d);
  i.box(1, 6, 30, 6, RED.m, { hi: RED.l, lo: RED.d });
  i.r(2, 12, 3, 4, W.d); i.r(27, 12, 3, 4, W.d);
}
F.SOFA_FRONT = () => sprite(32, 16, (i) => benchFront(i));
F.SOFA_BACK = () => sprite(32, 16, (i) => { i.box(0, 0, 32, 13, W.m, { hi: W.l }); for (let x = 4; x < 30; x += 5) i.r(x, 2, 1, 10, W.d); i.r(2, 13, 3, 3, W.d); i.r(27, 13, 3, 3, W.d); });
F.SOFA_SIDE = () => sprite(16, 32, (i) => { i.box(0, 1, 5, 28, W.m, { hi: W.l }); i.box(4, 3, 11, 24, RED.m, { hi: RED.l }); i.r(1, 29, 3, 3, W.d); i.r(11, 27, 3, 4, W.d); });
F.WHITEBOARD = () => sprite(32, 32, (i) => { // parchment map
  i.box(1, 4, 30, 24, W.m, { hi: W.l });
  i.r(3, 6, 26, 20, PARCH.m); i.r(3, 6, 26, 1, PARCH.l); i.r(3, 25, 26, 1, PARCH.d);
  i.r(6, 10, 8, 5, GREEN.m); i.r(18, 12, 8, 6, GREEN.m); i.r(10, 18, 6, 4, GREEN.l); i.r(15, 9, 3, 12, "#6fb0e0");
  for (let k = 0; k < 8; k++) i.p(8 + k * 2, 21 - (k % 3), RED.m); i.r(23, 20, 3, 1, RED.m); i.r(24, 19, 1, 3, RED.m);
  i.r(0, 3, 32, 2, W.d); i.r(0, 27, 32, 2, W.d);
});
F.WOODEN_BENCH = () => sprite(16, 16, (i) => { i.box(1, 3, 14, 6, W.m, { hi: W.l }); i.r(2, 9, 3, 6, W.d); i.r(11, 9, 3, 6, W.d); i.r(1, 12, 14, 1, W.d); });
F.WOODEN_CHAIR_FRONT = () => sprite(16, 32, (i) => {
  i.r(3, 1, 10, 1, OUT); for (const x of [3, 7, 11]) i.r(x, 2, 2, 12, W.m); i.r(3, 3, 10, 1, W.l); i.r(3, 7, 10, 2, W.l); i.r(3, 13, 10, 1, OUT);
  i.box(2, 14, 12, 5, W.l, { hi: W.h }); i.r(3, 19, 2, 11, W.d); i.r(11, 19, 2, 11, W.d); i.r(3, 29, 3, 2, OUT); i.r(10, 29, 3, 2, OUT);
});
F.WOODEN_CHAIR_BACK = () => sprite(16, 32, (i) => {
  i.box(3, 2, 10, 17, W.m, { hi: W.l }); for (let y = 5; y < 17; y += 4) i.r(4, y, 8, 1, W.d); i.r(7, 3, 2, 15, W.d);
  i.r(3, 19, 2, 11, W.d); i.r(11, 19, 2, 11, W.d); i.r(3, 29, 3, 2, OUT); i.r(10, 29, 3, 2, OUT);
});
F.WOODEN_CHAIR_SIDE = () => sprite(16, 32, (i) => {
  i.r(3, 1, 3, 18, OUT); i.r(4, 2, 1, 16, W.m); i.r(3, 5, 3, 1, W.l); i.r(3, 9, 3, 1, W.l);
  i.box(3, 14, 11, 5, W.l, { hi: W.h }); i.r(3, 19, 2, 11, W.d); i.r(11, 19, 2, 11, W.d); i.r(3, 29, 3, 2, OUT); i.r(10, 29, 3, 2, OUT);
});

// ---------------------------------------------------------------------------- characters: tunics instead of office clothes

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const TUNICS = [[2, 0.62], [128, 0.4], [275, 0.38], [38, 0.7], [205, 0.5], [335, 0.45]]; // hue, saturation per character
function medievalChar(src, idx) {
  const out = new Img(src.w, src.h);
  const [th, ts] = TUNICS[idx % TUNICS.length];
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const [r, g, b, a] = src.get(x, y);
      if (!a) continue;
      const fy = y % 32; // row inside the 16x32 frame
      const [h, s, l] = hsl(r, g, b);
      let px = [r, g, b];
      const skin = h > 8 && h < 42 && s > 0.2 && s < 0.8 && l > 0.3;
      if (fy >= 13 && !skin) {
        if (l < 0.16) px = fromHsl(28, 0.4, l * 1.25 + 0.05); // trousers and boots → leather brown
        else if (s < 0.25) px = fromHsl(th, ts * 0.55, Math.min(0.78, l * 0.92)); // white shirts → tinted linen tunic
        else px = fromHsl(th, ts, Math.min(0.62, l * 1.02)); // coloured clothes → tunic
      }
      out.p(x, y, [...px, a]);
    }
  // a leather belt across the waist on front/back rows (first two rows of the sheet) and sides
  for (let row = 0; row < 3; row++)
    for (let f = 0; f < 7; f++) {
      const y0 = row * 32 + 21, x0 = f * 16;
      const xs = [];
      for (let x = 0; x < 16; x++) if (out.get(x0 + x, y0)[3] && !(hsl(...out.get(x0 + x, y0).slice(0, 3))[0] > 8 && hsl(...out.get(x0 + x, y0).slice(0, 3))[0] < 42 && hsl(...out.get(x0 + x, y0).slice(0, 3))[1] > 0.2)) xs.push(x);
      for (const x of xs) out.p(x0 + x, y0, "#5a3a22");
    }
  return out;
}

// ---------------------------------------------------------------------------- write everything

const write = (rel, img) => {
  const f = join(DEST, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, encodePng(img));
};
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const catalog = readJson(join(SRC, "furniture-catalog.json"));

// floors and walls
for (let k = 0; k < 9; k++) write(`floors/floor_${k}.png`, floor(k));
write("walls/wall_0.png", wallFrom(decodePng(readFileSync(join(SRC, "walls/wall_0.png")))));
for (let k = 0; k < 3; k++) copyAs(`carpets/carpet_${k}.png`);
function copyAs(rel) { mkdirSync(dirname(join(DEST, rel)), { recursive: true }); copyFileSync(join(SRC, rel), join(DEST, rel)); }

// characters
for (let k = 0; k < 6; k++) write(`characters/char_${k}.png`, medievalChar(decodePng(readFileSync(join(SRC, `characters/char_${k}.png`))), k));

// furniture: same ids and sizes, plus two new pieces
const entries = [...catalog];
const extra = (id, name, category, w, h, fw, fh, wall = false) => ({ id, name, label: name, category, file: `${id}.png`, furniturePath: `furniture/${id}/${id}.png`, width: w, height: h, footprintW: fw, footprintH: fh, isDesk: false, canPlaceOnWalls: wall, canPlaceOnSurfaces: false, backgroundTiles: 0, groupId: id });
entries.push(extra("BARREL", "Barrel", "misc", 16, 16, 1, 1), { ...extra("FIREPLACE", "Fireplace", "wall", 32, 32, 2, 2, true), backgroundTiles: 1 });
for (const e of entries) {
  const draw = F[e.id];
  if (!draw) { console.warn("no medieval art for", e.id); continue; }
  const img = draw();
  if (img.w !== e.width || img.h !== e.height) throw new Error(`${e.id}: made ${img.w}x${img.h}, catalog says ${e.width}x${e.height}`);
  write(e.furniturePath, img);
}
writeFileSync(join(DEST, "furniture-catalog.json"), JSON.stringify(entries, null, 2));

// index and layout
const index = readJson(join(SRC, "asset-index.json"));
index.defaultLayout = "default-layout-medieval.json";
writeFileSync(join(DEST, "asset-index.json"), JSON.stringify(index, null, 2));
const layout = readJson(join(SRC, "default-layout-1.json"));
const tint = {
  wall: { h: 28, s: 18, b: -24, c: 5 },
  oak: { h: 27, s: 52, b: -24, c: -28 },
  stone: { h: 30, s: 6, b: -16, c: -12 },
  rug: { h: 4, s: 58, b: -26, c: -14 },
};
layout.tileColors = layout.tiles.map((t) => (t === 255 ? null : t === 0 ? { ...tint.wall } : t === 7 ? { ...tint.oak } : t === 1 ? { ...tint.rug, h: 8, s: 50 } : t === 9 ? { ...tint.stone } : { ...tint.stone }));
layout.furniture = layout.furniture.map((f) => (f.type === "LARGE_PAINTING" ? { ...f, type: "FIREPLACE" } : f.type === "BIN" ? { ...f, type: "BARREL" } : f));
layout.furniture.push({ uid: "f-barrel-2", type: "BARREL", col: 19, row: 20 });
writeFileSync(join(DEST, "default-layout-medieval.json"), JSON.stringify(layout));
console.log("Medieval art written to", DEST);
