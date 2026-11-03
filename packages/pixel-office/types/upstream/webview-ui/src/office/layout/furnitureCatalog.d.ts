import type { FurnitureCatalogEntry, SpriteData } from '../types';
export interface LoadedAssetData {
    catalog: Array<{
        id: string;
        label: string;
        category: string;
        width: number;
        height: number;
        footprintW: number;
        footprintH: number;
        isDesk: boolean;
        groupId?: string;
        orientation?: string;
        state?: string;
        canPlaceOnSurfaces?: boolean;
        backgroundTiles?: number;
        canPlaceOnWalls?: boolean;
        mirrorSide?: boolean;
        rotationScheme?: string;
        animationGroup?: string;
        frame?: number;
    }>;
    sprites: Record<string, SpriteData>;
}
export type FurnitureCategory = 'desks' | 'chairs' | 'storage' | 'decor' | 'electronics' | 'wall' | 'misc';
/** @internal */
export interface CatalogEntryWithCategory extends FurnitureCatalogEntry {
    category: FurnitureCategory;
}
/**
 * Build catalog from loaded assets. Returns true if successful.
 * Once built, all getCatalog* functions use the dynamic catalog.
 * Uses ONLY custom assets (excludes hardcoded furniture when assets are loaded).
 */
export declare function buildDynamicCatalog(assets: LoadedAssetData): boolean;
export declare function getCatalogEntry(type: string): CatalogEntryWithCategory | undefined;
export declare function getCatalogByCategory(category: FurnitureCategory): CatalogEntryWithCategory[];
export declare function getActiveCategories(): Array<{
    id: FurnitureCategory;
    label: string;
}>;
/** @internal */
export declare const FURNITURE_CATEGORIES: Array<{
    id: FurnitureCategory;
    label: string;
}>;
/** Returns the next asset ID in the rotation group (cw or ccw), or null if not rotatable. */
export declare function getRotatedType(currentType: string, direction: 'cw' | 'ccw'): string | null;
/** Returns the toggled state variant (on↔off), or null if no state variant exists. */
export declare function getToggledType(currentType: string): string | null;
/** Returns the "on" variant if this type has one, otherwise returns the type unchanged. */
export declare function getOnStateType(currentType: string): string;
/** Returns the "off" variant if this type has one, otherwise returns the type unchanged - unused */
/** Returns true if the given furniture type is part of a rotation group. */
export declare function isRotatable(type: string): boolean;
/** Get ordered animation frame asset IDs for a given type, or null if not animated. */
export declare function getAnimationFrames(type: string): string[] | null;
/**
 * Get the orientation of a type within its rotation group, or undefined if not in a group.
 * Used by the renderer to determine if a "left" orientation should be mirrored.
 */
export declare function getOrientationInGroup(type: string): string | undefined;
