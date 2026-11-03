/**
 * Palette diversity utilities for agent character assignment.
 *
 * Pure functions with no DOM/sprite dependencies — safe for use in both
 * browser (webview) and Node.js (server) environments.
 */
export interface PalettePick {
    palette: number;
    hueShift: number;
}
/**
 * Pick a diverse palette based on current palette distribution.
 * First N agents each get a unique skin (where N = paletteCount).
 * Beyond N, skins repeat in balanced rounds with a random hue shift (≥45°).
 *
 * @param paletteCount - Total number of available palettes (e.g., 6)
 * @param paletteCounts - Array of counts per palette (length must equal paletteCount)
 * @returns Selected palette index and hue shift in degrees
 */
export declare function pickDiversePalette(paletteCount: number, paletteCounts: number[]): PalettePick;
