import type { CharacterPalette, SpriteFrame } from './types';
export declare const SPRITES: Record<string, SpriteFrame[]>;
export declare const SPRITES_F: Record<string, SpriteFrame[]>;
export declare const PALETTES: CharacterPalette[];
export declare function renderSprite(ctx: CanvasRenderingContext2D, frame: SpriteFrame, x: number, y: number, pixelSize: number, palette: CharacterPalette, flip?: boolean): void;
