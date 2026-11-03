import { TileType } from '../types';
/** Check if a tile is walkable (floor, carpet, or doorway, and not blocked by furniture) */
export declare function isWalkable(col: number, row: number, tileMap: TileType[][], blockedTiles: Set<string>): boolean;
/** Get walkable tile positions (grid coords) for wandering */
export declare function getWalkableTiles(tileMap: TileType[][], blockedTiles: Set<string>): Array<{
    col: number;
    row: number;
}>;
/** BFS pathfinding on 4-connected grid (no diagonals). Returns path excluding start, including end. */
export declare function findPath(startCol: number, startRow: number, endCol: number, endRow: number, tileMap: TileType[][], blockedTiles: Set<string>): Array<{
    col: number;
    row: number;
}>;
