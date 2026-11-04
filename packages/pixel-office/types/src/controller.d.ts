export type OfficeAgentStatus = "idle" | "thinking" | "working" | "waiting-for-human" | "done" | "failed";
export interface OfficeAgent {
    id: string;
    name: string;
    status: OfficeAgentStatus;
    /** Tool in use (drives typing vs reading animation). */
    tool?: string;
    /** Which office character to use (0-based); otherwise picked from the id. */
    look?: number;
    /** Teammate this agent is meeting with (both get the same pair; see officeMeetings in core). */
    meetWith?: string;
}
export interface LabelPosition {
    id: string;
    /** CSS pixels relative to the canvas, at the top of the character's head. */
    x: number;
    y: number;
    seated: boolean;
}
export declare class PixelOffice {
    private canvas;
    private opts;
    private state;
    private stop;
    private ids;
    private last;
    private offset;
    private zoom;
    private pan;
    private nextId;
    private pending;
    /** Each agent's own desk seat, and the lounge seat it's using during a meeting. */
    private home;
    private meetingSeat;
    private hops;
    private observer;
    selectedId: string | null;
    ready: Promise<void>;
    constructor(canvas: HTMLCanvasElement, opts?: {
        base?: string;
        onFrame?: () => void;
    });
    private init;
    private characterCount;
    private resize;
    /** Push the current agent list + statuses (call on every state change; only diffs are applied). */
    setAgents(agents: OfficeAgent[]): void;
    /**
     * Move an agent to a lounge seat next to its meeting partner, or back to its own
     * desk when the meeting is over. Returns whether the agent is in a meeting now.
     */
    private updateMeeting;
    /** A free lounge (non-desk) seat, preferring the one closest to `near`. */
    private loungeSeatNear;
    /** Agent id under a click (client coords), if any. */
    agentAt(clientX: number, clientY: number): string | null;
    /** Where to draw HTML name tags (CSS px). */
    labelPositions(): LabelPosition[];
    destroy(): void;
}
