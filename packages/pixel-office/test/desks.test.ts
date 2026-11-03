import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDynamicCatalog } from "../upstream/webview-ui/src/office/layout/furnitureCatalog";
import { migrateLayoutColors } from "../upstream/webview-ui/src/office/layout/layoutSerializer";
import { ensureWorkSeats, workSeatIds } from "../src/desks";

const assets = resolve(__dirname, "../../../apps/web/public/pixel-office/assets");
const catalog = JSON.parse(readFileSync(`${assets}/furniture-catalog.json`, "utf8"));
const sprites = Object.fromEntries(catalog.map((e: { id: string }) => [e.id, [["#000000"]]]));
buildDynamicCatalog({ catalog, sprites } as never);
const layout = migrateLayoutColors(JSON.parse(readFileSync(`${assets}/default-layout-1.json`, "utf8")));

describe("desk seats", () => {
  it("counts work seats in the default office (desks, not the sofa)", () => {
    expect(workSeatIds(layout).length).toBeGreaterThanOrEqual(5);
  });

  it("adds desks so a big team all get a work seat", () => {
    const base = workSeatIds(layout).length;
    const grown = ensureWorkSeats(layout, base + 5);
    expect(workSeatIds(grown).length).toBeGreaterThanOrEqual(base + 5);
    expect(grown.rows).toBeGreaterThan(layout.rows);
    for (const key of ["tiles", "tileColors"] as const) expect(grown[key]!.length).toBe(grown.rows * grown.cols);
    // original layout untouched
    expect(workSeatIds(layout).length).toBe(base);
  });

  it("does nothing when there are already enough seats", () => {
    expect(ensureWorkSeats(layout, 1)).toBe(layout);
  });
});
