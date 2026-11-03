/**
 * Floor tile pattern storage and caching.
 *
 * Stores grayscale floor patterns loaded from individual PNGs in assets/floors/.
 * Uses shared colorize module for HSL tinting (Photoshop-style Colorize).
 * Caches colorized SpriteData by (pattern, h, s, b, c) key.
 */
import type { ColorValue } from '../components/ui/types';
import type { SpriteData } from './types';
export { WALL_COLOR } from '../constants';
/** Set floor tile sprites (called once when extension sends floorTilesLoaded) */
export declare function setFloorSprites(sprites: SpriteData[]): void;
/** Check if floor sprites are available (always true — falls back to default solid tile) */
export declare function hasFloorSprites(): boolean;
/** Get count of available floor patterns (at least 1 for the default solid tile) */
export declare function getFloorPatternCount(): number;
/** Get all floor sprites (for preview rendering, falls back to default solid tile) - unused */
/**
 * Get a colorized version of a floor sprite.
 * Uses Photoshop-style Colorize: grayscale -> HSL with given hue/saturation,
 * then brightness/contrast adjustment.
 */
export declare function getColorizedFloorSprite(patternIndex: number, color: ColorValue): SpriteData;
