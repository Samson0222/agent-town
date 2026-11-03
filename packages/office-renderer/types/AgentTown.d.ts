import type { AgentConfig, AgentUpdate, TownConfig, TownEventMap, TownSettings, Workspace, ThemeId, OfficeSize, EnvironmentId, ActivityEvent, Task, TaskStage, ReviewItem, Objective, ObjectiveStatus, Story, StoryStatus, Sprint, Milestone, StageConfig, RoomMode } from './types';
import { Agent } from './agent';
type EventKey = keyof TownEventMap;
type EventCb<K extends EventKey> = (...args: TownEventMap[K]) => void;
export declare class AgentTown {
    private container;
    private canvas;
    private world;
    private renderer;
    private engine;
    private agents;
    private events;
    private readonly tileSize;
    private scale;
    private resizeObserver;
    private onAgentClickCb;
    private currentTheme;
    private currentSize;
    private currentEnv;
    private autoSizeEnabled;
    private stageConfigs;
    private currentRoomMode;
    private activityLog;
    private taskMap;
    private reviewMap;
    private objectiveMap;
    private storyMap;
    private sprintMap;
    private milestoneMap;
    private nextEvtId;
    private taskVizCache;
    private taskVizDirty;
    private flyingTasks;
    private settings;
    private workspaces;
    private activeWorkspaceId;
    constructor(config: TownConfig);
    get theme(): ThemeId;
    get officeSize(): OfficeSize;
    get environment(): EnvironmentId;
    setTheme(theme: ThemeId): void;
    setOfficeSize(size: OfficeSize): void;
    setEnvironment(env: EnvironmentId): void;
    /** Get the current stage configurations */
    getStages(): StageConfig[];
    /** Set custom kanban stages. Rebuilds world layout. @since 0.3.0 */
    setStages(stages: StageConfig[]): void;
    /** Get the current room layout mode */
    getRoomMode(): RoomMode;
    /** Toggle between 'environment' (standard rooms) and 'kanban' (stage-based rooms). @since 0.3.0 */
    setRoomMode(mode: RoomMode): void;
    /** Update visual/simulation settings */
    updateSettings(update: Partial<TownSettings>): void;
    getSettings(): TownSettings;
    addWorkspace(ws: Workspace): void;
    removeWorkspace(id: string): void;
    updateWorkspace(id: string, update: Partial<Workspace>): void;
    getWorkspaces(): Workspace[];
    getActiveWorkspaceId(): string | null;
    setActiveWorkspace(id: string | null): void;
    private applyWorkspaceFilter;
    private reassignAgents;
    addAgent(cfg: AgentConfig): void;
    /**
     * Updates an agent's status, message, name, or hierarchy context.
     * Status changes trigger activity logging, particle effects, and room movement.
     *
     * @param id - Agent ID
     * @param update - Fields to update (all optional)
     * @since 0.1.0
     */
    updateAgent(id: string, update: AgentUpdate): void;
    removeAgent(id: string): void;
    removeAllAgents(): void;
    getAgent(id: string): Agent | undefined;
    getAgents(): Agent[];
    /** Default mapping from activity to kanban stage ID for kanban room mode */
    private static readonly ACTIVITY_STAGE;
    /** Orchestrator room ID (matches world.ts corridor) */
    private static readonly ORCHESTRATOR_ROOM_ID;
    /** Manager roles are routed to the orchestrator corridor */
    private static readonly MANAGER_ROLES;
    /** Check if an agent has a manager/leadership role */
    private isManagerRole;
    private getPreferredZoneTypes;
    private getPhaseRoom;
    private scheduleMovement;
    private autoResize;
    logActivity(agentId: string, type: ActivityEvent['type'], description: string): void;
    getActivityLog(): ActivityEvent[];
    clearActivityLog(): void;
    /**
     * Creates a new task. Tasks can optionally belong to a story via `storyId`.
     * Orphan tasks (no storyId) are fully supported for backward compatibility.
     *
     * @param task - Task data (createdAt/updatedAt are auto-set)
     * @since 0.1.0
     */
    addTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): void;
    /**
     * Updates a task's fields. If stage changes, progress cascades upward
     * through story → objective → milestone automatically.
     *
     * @param id - Task ID
     * @param update - Partial fields to update
     * @since 0.1.0
     */
    updateTask(id: string, update: Partial<Task>): void;
    /**
     * Removes a task by ID. Cascades progress recomputation if task had a storyId.
     * @param id - Task ID
     * @since 0.2.0
     */
    removeTask(id: string): void;
    getTasks(): Task[];
    getTasksByStage(stage: TaskStage): Task[];
    /**
     * Returns all tasks belonging to a story.
     * @param storyId - Story ID
     * @since 0.2.0
     */
    getTasksByStory(storyId: string): Task[];
    clearTasks(): void;
    /**
     * Creates a new objective. Progress is auto-computed from child stories.
     *
     * @param obj - Objective data (progress/createdAt/updatedAt are auto-set)
     * @since 0.2.0
     *
     * @example
     * ```ts
     * town.addObjective({
     *   id: 'obj-1',
     *   title: 'User Authentication',
     *   description: 'Complete auth flow with login, signup, and OAuth',
     *   status: 'active',
     *   priority: 'critical',
     *   sprintId: 'sprint-1',
     * });
     * ```
     */
    addObjective(obj: Omit<Objective, 'progress' | 'createdAt' | 'updatedAt'>): void;
    /**
     * Updates an objective's fields.
     * @param id - Objective ID
     * @param update - Partial fields to update
     * @since 0.2.0
     */
    updateObjective(id: string, update: Partial<Objective>): void;
    /** Removes an objective by ID. @since 0.2.0 */
    removeObjective(id: string): void;
    getObjective(id: string): Objective | undefined;
    getObjectives(): Objective[];
    /** Returns objectives filtered by status. @since 0.2.0 */
    getObjectivesByStatus(status: ObjectiveStatus): Objective[];
    clearObjectives(): void;
    /**
     * Creates a new story under an objective. Progress is auto-computed from child tasks.
     *
     * @param story - Story data (progress/createdAt/updatedAt are auto-set)
     * @since 0.2.0
     *
     * @example
     * ```ts
     * town.addStory({
     *   id: 'st-1',
     *   objectiveId: 'obj-1',
     *   title: 'Login/Signup Flow',
     *   description: 'Design and implement login form with validation',
     *   status: 'ready',
     *   priority: 'high',
     *   points: 5,
     * });
     * ```
     */
    addStory(story: Omit<Story, 'progress' | 'createdAt' | 'updatedAt'>): void;
    /**
     * Updates a story's fields.
     * @param id - Story ID
     * @param update - Partial fields to update
     * @since 0.2.0
     */
    updateStory(id: string, update: Partial<Story>): void;
    /** Removes a story by ID. @since 0.2.0 */
    removeStory(id: string): void;
    getStory(id: string): Story | undefined;
    getStories(): Story[];
    /** Returns all stories belonging to an objective. @since 0.2.0 */
    getStoriesByObjective(objectiveId: string): Story[];
    /** Returns stories filtered by status. @since 0.2.0 */
    getStoriesByStatus(status: StoryStatus): Story[];
    clearStories(): void;
    /**
     * Creates a new sprint for time-boxed iteration grouping.
     *
     * @param sprint - Sprint data (createdAt is auto-set)
     * @since 0.2.0
     *
     * @example
     * ```ts
     * town.addSprint({
     *   id: 'sprint-1',
     *   name: 'Sprint 1 — MVP',
     *   goal: 'Ship authentication and dashboard',
     *   status: 'active',
     * });
     * ```
     */
    addSprint(sprint: Omit<Sprint, 'createdAt'>): void;
    /** Updates a sprint's fields. @since 0.2.0 */
    updateSprint(id: string, update: Partial<Sprint>): void;
    /** Removes a sprint by ID. @since 0.2.0 */
    removeSprint(id: string): void;
    getSprint(id: string): Sprint | undefined;
    getSprints(): Sprint[];
    /** Returns the first sprint with status 'active'. @since 0.2.0 */
    getActiveSprint(): Sprint | undefined;
    clearSprints(): void;
    /**
     * Creates a new milestone linking objectives to a deliverable target.
     *
     * @param ms - Milestone data (progress is auto-computed from linked objectives)
     * @since 0.2.0
     */
    addMilestone(ms: Omit<Milestone, 'progress'>): void;
    /** Updates a milestone's fields. @since 0.2.0 */
    updateMilestone(id: string, update: Partial<Milestone>): void;
    /** Removes a milestone by ID. @since 0.2.0 */
    removeMilestone(id: string): void;
    getMilestone(id: string): Milestone | undefined;
    getMilestones(): Milestone[];
    clearMilestones(): void;
    /**
     * Returns the full hierarchy tree for an objective: the objective itself,
     * its stories, and all tasks within each story.
     *
     * @param objectiveId - Objective ID
     * @since 0.2.0
     */
    getObjectiveTree(objectiveId: string): {
        objective: Objective;
        stories: Array<{
            story: Story;
            tasks: Task[];
        }>;
    } | undefined;
    /**
     * Returns burndown data for a sprint: total, completed, remaining tasks,
     * and overall progress percentage.
     *
     * @param sprintId - Sprint ID
     * @since 0.2.0
     */
    getSprintBurndown(sprintId: string): {
        totalTasks: number;
        completedTasks: number;
        remainingTasks: number;
        progressPercent: number;
    };
    private recomputeStoryProgress;
    private recomputeObjectiveProgress;
    private recomputeMilestoneProgress;
    private recomputeAgentWorkload;
    addReview(review: Omit<ReviewItem, 'status' | 'createdAt'>): void;
    resolveReview(id: string, status: 'approved' | 'rejected'): void;
    getReviews(): ReviewItem[];
    getPendingReviews(): ReviewItem[];
    clearReviews(): void;
    on<K extends EventKey>(event: K, cb: EventCb<K>): void;
    off<K extends EventKey>(event: K, cb: EventCb<K>): void;
    private emit;
    destroy(): void;
    private spawnEventParticles;
    private teleport;
    /** Force a resize recalculation (e.g. after sidebar toggle) */
    resize(): void;
    private syncSize;
    private update;
    private endSocialAction;
    private startCoffeeBreak;
    private tryStartConversation;
    /** Called when a task completes — triggers high-five between agents */
    private triggerHighFive;
    private spawnFlyingTask;
    private computeTaskVisualization;
    private computeItemPositions;
    private isAgentInRoom;
    /** Multi-task agents portal-jump between rooms with different tasks */
    private checkMultiTaskPortal;
    private render;
    private onClick;
}
export {};
