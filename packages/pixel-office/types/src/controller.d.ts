export type OfficeAgentStatus = "idle" | "thinking" | "working" | "waiting-for-human" | "done" | "failed";
export interface OfficeAgent {
    id: string;
    name: string;
    status: OfficeAgentStatus;
    /** Tool in use (drives typing vs reading animation). */
    tool?: string;
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
    /** Agent id under a click (client coords), if any. */
    agentAt(clientX: number, clientY: number): string | null;
    /** Where to draw HTML name tags (CSS px). */
    labelPositions(): LabelPosition[];
    destroy(): void;
}
