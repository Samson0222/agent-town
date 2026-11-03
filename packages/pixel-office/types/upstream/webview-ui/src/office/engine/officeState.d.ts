import type { Character, FurnitureInstance, OfficeLayout, Pet, PlacedPet, Seat, TileType as TileTypeVal } from '../types';
export declare class OfficeState {
    layout: OfficeLayout;
    tileMap: TileTypeVal[][];
    seats: Map<string, Seat>;
    blockedTiles: Set<string>;
    furniture: FurnitureInstance[];
    walkableTiles: Array<{
        col: number;
        row: number;
    }>;
    characters: Map<number, Character>;
    pets: Pet[];
    /** Accumulated time for furniture animation frame cycling */
    furnitureAnimTimer: number;
    private _selectedAgentId;
    private readonly selectionListeners;
    get selectedAgentId(): number | null;
    set selectedAgentId(id: number | null);
    /** Observe selectedAgentId changes. React (the card bars) subscribes so
     *  imperative canvas selection can drive card highlights — everything else
     *  about selection stays out of React state. Returns the unsubscribe. */
    subscribeSelection(listener: (id: number | null) => void): () => void;
    cameraFollowId: number | null;
    hoveredAgentId: number | null;
    hoveredTile: {
        col: number;
        row: number;
    } | null;
    /** Maps "parentId:toolId" → sub-agent character ID (negative) */
    subagentIdMap: Map<string, number>;
    /** Reverse lookup: sub-agent character ID → parent info */
    subagentMeta: Map<number, {
        parentAgentId: number;
        parentToolId: string;
    }>;
    private nextSubagentId;
    /**
     * directoryName → list of Area labels that Directory belongs to.
     * Populated by useExtensionMessages on `areaMappingsLoaded`. Consulted by
     * `findFreeSeat()` to bias new agents toward seats inside their Directory's Area.
     */
    areaMappings: Record<string, string[]>;
    /**
     * The first-run consent greeter, deliberately NOT in `characters`.
     *
     * `characters` means "agents": everything that iterates it — seat
     * assignment, palette diversity, the wander FSM, hit-testing, the seat
     * payload the webview persists — is asking an agent question the greeter has
     * no answer to. Holding it here instead of tagging it with a flag makes
     * every one of those loops correct by default, rather than correct as long
     * as each remembers an `isGreeter` guard. It is drawn because
     * `getCharacters()` appends it, and that is the only place it joins the
     * others.
     */
    greeter: Character | null;
    /** World-space point the camera drifts to while the greeter is up
     *  (the bubble overlay recomputes it every frame: the combined center of the
     *  character and its speech bubble). An explicit cameraFollowId outranks it. */
    greeterCameraTarget: {
        x: number;
        y: number;
    } | null;
    /** Latched by a manual pan during the ask: the user took the camera, so the
     *  overlay's per-frame updates stop re-centering. Reset on spawn/despawn. */
    private greeterCameraCancelled;
    setAreaMappings(mappings: Record<string, string[]>): void;
    constructor(layout?: OfficeLayout);
    /** Rebuild all derived state from a new layout. Reassigns existing characters.
     *  @param shift Optional pixel shift to apply when grid expands left/up */
    rebuildFromLayout(layout: OfficeLayout, shift?: {
        col: number;
        row: number;
    }): void;
    /** Move a character to a random walkable tile */
    private relocateCharacterToWalkable;
    getLayout(): OfficeLayout;
    /** Get the blocked-tile key for a character's own seat, or null */
    private ownSeatKey;
    /** Temporarily unblock a character's own seat, run fn, then re-block */
    private withOwnSeatUnblocked;
    /** Collect every tile occupied by electronics furniture (PCs, monitors, etc.). */
    private buildElectronicsTileSet;
    /** Find the area label assigned to a seat's tile, or null. Public for e2e
     *  observability (getAgentSeats hook reads a seated agent's area). */
    seatZone(uid: string): string | null;
    /**
     * Does this seat face an electronics tile (PC, monitor)? Mirrors the
     * forward-and-flanking scan used by furniture auto-state.
     */
    private isSeatFacingElectronics;
    /**
     * Random-pick a seat from a candidate list, biased toward seats that face an
     * electronics tile. Returns null when the candidate list is empty.
     */
    private pickFromSeats;
    /**
     * 3-stage seat picker for top-level agents.
     *
     *   Stage 1: If `directoryName` is given and `areaMappings[directoryName]` lists
     *            Area labels, prefer free seats whose tile is labeled with one
     *            of those areas.
     *   Stage 2: Prefer free seats whose tile has NO area label (unzoned).
     *   Stage 3: Any free seat.
     *
     * Each stage routes through `pickFromSeats` for the PC-bias rule. Returns
     * null only when every seat is already occupied. Passing `undefined`
     * preserves pre-Areas single-stage behavior (skips Stage 1; Stage 2 picks
     * unzoned seats from a layout without `areaTiles`, which is every seat).
     */
    private findFreeSeat;
    /** Closest walkable tile to (col,row) not occupied by another character, or null. */
    private closestFreeWalkableTile;
    /**
     * Pick a diverse palette for a new agent based on currently active agents.
     * First 6 agents each get a unique skin (random order). Beyond 6, skins
     * repeat in balanced rounds with a random hue shift (≥45°).
     */
    private pickDiversePalette;
    addAgent(id: number, preferredPalette?: number, preferredHueShift?: number, preferredSeatId?: string, skipSpawnEffect?: boolean, directoryName?: string, nearAgentId?: number): void;
    /** Spawn the greeter near the office's bottom-left corner: target tile
     *  GREETER_TILE_MARGIN in from the left and bottom edges, falling
     *  back to the closest walkable tile when the target is a seat, furniture,
     *  a wall, or VOID (seat tiles are in blockedTiles, so closestFreeWalkableTile
     *  covers every one of those). Idempotent; a remount mid-despawn (StrictMode)
     *  revives it. */
    spawnGreeter(): void;
    /** Start the greeter's despawn effect and release the greeter camera. The
     *  character is dropped once the effect finishes (see update()).
     *  Idempotent — every close path (answer, Escape, hooksStatus) funnels here. */
    despawnGreeter(): void;
    /** Per-frame update from the bubble overlay; ignored once the user panned. */
    setGreeterCameraTarget(p: {
        x: number;
        y: number;
    }): void;
    /** Manual pan during the ask: stop re-centering until the next spawn. */
    cancelGreeterCamera(): void;
    /** Every manual pan (mouse, wheel, touch) takes the camera back from both
     *  automatic drivers: character follow and the greeter's ask. */
    breakCameraFollow(): void;
    /** Select an agent's character and have the camera follow it — what a card
     *  tap does to the office. No-op for an agent with no character. */
    selectAndFollow(id: number): void;
    /** The agent that owns `id`'s terminal: a sub-agent's parent, else itself. */
    terminalOwnerOf(id: number): number;
    removeAgent(id: number): void;
    /** Find seat uid at a given tile position, or null */
    getSeatAtTile(col: number, row: number): string | null;
    /** Reassign an agent from their current seat to a new seat */
    reassignSeat(agentId: number, seatId: string): void;
    /**
     * Move a just-linked teammate to the free seat closest to its lead, so teams
     * cluster. Only moves when that seat is strictly closer than the teammate's
     * current one — a teammate created as a plain external agent (seated by an
     * arbitrary findFreeSeat) and tagged as a teammate only after tag discovery
     * would otherwise keep its arbitrary seat, unlike an inline teammate seated
     * next to the lead at creation.
     */
    private reseatNextToLead;
    /** Send an agent back to their currently assigned seat */
    sendToSeat(agentId: number): void;
    /** Walk an agent to an arbitrary walkable tile (right-click command) */
    walkToTile(agentId: number, col: number, row: number): boolean;
    /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID. */
    addSubagent(parentAgentId: number, parentToolId: string): number;
    /** Remove a specific sub-agent character and free its seat */
    removeSubagent(parentAgentId: number, parentToolId: string): void;
    /** Remove all sub-agents belonging to a parent agent */
    removeAllSubagents(parentAgentId: number): void;
    /** Look up the sub-agent character ID for a given parent+toolId, or null */
    getSubagentId(parentAgentId: number, parentToolId: string): number | null;
    setAgentActive(id: number, active: boolean): void;
    /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
    private rebuildFurnitureInstances;
    setAgentTool(id: number, tool: string | null): void;
    showPermissionBubble(id: number): void;
    clearPermissionBubble(id: number): void;
    showWaitingBubble(id: number, awaitingInput?: boolean): void;
    /** Dismiss bubble on click — permission: instant, waiting: quick fade */
    dismissBubble(id: number): void;
    /**
     * Add a pet to the live runtime. Spawns at a uniformly-random walkable tile.
     * Mirror in `this.layout.pets` so debounced saveLayout serialises the roster.
     * Bounds-checks petType against the loaded sprite count to defend against stale layouts.
     */
    addPet(placedPet: PlacedPet): void;
    /** Remove a pet by id. Idempotent. */
    removePet(id: string): void;
    /** Shallow snapshot for external consumers (renderer, hooks). */
    getPets(): Pet[];
    /** Unique petType values currently placed. Used by the Pets toolbar to mark active rows. */
    getActivePetTypes(): number[];
    /**
     * Hit-test pets at a pixel world position. Sorts back-to-front (largest y wins on tie)
     * so the visually-frontmost pet receives the click.
     * Returns the pet id or null.
     */
    getPetAt(worldX: number, worldY: number): string | null;
    /** Show the heart bubble on a pet for WAITING_BUBBLE_DURATION_SEC. */
    showPetBubble(petId: string): void;
    /** Dismiss the heart bubble on click; collapses timer to a fast fade. */
    dismissPetBubble(petId: string): void;
    /**
     * Reconcile `this.pets` to match the layout's placed-pet roster.
     * - Pets in layout but not in runtime → spawn via addPet().
     * - Pets in runtime but not in layout → remove.
     * - Pets in both → keep existing runtime state (position, FSM).
     *
     * Called from constructor and rebuildFromLayout. Always runs AFTER walkableTiles
     * is populated.
     */
    private rebuildPetsFromLayout;
    /**
     * Re-export the current pet roster into `this.layout.pets`. Called only from
     * mutating methods (addPet / removePet / rebuildPetsFromLayout) — NEVER from
     * getLayout(), which runs on every render frame.
     */
    private syncLayoutPets;
    setTeamInfo(id: number, teamName?: string, agentName?: string, isTeamLead?: boolean, leadAgentId?: number, teamUsesTmux?: boolean): void;
    /** Mark an agent as headless (adopted, no terminal to focus). */
    setHeadless(id: number, headless: boolean): void;
    setAgentContext(id: number, contextTokens: number, maxContextTokens: number): void;
    update(dt: number): void;
    /** The `saveAgentSeats` payload: palette, hue and seat for every agent worth
     *  restoring. Sub-agents are excluded because they are derived state the
     *  runtime re-materializes, and the greeter never reaches here at all —
     *  it is not in `characters`. */
    getPersistableSeats(): Record<number, {
        palette: number;
        hueShift: number;
        seatId: string | null;
    }>;
    /** Everything the renderer draws: the agents plus, while the first-run ask
     *  is up, the consent greeter. This is the ONE place the greeter joins the
     *  agents — every other consumer reads `characters` and gets agents only. */
    getCharacters(): Character[];
    /** Get character at pixel position (for hit testing). Returns id or null.
     *  Agents only: clicks pass straight through the consent greeter, which is
     *  a prop, not something to select or follow. */
    getCharacterAt(worldX: number, worldY: number): number | null;
}
