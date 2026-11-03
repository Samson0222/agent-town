/**
 * Generates asset-index.json and furniture-catalog.json for the pixel office,
 * using the upstream pixel-agents build helpers (unchanged). Run after changing
 * apps/web/public/pixel-office/assets:  npm run build:assets -w @agent-town/pixel-office
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssetIndex, buildFurnitureCatalog } from "../upstream/core/src/assets/build.ts";

const assets = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/public/pixel-office/assets");
const index = buildAssetIndex(assets);
const catalog = buildFurnitureCatalog(assets);
writeFileSync(join(assets, "asset-index.json"), JSON.stringify(index, null, 2));
writeFileSync(join(assets, "furniture-catalog.json"), JSON.stringify(catalog, null, 2));
console.log(`asset-index: ${index.characters.length} characters, ${index.floors.length} floors, ${index.walls.length} walls, layout ${index.defaultLayout}`);
console.log(`furniture-catalog: ${catalog.length} items`);
