import type { Direction, SpriteData } from '../types';
/** Permission bubble: white square with "..." in amber, and a tail pointer (11x13) */
export declare const BUBBLE_PERMISSION_SPRITE: SpriteData;
/** Waiting bubble: white square with green checkmark, and a tail pointer (11x13) */
export declare const BUBBLE_WAITING_SPRITE: SpriteData;
/** Heart bubble: pet petting feedback (11x13) */
export declare const BUBBLE_HEART_SPRITE: SpriteData;
interface LoadedCharacterData {
    down: SpriteData[];
    up: SpriteData[];
    right: SpriteData[];
}
/** Set pre-colored character sprites loaded from PNG assets. Call this when characterSpritesLoaded message arrives. */
export declare function setCharacterTemplates(data: LoadedCharacterData[]): void;
/** Return the number of loaded character palettes, or PALETTE_COUNT as fallback. */
export declare function getLoadedCharacterCount(): number;
export interface CharacterSprites {
    walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>;
    typing: Record<Direction, [SpriteData, SpriteData]>;
    reading: Record<Direction, [SpriteData, SpriteData]>;
}
export declare function getCharacterSprites(paletteIndex: number, hueShift?: number): CharacterSprites;
export {};
