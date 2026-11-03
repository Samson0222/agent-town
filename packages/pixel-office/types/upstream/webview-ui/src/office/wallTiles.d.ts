/**
 * Wall tile auto-tiling: sprite storage and bitmask-based piece selection.
 *
 * Stores wall tile sets loaded from individual PNGs in assets/walls/.
 * Each set contains 16 wall sprites (one per 4-bit bitmask).
 * At render time, each wall tile's 4 cardinal neighbors are checked to build
 * a bitmask, and the corresponding sprite is drawn directly.
 * No changes to the layout model — auto-tiling is purely visual.
 *
 * Bitmask convention: N=1, E=2, S=4, W=8. Out-of-bounds = NOT wall.
 */
import type { ColorValue } from '../components/ui/types';
import type { FurnitureInstance, SpriteData, TileType as TileTypeVal } from './types';
/** Set wall tile sets (called once when extension sends wallTilesLoaded) */
export declare function setWallSprites(sets: SpriteData[][]): void;
/** Check if wall sprites have been loaded */
export declare function hasWallSprites(): boolean;
/** Get number of available wall sets */
export declare function getWallSetCount(): number;
/** Get the first sprite (bitmask 0, top-left piece) of a wall set for preview rendering */
export declare function getWallSetPreviewSprite(setIndex: number): SpriteData | null;
/**
 * Build FurnitureInstance-like objects for all wall tiles so they can participate
 * in z-sorting with furniture and characters.
 */
export declare function getWallInstances(tileMap: TileTypeVal[][], tileColors?: Array<ColorValue | null>, cols?: number): FurnitureInstance[];
/**
 * Compute the flat fill hex color for a wall tile with a given ColorValue.
 * Uses same Colorize algorithm as floor tiles: 50% gray → HSL.
 */
export declare function wallColorToHex(color: ColorValue): string;
