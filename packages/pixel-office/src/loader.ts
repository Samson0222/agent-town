/**
 * Browser asset loader for the pixel office.
 *
 * Adapted from pixel-agents' `webview-ui/src/browserMock.ts` (MIT,
 * pixel-agents-hq/pixel-agents @ b1bafd0): fetch the PNG art, decode it in the
 * browser into the sprite format the engine expects, and install it with the
 * engine's own setters, instead of dispatching VS Code webview messages.
 */
import { rgbaToHex } from "../upstream/core/src/assets/colorUtils";
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  CHARACTER_DIRECTIONS,
  FLOOR_TILE_SIZE,
  WALL_BITMASK_COUNT,
  WALL_GRID_COLS,
  WALL_PIECE_HEIGHT,
  WALL_PIECE_WIDTH,
} from "../upstream/core/src/assets/constants";
import type { AssetIndex, CatalogEntry, CharacterDirectionSprites } from "../upstream/core/src/assets/types";
import { setFloorSprites } from "../upstream/webview-ui/src/office/floorTiles";
import { buildDynamicCatalog } from "../upstream/webview-ui/src/office/layout/furnitureCatalog";
import { migrateLayoutColors } from "../upstream/webview-ui/src/office/layout/layoutSerializer";
import { setCharacterTemplates } from "../upstream/webview-ui/src/office/sprites/spriteData";
import type { OfficeLayout } from "../upstream/webview-ui/src/office/types";
import { setWallSprites } from "../upstream/webview-ui/src/office/wallTiles";

interface DecodedPng {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function readSprite(png: DecodedPng, width: number, height: number, offsetX = 0, offsetY = 0): string[][] {
  const sprite: string[][] = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      const i = ((offsetY + y) * png.width + (offsetX + x)) * 4;
      row.push(rgbaToHex(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!));
    }
    sprite.push(row);
  }
  return sprite;
}

async function decodePng(url: string): Promise<DecodedPng> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d canvas context for PNG decode");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

const indexed = (kind: "characters" | "floors" | "walls", rel: string) => (rel.startsWith(`${kind}/`) ? rel : `${kind}/${rel}`);

export interface LoadedOffice {
  layout: OfficeLayout | null;
  characterCount: number;
}

interface Decoded {
  characters: CharacterDirectionSprites[];
  floors: string[][][];
  walls: string[][][][];
  catalog: CatalogEntry[];
  furniture: Record<string, string[][]>;
  layout: OfficeLayout | null;
}

/** Decoded art per art set (modern, medieval...), fetched once. */
const decoded = new Map<string, Promise<Decoded>>();

async function decode(base: string): Promise<Decoded> {
  const [index, catalog] = await Promise.all([
    fetch(`${base}assets/asset-index.json`).then((r) => r.json()) as Promise<AssetIndex>,
    fetch(`${base}assets/furniture-catalog.json`).then((r) => r.json()) as Promise<CatalogEntry[]>,
  ]);

  const characters: CharacterDirectionSprites[] = await Promise.all(
    index.characters.map(async (rel) => {
      const png = await decodePng(`${base}assets/${indexed("characters", rel)}`);
      const byDir: CharacterDirectionSprites = { down: [], up: [], right: [] };
      CHARACTER_DIRECTIONS.forEach((dir, d) => {
        const frames: string[][][] = [];
        for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) frames.push(readSprite(png, CHAR_FRAME_W, CHAR_FRAME_H, f * CHAR_FRAME_W, d * CHAR_FRAME_H));
        byDir[dir] = frames;
      });
      return byDir;
    }),
  );
  const floors = await Promise.all(
    index.floors.map(async (rel) => readSprite(await decodePng(`${base}assets/${indexed("floors", rel)}`), FLOOR_TILE_SIZE, FLOOR_TILE_SIZE)),
  );
  const walls = await Promise.all(
    index.walls.map(async (rel) => {
      const png = await decodePng(`${base}assets/${indexed("walls", rel)}`);
      const set: string[][][] = [];
      for (let m = 0; m < WALL_BITMASK_COUNT; m++) {
        set.push(readSprite(png, WALL_PIECE_WIDTH, WALL_PIECE_HEIGHT, (m % WALL_GRID_COLS) * WALL_PIECE_WIDTH, Math.floor(m / WALL_GRID_COLS) * WALL_PIECE_HEIGHT));
      }
      return set;
    }),
  );
  const furniture: Record<string, string[][]> = {};
  await Promise.all(
    catalog.map(async (e) => {
      furniture[e.id] = readSprite(await decodePng(`${base}assets/${e.furniturePath}`), e.width, e.height);
    }),
  );
  const raw = index.defaultLayout ? ((await fetch(`${base}assets/${index.defaultLayout}`).then((r) => r.json())) as OfficeLayout) : null;
  const layout = raw && raw.version === 1 ? migrateLayoutColors(raw) : null;
  return { characters, floors, walls, catalog, furniture, layout };
}

/**
 * Load and install an office art set. `base` is the URL folder that contains `assets/`.
 * Decoding happens once per set; installing happens every call, so the page can switch sets.
 */
export async function loadOfficeAssets(base = "/pixel-office/"): Promise<LoadedOffice> {
  let job = decoded.get(base);
  if (!job) {
    job = decode(base);
    decoded.set(base, job);
    job.catch(() => decoded.delete(base));
  }
  const d = await job;
  // Same install order as the upstream host: characters → floors → walls → furniture → layout.
  setCharacterTemplates(d.characters);
  setFloorSprites(d.floors);
  setWallSprites(d.walls);
  buildDynamicCatalog({ catalog: d.catalog, sprites: d.furniture } as Parameters<typeof buildDynamicCatalog>[0]);
  return { layout: d.layout, characterCount: d.characters.length };
}
