/**
 * Shared sprite colorization module.
 *
 * Two modes:
 * - Colorize (Photoshop-style): grayscale → fixed HSL. For floor tiles and opt-in furniture.
 * - Adjust (default for furniture): shift original pixel HSL values.
 */
import type { ColorValue } from '../components/ui/types';
import type { SpriteData } from './types';
/**
 * Get a color-adjusted sprite from cache, or compute and cache it.
 * Dispatches to colorize or adjust mode based on `color.colorize`.
 * Caller provides a unique cache key that must include the colorize flag.
 */
export declare function getColorizedSprite(cacheKey: string, sprite: SpriteData, color: ColorValue): SpriteData;
/** Clear all cached colorized sprites (e.g., on asset reload) */
export declare function clearColorizeCache(): void;
/**
 * Colorize a sprite using HSL transformation.
 *
 * Algorithm (Photoshop Colorize-style):
 * 1. Parse each pixel's color as perceived luminance (0-1)
 * 2. Apply contrast: stretch/compress around midpoint 0.5
 * 3. Apply brightness: shift lightness up/down
 * 4. Create HSL color with user's hue + saturation
 * 5. Convert HSL -> RGB -> hex
 */
export declare function colorizeSprite(sprite: SpriteData, color: ColorValue): SpriteData;
/**
 * Single-color fill: every non-empty pixel becomes the computed HSL color,
 * preserving the original per-pixel alpha. Used by the carpet renderer to
 * recolor a masked layer (main or accent) before merging.
 *
 * Unlike `colorizeSprite`, source pixel luminance is ignored; output lightness
 * is derived purely from `color.b` (brightness) and `color.c` (contrast around
 * the 0.5 midpoint). Caller controls hue + saturation via `color.h` and
 * `color.s`.
 */
export declare function flatColorizeSprite(sprite: SpriteData, color: ColorValue): SpriteData;
/**
 * Adjust a sprite's colors by shifting HSL values (default mode for furniture).
 *
 * H slider (-180 to +180): rotates hue
 * S slider (-100 to +100): shifts saturation
 * B slider (-100 to 100): shifts lightness
 * C slider (-100 to 100): adjusts contrast around midpoint
 */
export declare function adjustSprite(sprite: SpriteData, color: ColorValue): SpriteData;
