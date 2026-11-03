import type { ActivityZone, EnvironmentId, OfficeSize, Position, Room, Tile, ThemeId, ZoneType, StageConfig } from './types';
export declare class World {
    gridWidth: number;
    gridHeight: number;
    tiles: Tile[][];
    zones: ActivityZone[];
    rooms: Room[];
    spawnPoint: Position;
    currentEnv: EnvironmentId;
    /** @deprecated Use zones instead */
    get workstations(): ActivityZone[];
    constructor(size?: OfficeSize, theme?: ThemeId, env?: EnvironmentId, _roomMode?: string, stages?: StageConfig[]);
    rebuild(size: OfficeSize, theme: ThemeId, env?: EnvironmentId, _roomMode?: string, stages?: StageConfig[]): void;
    private initFloor;
    private addWalls;
    /** The Y row where the orchestrator corridor's separator wall sits */
    get orchestratorSeparatorY(): number;
    /** Build the orchestrator/manager corridor at the top of the grid (rows 1..ORCHESTRATOR_ROWS) */
    private buildOrchestratorCorridor;
    /** Build a vertical room divider wall with a doorway (below orchestrator corridor) */
    private buildRoomDivider;
    /** Build a horizontal room divider wall with a doorway */
    private buildHorizontalDivider;
    /** Create N rooms split by vertical dividers (below the orchestrator corridor) */
    private createMultipleRooms;
    private addZone;
    /** Place desk+chair zone */
    private addDeskZone;
    /** Place a standing zone */
    private addStandingZone;
    /** Fill a room with desk zones in a grid pattern.
     *  When bottomHalfOnly=true, desks are placed only in the lower half of the room. */
    private fillDesksInRoom;
    private buildOfficeRooms;
    private buildRocketRooms;
    private buildSpaceStationRooms;
    private buildFarmRooms;
    private buildPirateShipRooms;
    private buildHospitalRooms;
    private buildKanbanRooms;
    private populateRoomByStyle;
    private readonly ROOF_COLORS;
    private buildTownRooms;
    private placeTownRow;
    private createRPGBuilding;
    private getTownBuildingName;
    private getRoofType;
    private populateRPGBuilding;
    private tryPlaceOnFloor;
    private placeTownDecorRPG;
    private set;
    private tryPlace;
    isWalkable(x: number, y: number): boolean;
    getAvailableZone(preferredType?: ZoneType): ActivityZone | null;
    /** @deprecated Use getAvailableZone instead */
    getAvailableWorkstation(): ActivityZone | null;
    assignZone(zoneId: number, agentId: string): void;
    /** @deprecated Use assignZone instead */
    assignWorkstation(wsId: number, agentId: string): void;
    freeZone(agentId: string): void;
    /** @deprecated Use freeZone instead */
    freeWorkstation(agentId: string): void;
    findPath(start: Position, end: Position): Position[];
}
