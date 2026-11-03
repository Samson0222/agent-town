/**
 * Make sure the office has a desk for everyone (Agent Town code, not upstream).
 *
 * A "work seat" is a chair seat that faces a work desk (not the lounge coffee table).
 * If a team has more agents than work seats, the layout grows downward: interior
 * rows are duplicated (so walls and floors stay consistent in every room) and
 * desk "pods" are added in the free space — the same 3×3 pod the default layout
 * uses: DESK_FRONT (3×2) + PC on the desk + CUSHIONED_BENCH facing it.
 */
import { getCatalogEntry } from "../upstream/webview-ui/src/office/layout/furnitureCatalog";
import { layoutToSeats } from "../upstream/webview-ui/src/office/layout/layoutSerializer";
import { Direction, TileType, type OfficeLayout, type PlacedFurniture } from "../upstream/webview-ui/src/office/types";

const LOUNGE_TABLES = new Set(["COFFEE_TABLE"]);
const POD_W = 4; // 3 desk tiles + 1 gap
const POD_H = 3; // desk (2 rows) + bench row

function deskTiles(furniture: PlacedFurniture[]): Set<string> {
  const tiles = new Set<string>();
  for (const item of furniture) {
    const e = getCatalogEntry(item.type);
    if (!e?.isDesk || LOUNGE_TABLES.has(item.type.split(":")[0]!)) continue;
    for (let r = 0; r < e.footprintH; r++) for (let c = 0; c < e.footprintW; c++) tiles.add(`${item.col + c},${item.row + r}`);
  }
  return tiles;
}

const FACING: Record<number, [number, number]> = {
  [Direction.UP]: [0, -1],
  [Direction.DOWN]: [0, 1],
  [Direction.LEFT]: [-1, 0],
  [Direction.RIGHT]: [1, 0],
};

/** Seat ids that face a work desk, in a stable order (top-left first). */
export function workSeatIds(layout: OfficeLayout): string[] {
  const desks = deskTiles(layout.furniture);
  const seats = [...layoutToSeats(layout.furniture).entries()];
  return seats
    .filter(([, s]) => {
      const [dc, dr] = FACING[s.facingDir] ?? [0, 0];
      for (let d = 1; d <= 2; d++) if (desks.has(`${s.seatCol + dc * d},${s.seatRow + dr * d}`)) return true;
      return false;
    })
    .sort(([, a], [, b]) => a.seatRow - b.seatRow || a.seatCol - b.seatCol)
    .map(([id]) => id);
}

/** Return a layout with at least `needed` work seats (the input is not modified). */
export function ensureWorkSeats(layout: OfficeLayout, needed: number): OfficeLayout {
  let out = layout;
  for (let guard = 0; guard < 20 && workSeatIds(out).length < needed; guard++) out = addPodRow(out);
  return out;
}

/** Grow the layout by one pod row (POD_H tiles) and fill it with pods where the floor allows. */
function addPodRow(layout: OfficeLayout): OfficeLayout {
  const { cols, rows } = layout;
  const tiles = layout.tiles;
  // Find the last row that has floor (interior) tiles; insert copies of it right after.
  let src = -1;
  for (let r = rows - 1; r >= 0 && src < 0; r--) {
    for (let c = 0; c < cols; c++) if (isFloor(tiles[r * cols + c]!)) { src = r; break; }
  }
  if (src < 0) return layout;
  const insertAt = src + 1;
  // Every per-tile array (tiles, tileColors, carpetTiles, areaTiles) grows the same way.
  const grow = <T,>(arr: T[] | undefined, fill: T): T[] | undefined => {
    if (!arr) return arr;
    const out: T[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) out.push(arr[r * cols + c] ?? fill);
      if (r === src) for (let k = 0; k < POD_H; k++) for (let c = 0; c < cols; c++) out.push(arr[src * cols + c] ?? fill);
    }
    return out;
  };
  // Furniture at/after the inserted rows moves down so it stays against the bottom wall.
  const shifted = layout.furniture.map((f) => (f.row >= insertAt ? { ...f, row: f.row + POD_H } : f));

  // Place pods into the new band, inside each run of floor columns (each room).
  const band = insertAt;
  const pods: PlacedFurniture[] = [];
  let runStart = -1;
  const flush = (end: number) => {
    for (let c = runStart + 1; c + 3 <= end; c += POD_W) {
      const id = `at-pod-${band}-${c}-${Math.random().toString(36).slice(2, 6)}`;
      pods.push({ uid: `${id}-d`, type: "DESK_FRONT", col: c, row: band } as PlacedFurniture);
      pods.push({ uid: `${id}-pc`, type: "PC_FRONT_OFF", col: c + 1, row: band } as PlacedFurniture);
      pods.push({ uid: `${id}-s`, type: "CUSHIONED_BENCH", col: c + 1, row: band + 2 } as PlacedFurniture);
    }
  };
  // Only the *work* room gets pods: the room that already contains work desks.
  const WORK_DESKS = /^(DESK_FRONT|DESK_SIDE|TABLE_FRONT)/;
  const workCols = new Set([...deskTiles(layout.furniture.filter((f) => WORK_DESKS.test(f.type)))].map((k) => Number(k.split(",")[0])));
  for (let c = 0; c <= cols; c++) {
    const floor = c < cols && isFloor(tiles[src * cols + c]!);
    if (floor && runStart < 0) runStart = c - 1;
    if (!floor && runStart >= 0) {
      const inWorkRoom = [...workCols].some((wc) => wc > runStart && wc < c);
      if (inWorkRoom) flush(c);
      runStart = -1;
    }
  }
  if (pods.length === 0) return layout; // no room to grow sensibly
  return {
    ...layout,
    rows: rows + POD_H,
    tiles: grow(layout.tiles, TileType.VOID)!,
    tileColors: grow(layout.tileColors, null),
    // Carpets/areas are not copied into the new band (it is plain office floor).
    carpetTiles: layout.carpetTiles ? growBlank(layout.carpetTiles, rows, cols, src, null) : undefined,
    areaTiles: layout.areaTiles ? growBlank(layout.areaTiles, rows, cols, src, null) : undefined,
    furniture: [...shifted, ...pods],
  };
}

function isFloor(t: number): boolean {
  return t !== TileType.VOID && t !== TileType.WALL;
}

function growBlank<T>(arr: T[], rows: number, cols: number, src: number, blank: T): T[] {
  const out: T[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push(arr[r * cols + c] ?? blank);
    if (r === src) for (let k = 0; k < POD_H * cols; k++) out.push(blank);
  }
  return out;
}
