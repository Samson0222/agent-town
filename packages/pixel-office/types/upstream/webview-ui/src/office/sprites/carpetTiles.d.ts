/**
 * Carpet sprite cache + dual-color colorization for marching-squares autotiling.
 *
 * Wire format: `setCarpetSprites(sets)` receives `sets[variant][msCase]` where
 * each entry is a 16×16 SpriteData. Marching-squares case is a 4-bit bitmask
 * over the four tiles surrounding a junction (NW=1, NE=2, SE=4, SW=8).
 *
 * Dual-color: each variant is classified once at registration time by sorting
 * unique source pixels by luminance — darkest → `mainRgb`, brightest →
 * `accentRgb`. At render time, the base sprite is masked into two layers,
 * each flat-colorized with the user's `color` / `accentColor`, then merged.
 */
import type { ColorValue } from '../../components/ui/types';
import type { CarpetTile, SpriteData } from '../types';
/**
 * Register carpet sprite sheets. Invalidates the dual-color cache.
 *
 * @param sets `sets[variant][msCase]` — 16×16 SpriteData per marching-squares case.
 *             Expected 16 msCase entries per variant; missing entries are tolerated
 *             via tileHasVariant() and getCarpetJunctionSprite() guards.
 */
export declare function setCarpetSprites(sets: SpriteData[][]): void;
export declare function hasCarpetSprites(): boolean;
export declare function getCarpetSetCount(): number;
/** Return the raw sprite sheet for a variant (or undefined). Used by editor previews.
 *
 * @public
 */
export declare function getCarpetVariantSprites(variant: number): SpriteData[] | undefined;
/** Stable key for a single ColorValue used in cache and palette keys. */
export declare function getCarpetColorKey(color: ColorValue): string;
/** Composite key for the (main, accent) color pair used to invalidate the cache. */
export declare function getCarpetPaletteKey(color: ColorValue, accentColor: ColorValue): string;
/**
 * Resolve and return the merged, colorized SpriteData for a single junction.
 *
 * @param jx Junction column (0..cols). Junctions sit at corners.
 * @param jy Junction row (0..rows).
 * @returns null if the variant is unloaded, the junction's msCase is missing,
 *          or the variant's palette classification yielded no main color.
 */
export declare function getCarpetJunctionSprite(jx: number, jy: number, variant: number, carpetTiles: Array<CarpetTile | null>, cols: number, rows: number, color?: ColorValue, accentColor?: ColorValue, paletteKey?: string): SpriteData | null;
/**
 * Compute the 4-bit marching-squares case for a junction at `(jx, jy)` from the
 * four tiles around it: NW=1, NE=2, SE=4, SW=8. Shared by the renderer
 * (`getCarpetJunctionSprite`) and the e2e observability hook so a test asserts
 * the real autotiling logic, not a copy. When `paletteKey` is omitted the
 * neighbor check ignores per-tile colors (matches any carpet of `variant`).
 */
export declare function carpetJunctionCase(jx: number, jy: number, variant: number, carpetTiles: Array<CarpetTile | null>, cols: number, rows: number, paletteKey?: string): number;
