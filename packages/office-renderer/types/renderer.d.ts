import type { Agent } from './agent';
import type { EnvironmentId, ParticleEventType, ThemeId, TaskVisualizationData } from './types';
import type { World } from './world';
export declare class Renderer {
    private canvas;
    private ctx;
    private world;
    private scale;
    private tileSize;
    private colors;
    private env;
    private theme;
    private starCache;
    private warpStars;
    private colorCache;
    private floorNoise;
    private particles;
    private lightCanvas;
    private shakeOffset;
    private shakeEnd;
    private flashColor;
    private flashStart;
    private flashDuration;
    /** Tracks which door tile positions are open (key = "x,y") */
    private openDoors;
    /** Debounce timers for door closing (key = "x,y", value = close timestamp) */
    private doorCloseTimers;
    constructor(canvas: HTMLCanvasElement, world: World, scale: number, tileSize: number, theme?: ThemeId, env?: EnvironmentId);
    private get ts();
    /** Ceil'd tile size for fill operations — prevents 1px gaps between tiles at fractional scale */
    private get tsCeil();
    resize(w: number, h: number): void;
    setScale(s: number): void;
    setTheme(theme: ThemeId): void;
    setEnvironment(env: EnvironmentId, theme: ThemeId): void;
    updateParticles(dt: number): void;
    spawnWeldingSparks(gridX: number, gridY: number): void;
    spawnEventParticles(gridX: number, gridY: number, eventType: ParticleEventType): void;
    /** Trigger screen shake (for error bursts, impacts) */
    shake(intensity?: number, duration?: number): void;
    /** Trigger screen flash (white for success, red for error) */
    flash(color: string, duration?: number): void;
    render(agents: Agent[], taskViz?: TaskVisualizationData): void;
    getAgentAt(sx: number, sy: number, agents: Agent[]): Agent | null;
    private getEnvPalette;
    private generateStars;
    private drawStars;
    private generateFloorNoise;
    private drawFloor;
    private drawFloorDetail;
    /** Draw soft grass edges where grass meets hard terrain (road, cobblestone, pathway) */
    private drawTerrainEdges;
    /** Update which doors are open based on agent proximity (Manhattan distance ≤ 2) */
    private updateDoorStates;
    /** Draw peaked triangular roofs above flat roof tile rows for a classic RPG look */
    private drawPeakedRoofs;
    private drawWallShadows;
    private drawWallTile;
    private drawDecor;
    private drawPlant;
    private drawCoffee;
    private drawWaterCooler;
    private drawBookshelf;
    private drawCouch;
    private drawWhiteboard;
    private drawMeetingTable;
    private drawCabinet;
    private drawPrinter;
    private drawRocketBody;
    private drawRocketNose;
    private drawRocketEngine;
    private drawScaffolding;
    private drawFuelTank;
    private drawLaunchPad;
    private drawHullWindow;
    private drawSolarPanel;
    private drawOxygenTank;
    private drawCommDish;
    private drawSleepPod;
    private drawSatellite;
    private drawHayBale;
    private drawTree;
    private drawWaterTrough;
    private drawCrop;
    private drawTractor;
    private drawCow;
    private drawChicken;
    private drawSheep;
    private drawHospitalBed;
    private drawMedCabinet;
    private drawXrayMachine;
    private drawCurtain;
    private drawSink;
    private drawShipHull;
    private drawShipMast;
    private drawShipSail;
    private drawShipWheel;
    private drawCannon;
    private drawBarrel;
    private drawAnchor;
    private drawPlankTile;
    private drawCrowsNest;
    private drawTreasureChest;
    private drawJollyRoger;
    private drawGrassBase;
    private drawLamppost;
    private drawBench;
    /** Draw a small ground shadow ellipse at the base of a decoration */
    private drawGroundShadow;
    private drawTownTree;
    private drawFountain;
    private drawFlowerBed;
    private drawFence;
    private drawMailbox;
    private drawSignpost;
    private drawWater;
    private drawMarketStall;
    private drawWell;
    private drawWorkstations;
    /** Desk-type zones that have a desk+chair tile pair */
    private static DESK_ZONES;
    /** Map zone types to visual variants */
    private getZoneVariant;
    private drawZones;
    private drawRoomWalls;
    private drawRoomLabels;
    /** Draw animated screen content (code, charts, ECG) */
    private drawScreenContent;
    private drawGlowEffects;
    private drawAgent;
    private drawHeadgear;
    private drawActivityProp;
    /** Truncate message to short status label (1-2 words max) */
    private truncateMessage;
    private drawBubble;
    private drawConversationLines;
    private drawNameLabel;
    private drawStatusIcon;
    /** Environment-aware atmosphere lighting overlay with per-tile point lights */
    private drawLightingOverlay;
    private circle;
    private roundRect;
    private darken;
    private lighten;
    private hexToRgba;
    /** Draw a rectangle with outline, highlight (top/left), and shadow (bottom/right) edges */
    private shadedRect;
    /** Draw a circle with outline and highlight spot */
    private shadedCircle;
    private getPriorityColor;
    private drawTaskItems;
    private drawOverflowBadge;
    private drawRoomTaskCount;
    private drawEnvironmentTaskItem;
    private drawOfficeTaskItem;
    private drawTownTaskItem;
    private drawRocketTaskItem;
    private drawSpaceTaskItem;
    private drawFarmTaskItem;
    private drawHospitalTaskItem;
    private drawPirateTaskItem;
    private drawCompletionAccumulator;
    /** Helper: draw a pixel block (blocky rectangle) */
    private pixelBlock;
    /** Office: Dartboard — single iconic object, grows upward, clamped to room */
    private drawPixelOffice;
    /** Helper: draw a filled pixel circle at (cx,cy) with given radius */
    private drawPixelCircle;
    /** Town: Pixel-art ceremonial key of the city (horizontal) */
    private drawPixelTown;
    /** Rocket: Tall sectioned rocket matching reference — red cone, white body, blue windows, red stripes, big fins, growing flames */
    private drawPixelRocket;
    /** Space station: module cluster stacking upward */
    private drawPixelSpaceStation;
    /** Farm: Pixel-art cow — well-defined blocky cow that grows bigger */
    private drawPixelFarm;
    /** Hospital: Balloons only — more balloons with level, clamped to room */
    private drawPixelHospital;
    /** Pirate: Treasure chest with gold and pirate flag on top */
    private drawPixelPirate;
    private drawAgentTaskConnections;
    private drawFlyingTasks;
    /** Draw a small version of the task item for flying animation (already translated) */
    private drawFlyingItemBody;
}
