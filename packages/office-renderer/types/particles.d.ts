import type { EnvironmentId, ParticleEventType } from './types';
export declare class ParticleSystem {
    private particles;
    private maxParticles;
    private spawnTimer;
    private worldW;
    private worldH;
    private env;
    configure(env: EnvironmentId, gridW: number, gridH: number, tileSize: number): void;
    /** Spawn event particles at a world position — bypasses maxParticles cap */
    spawnEventParticles(worldX: number, worldY: number, eventType: ParticleEventType): void;
    /** Spawn welding sparks at a specific world position (for rocket construction) */
    spawnWeldingSparks(worldX: number, worldY: number): void;
    update(dt: number): void;
    render(ctx: CanvasRenderingContext2D): void;
    private spawn;
    private getSpawnInterval;
    private hexToRgb;
}
