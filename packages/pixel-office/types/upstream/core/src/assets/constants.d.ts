/**
 * Shared constants — used by the extension host, Vite build scripts,
 * and future standalone backend.
 *
 * No VS Code dependency. Only asset parsing and layout-related values.
 */
export declare const PNG_ALPHA_THRESHOLD = 2;
export declare const WALL_PIECE_WIDTH = 16;
export declare const WALL_PIECE_HEIGHT = 32;
export declare const WALL_GRID_COLS = 4;
export declare const WALL_BITMASK_COUNT = 16;
export declare const FLOOR_TILE_SIZE = 16;
export declare const CHARACTER_DIRECTIONS: readonly ["down", "up", "right"];
export declare const CHAR_FRAME_W = 16;
export declare const CHAR_FRAME_H = 32;
export declare const CHAR_FRAMES_PER_ROW = 7;
export declare const CHAR_COUNT = 6;
export declare const PET_FRAME_W_SMALL = 16;
export declare const PET_FRAME_H = 32;
export declare const PET_FRAME_W_LARGE = 32;
export declare const PET_IMAGE_WIDTH = 96;
export declare const PET_IMAGE_HEIGHT = 96;
export declare const PET_WALK_FRAMES_VERT = 3;
export declare const PET_IDLE_FRAMES_VERT = 3;
export declare const PET_WALK_FRAMES_HORIZ = 3;
export declare const MAX_PET_PNG_SIZE: number;
export declare const CARPET_TILE_SIZE = 16;
export declare const CARPET_GRID_COLS = 4;
export declare const CARPET_MARCHING_SQUARES_COUNT = 16;
