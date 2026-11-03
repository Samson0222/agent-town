import type { SpriteData } from '../types';
/**
 * Resolved per-pet sprite frames. Each entry is a 3-frame animation array.
 * `walkLeft` / `idleRight` / `idleLeft` are derived in setPetTemplates from
 * the broadcast fields.
 */
export interface PetSpriteFrames {
    walkDown: [SpriteData, SpriteData, SpriteData];
    idleDown: [SpriteData, SpriteData, SpriteData];
    walkUp: [SpriteData, SpriteData, SpriteData];
    idleUp: [SpriteData, SpriteData, SpriteData];
    walkRight: [SpriteData, SpriteData, SpriteData];
    walkLeft: [SpriteData, SpriteData, SpriteData];
    idleRight: [SpriteData, SpriteData, SpriteData];
    idleLeft: [SpriteData, SpriteData, SpriteData];
}
/**
 * Receive raw frame arrays + parallel display names from the server message.
 * Skips entries with fewer than 3 frames in any of the required directions.
 */
export declare function setPetTemplates(data: Array<{
    walkDown: string[][][];
    idleDown: string[][][];
    walkUp: string[][][];
    idleUp: string[][][];
    walkRight: string[][][];
}>, petNames?: string[]): void;
/** Returns the resolved frames for a petType, or null if not loaded or out of range. */
export declare function getPetSprites(petIndex: number): PetSpriteFrames | null;
/** Number of pets currently loaded. */
export declare function getPetCount(): number;
/** Display name for a petType. Falls back to "Pet N" when manifest missing. */
export declare function getPetName(petIndex: number): string;
