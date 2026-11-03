import type { EnvironmentId, OfficeSize } from './types';
export interface ThemeColors {
    bg: string;
    floor: string;
    floorAlt: string;
    floorGrid: string;
    wall: string;
    wallTop: string;
    wallBorder: string;
    deskTop: string;
    deskEdge: string;
    deskLeg: string;
    monitor: string;
    screenOn: string;
    screenOff: string;
    chairSeat: string;
    chairBack: string;
    plantLeaf: string;
    plantLeafAlt: string;
    plantPot: string;
    bookshelf: string;
    books: string[];
    coffee: string;
    couch: string;
    whiteboard: string;
    cabinet: string;
    printer: string;
    meetingTable: string;
    meetingTableEdge: string;
    rug: string;
    waterCooler: string;
    waterCoolerWater: string;
}
export declare const THEMES: Record<string, ThemeColors>;
export declare const ENV_COLORS: Record<string, ThemeColors>;
export interface SizeConfig {
    width: number;
    height: number;
    maxWorkstations: number;
    deskStartX: number;
    deskColSpacing: number;
    deskRowSpacing: number;
    deskStartY: number;
    deskCols: number;
}
/** Height added at top of grid for orchestrator/manager corridor */
export declare const ORCHESTRATOR_ROWS = 2;
export declare const SIZE_CONFIGS: Record<OfficeSize, SizeConfig>;
/** Pick the grid size that best fills the container.
 *  With fractional scaling, prefers larger grids that use more of the
 *  container area while maintaining a minimum scale of 1.5× for readability.
 *  Falls back to agent-count heuristic otherwise. */
export declare function getAutoSize(agentCount: number, containerW?: number, containerH?: number, tileSize?: number): OfficeSize;
export declare const ENV_LABELS: Record<EnvironmentId, string>;
