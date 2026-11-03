import type { Character, SpriteData } from '../types';
/**
 * Render a character with a Matrix-style digital rain spawn/despawn effect.
 * Per-pixel rendering: each column sweeps top-to-bottom with a bright head and fading green trail.
 */
export declare function renderMatrixEffect(ctx: CanvasRenderingContext2D, ch: Character, spriteData: SpriteData, drawX: number, drawY: number, zoom: number): void;
