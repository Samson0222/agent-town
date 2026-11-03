import type { ColorValue } from '../../components/ui/types';
import type { AreaDefinition, CarpetTile, Character, FurnitureInstance, Pet, Seat, SpriteData, TileType as TileTypeVal } from '../types';
export declare function setGhostHeadlessAgents(enabled: boolean): void;
export declare function isGhostHeadlessAgentsEnabled(): boolean;
/**
 * Render the carpet layer. Called AFTER renderTileGrid and BEFORE seat
 * indicators / characters / furniture.
 *
 * Per junction (cols+1 × rows+1 grid of corners), we gather every
 * (variant, palette) pair from the up-to-4 adjacent tiles. Each pair becomes
 * one local "layer" drawn in ascending `order`, so the highest-order carpet
 * visually wins at overlaps. Sprite anchor: each 16×16 junction sprite is
 * centered on the corner — drawn at (offsetX + jx*s - halfS, offsetY + jy*s - halfS).
 *
 * @internal
 */
export declare function renderCarpetLayer(ctx: CanvasRenderingContext2D, carpetTiles: Array<CarpetTile | null>, cols: number, rows: number, offsetX: number, offsetY: number, zoom: number): void;
/**
 * Translucent per-tile color wash for Areas. Runs ABOVE carpets/floor and
 * BELOW seat indicators / characters / furniture. The active area (the one
 * the editor has currently selected) gets a multiplier-bumped alpha so users
 * can see which area they're editing without changing every other area's
 * visibility.
 *
 * @internal
 */
export declare function renderAreaOverlay(ctx: CanvasRenderingContext2D, areaTiles: Array<string | null> | undefined, areas: AreaDefinition[] | undefined, cols: number, rows: number, offsetX: number, offsetY: number, zoom: number, activeAreaLabel?: string | null): void;
/**
 * Render the centroid label for each Area, ABOVE characters/bubbles. Centroid
 * = arithmetic mean of all tile centers belonging to a given label. Pixel-art
 * drop shadow (no blur) for legibility on light backgrounds.
 *
 * @internal
 */
export declare function renderAreaLabels(ctx: CanvasRenderingContext2D, areaTiles: Array<string | null> | undefined, areas: AreaDefinition[] | undefined, cols: number, rows: number, offsetX: number, offsetY: number, zoom: number): void;
/** @internal */
export declare function renderTileGrid(ctx: CanvasRenderingContext2D, tileMap: TileTypeVal[][], offsetX: number, offsetY: number, zoom: number, tileColors?: Array<ColorValue | null>, cols?: number): void;
/** @internal */
export declare function renderScene(ctx: CanvasRenderingContext2D, furniture: FurnitureInstance[], characters: Character[], offsetX: number, offsetY: number, zoom: number, selectedAgentId: number | null, hoveredAgentId: number | null, pets?: Pet[]): void;
/** @internal */
export declare function renderGridOverlay(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, zoom: number, cols: number, rows: number, tileMap?: TileTypeVal[][]): void;
/** @internal */
export declare function renderGhostPreview(ctx: CanvasRenderingContext2D, sprite: SpriteData, col: number, row: number, valid: boolean, offsetX: number, offsetY: number, zoom: number, mirrored?: boolean): void;
/** @internal */
export declare function renderSelectionHighlight(ctx: CanvasRenderingContext2D, col: number, row: number, w: number, h: number, offsetX: number, offsetY: number, zoom: number): void;
/** @internal */
export declare function renderDeleteButton(ctx: CanvasRenderingContext2D, col: number, row: number, w: number, _h: number, offsetX: number, offsetY: number, zoom: number): DeleteButtonBounds;
export interface ButtonBounds {
    /** Center X in device pixels */
    cx: number;
    /** Center Y in device pixels */
    cy: number;
    /** Radius in device pixels */
    radius: number;
}
export type DeleteButtonBounds = ButtonBounds;
export type RotateButtonBounds = ButtonBounds;
/** One translucent preview sprite at a target tile. */
export interface GhostSprite {
    sprite: SpriteData;
    col: number;
    row: number;
    mirrored: boolean;
}
export interface EditorRenderState {
    showGrid: boolean;
    /**
     * Preview sprites, drawn in order with one shared validity tint: the item
     * being placed, or a dragged item followed by everything riding on it — the
     * group previews (and is accepted or refused) as one.
     */
    ghosts: GhostSprite[];
    ghostValid: boolean;
    selectedCol: number;
    selectedRow: number;
    selectedW: number;
    selectedH: number;
    hasSelection: boolean;
    isRotatable: boolean;
    /** Updated each frame by renderDeleteButton */
    deleteButtonBounds: DeleteButtonBounds | null;
    /** Updated each frame by renderRotateButton */
    rotateButtonBounds: RotateButtonBounds | null;
    /** Whether to show ghost border (expansion tiles outside grid) */
    showGhostBorder: boolean;
    /** Hovered ghost border tile col (-1 to cols) */
    ghostBorderHoverCol: number;
    /** Hovered ghost border tile row (-1 to rows) */
    ghostBorderHoverRow: number;
}
export interface SelectionRenderState {
    selectedAgentId: number | null;
    hoveredAgentId: number | null;
    hoveredTile: {
        col: number;
        row: number;
    } | null;
    seats: Map<string, Seat>;
    characters: Map<number, Character>;
}
export declare function renderFrame(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, tileMap: TileTypeVal[][], furniture: FurnitureInstance[], characters: Character[], zoom: number, panX: number, panY: number, selection?: SelectionRenderState, editor?: EditorRenderState, tileColors?: Array<ColorValue | null>, layoutCols?: number, layoutRows?: number, carpetTiles?: Array<CarpetTile | null>, areas?: AreaDefinition[], areaTiles?: Array<string | null>, showAreas?: boolean, activeAreaLabel?: string | null, pets?: Pet[]): {
    offsetX: number;
    offsetY: number;
};
