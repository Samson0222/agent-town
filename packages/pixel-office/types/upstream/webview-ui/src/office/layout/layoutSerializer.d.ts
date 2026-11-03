import type { FurnitureInstance, OfficeLayout, PlacedFurniture, Seat, TileType as TileTypeVal } from '../types';
/** Convert flat tile array from layout into 2D grid */
export declare function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][];
/** Convert placed furniture into renderable FurnitureInstance[] */
export declare function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[];
/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export declare function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string>;
/**
 * Get tiles blocked for placement purposes — skips top backgroundTiles rows per item.
 * `excluded` uids don't block (a desk moving together with the items on its
 * surface excludes the whole group, so the group's own tiles never block the move).
 */
export declare function getPlacementBlockedTiles(furniture: PlacedFurniture[], excluded?: ReadonlySet<string>): Set<string>;
/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export declare function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat>;
/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles)
 * @internal */
export declare function getSeatTiles(seats: Map<string, Seat>): Set<string>;
/** Create a minimal fallback layout (used only when no default-layout.json exists) */
export declare function createDefaultLayout(): OfficeLayout;
/** Serialize layout to JSON string
 * @internal */
export declare function serializeLayout(layout: OfficeLayout): string;
/** Deserialize layout from JSON string, migrating old tile types if needed
 * @internal */
export declare function deserializeLayout(json: string): OfficeLayout | null;
/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export declare function migrateLayoutColors(layout: OfficeLayout): OfficeLayout;
