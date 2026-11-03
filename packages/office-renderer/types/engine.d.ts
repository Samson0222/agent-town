export declare class Engine {
    private running;
    private lastTime;
    private frameId;
    onUpdate: ((dt: number) => void) | null;
    onRender: (() => void) | null;
    start(): void;
    stop(): void;
    private loop;
}
