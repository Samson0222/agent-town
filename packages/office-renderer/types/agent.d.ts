import type { AgentActivity, AgentStatus, CharacterPalette, Direction, Position, SpriteFrame, ZoneType } from './types';
export declare function resetPaletteCounter(): void;
export declare class Agent {
    readonly id: string;
    name: string;
    role: string;
    team: string;
    palette: CharacterPalette;
    paletteIndex: number;
    gender: 'M' | 'F';
    x: number;
    y: number;
    gridX: number;
    gridY: number;
    path: Position[];
    private pathIndex;
    userStatus: AgentStatus;
    resolvedActivity: AgentActivity;
    isWalking: boolean;
    isAtDesk: boolean;
    direction: Direction;
    animFrame: number;
    animTimer: number;
    message: string | null;
    messageTimer: number;
    breathPhase: number;
    blinkTimer: number;
    isBlinking: boolean;
    private blinkDuration;
    currentZoneId: number | null;
    currentZoneType: ZoneType | null;
    movementTimer: number;
    isRoaming: boolean;
    socialAction: 'none' | 'coffee_break' | 'chatting' | 'waving' | 'pointing' | 'high_five' | 'stretching';
    socialTimer: number;
    socialPartnerId: string | null;
    coffeeBreakTimer: number;
    /** Timer for idle procrastination messages */
    idleMessageTimer: number;
    portalState: 'none' | 'departing' | 'arriving';
    portalTimer: number;
    portalDest: Position | null;
    private static PORTAL_DEPART_TIME;
    private static PORTAL_ARRIVE_TIME;
    currentObjectiveId: string | null;
    currentStoryId: string | null;
    /** Number of active (non-done, non-backlog) tasks assigned to this agent */
    activeTaskCount: number;
    /** Number of completed tasks assigned to this agent */
    completedTaskCount: number;
    /** Skills / specializations for display */
    skills: string[];
    /** @deprecated Use currentZoneId instead */
    get workstationId(): number | null;
    set workstationId(v: number | null);
    visible: boolean;
    private walkSpeed;
    private walkProgress;
    constructor(id: string, name: string, spawnPos: Position, role?: string, team?: string);
    setStatus(status: AgentStatus, message?: string | null): void;
    walkTo(path: Position[]): void;
    portalTo(dest: Position): void;
    /** Maps resolved activity to one of the sprite animation keys */
    private getAnimationKey;
    update(dt: number): void;
    getCurrentSprite(): {
        frame: SpriteFrame;
        flip: boolean;
    };
}
