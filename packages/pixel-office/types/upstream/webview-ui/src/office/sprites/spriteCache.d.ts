import type { SpriteData } from '../types';
/** Generate a 1px white outline SpriteData (2px larger in each dimension) */
export declare function getOutlineSprite(sprite: SpriteData): SpriteData;
export declare function getCachedSprite(sprite: SpriteData, zoom: number): HTMLCanvasElement;
