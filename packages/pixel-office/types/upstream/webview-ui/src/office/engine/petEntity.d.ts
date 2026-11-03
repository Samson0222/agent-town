import type { PetSpriteFrames } from '../sprites/petSpriteData';
import type { Character, Pet, SpriteData, TileType as TileTypeVal } from '../types';
/** Build a fresh pet at a tile with the IDLE FSM entry point. */
export declare function createPet(id: string, petType: number, col: number, row: number): Pet;
/**
 * Tick the pet's FSM by `dt` seconds. Mutates `pet` in place.
 * `walkableTiles`/`characters`/`tileMap`/`blockedTiles` are read-only inputs.
 */
export declare function updatePet(pet: Pet, dt: number, walkableTiles: Array<{
    col: number;
    row: number;
}>, characters: Map<number, Character>, tileMap: TileTypeVal[][], blockedTiles: Set<string>): void;
/**
 * Resolve the sprite for the pet's current state + direction + frame.
 * Returns null when sprites haven't loaded yet — renderer guards.
 */
export declare function getPetSpriteData(pet: Pet, petSprites: PetSpriteFrames | null): SpriteData | null;
