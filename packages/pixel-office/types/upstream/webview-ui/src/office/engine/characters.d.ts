import type { CharacterSprites } from '../sprites/spriteData';
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from '../types';
/** Whether a tool should show the reading animation (vs typing). Taxonomy comes
 *  from the active HookProvider via the `providerCapabilities` message. */
export declare function isReadingTool(tool: string | null): boolean;
export declare function createCharacter(id: number, palette: number, seatId: string | null, seat: Seat | null, hueShift?: number): Character;
export declare function updateCharacter(ch: Character, dt: number, walkableTiles: Array<{
    col: number;
    row: number;
}>, seats: Map<string, Seat>, tileMap: TileTypeVal[][], blockedTiles: Set<string>): void;
/** Get the correct sprite frame for a character's current state and direction */
export declare function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData;
