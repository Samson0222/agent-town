import { z } from "zod";
import { Skill, SkillRef } from "./skill";

/**
 * Team + Agent template schema. Everything here is user-created data:
 * no agent, role, or team is hardcoded in the app.
 *
 * Credentials NEVER live here. A model is referenced by id; the model
 * provider / runtime resolves credentials at run time.
 */

export const ToolCategory = z.enum(["read", "write", "send", "spend"]);
export type ToolCategory = z.infer<typeof ToolCategory>;

export const ModelRef = z.object({
  /** Model id as the runtime understands it, e.g. "opencode/gpt-5" or "mock/fast". */
  id: z.string().min(1),
  /** Optional fallback model if the first one fails. */
  fallbackId: z.string().min(1).optional(),
});
export type ModelRef = z.infer<typeof ModelRef>;

export const AgentPermissions = z.object({
  /** Allow `write`-category tool calls without asking. send/spend ALWAYS ask. */
  autoApproveWrite: z.boolean().default(false),
  /** Allow sandboxed shell (built-in tool, M2). */
  shell: z.boolean().default(false),
});
export type AgentPermissions = z.infer<typeof AgentPermissions>;

export const AgentAppearance = z.object({
  /** CSS colour, e.g. "#e76f51". */
  color: z.string().default("#4f86f7"),
  /** Sprite key understood by the office renderer. Unknown keys fall back to "default". */
  sprite: z.string().default("default"),
  /** Desk position in office grid cells. If omitted, the office auto-places the agent. */
  desk: z.object({ x: z.number().int(), y: z.number().int() }).optional(),
});
export type AgentAppearance = z.infer<typeof AgentAppearance>;

export const AgentTemplate = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  department: z.string().default("General"),
  /** Short description and emoji / group, mirroring the Agent Factory role-template shape. */
  description: z.string().default(""),
  emoji: z.string().optional(),
  group: z.string().optional(),
  systemPrompt: z.string().default(""),
  /** Runtime adapter id, e.g. "mock", "opencode", "claude-code". Empty = team default. */
  runtime: z.string().optional(),
  /** Per-agent model. Empty = team default. */
  model: ModelRef.optional(),
  /** Tool ids ("connectorId.toolName" or "connectorId.*") this agent may use. */
  tools: z.array(z.string()).default([]),
  /** Skills from the shared library, each switchable on/off for this agent. */
  skills: z.array(SkillRef).default([]),
  permissions: AgentPermissions.default({ autoApproveWrite: false, shell: false }),
  appearance: AgentAppearance.default({ color: "#4f86f7", sprite: "default" }),
  /** Optional per-agent cost cap in USD for one run. */
  costCapUsd: z.number().nonnegative().optional(),
});
export type AgentTemplate = z.infer<typeof AgentTemplate>;

export const TeamDefaults = z.object({
  runtime: z.string().default("mock"),
  model: ModelRef.default({ id: "mock/standard" }),
  /** Run-level cost cap in USD. Run stops when exceeded. */
  costCapUsd: z.number().nonnegative().default(1),
});
export type TeamDefaults = z.infer<typeof TeamDefaults>;

/** A named group inside a workspace, with a lead (Multica-style squads; design only). */
export const Squad = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** Agent id of the squad lead (must be in the squad). */
  leadId: z.string().default(""),
  memberIds: z.array(z.string()).default([]),
});
export type Squad = z.infer<typeof Squad>;

/** Someone invited to one workspace (hosted access). */
export const WorkspaceInvite = z.object({
  email: z.string().email(),
  role: z.enum(["operator", "viewer"]),
  dailyBudgetUsd: z.number().nonnegative().optional(),
});
export type WorkspaceInvite = z.infer<typeof WorkspaceInvite>;

export const OFFICE_STYLES = ["2d", "3d"] as const;
export type OfficeStyle = (typeof OFFICE_STYLES)[number];

/**
 * A team is also a **workspace** (the UI calls it that): its goal, office style,
 * main agent, squads and invites live here. Older teams get the defaults, so they
 * become workspaces with no migration step.
 */
export const Team = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Shared vault folder name (relative to the vault root). */
  vault: z.string().default("default"),
  defaults: TeamDefaults.default({
    runtime: "mock",
    model: { id: "mock/standard" },
    costCapUsd: 1,
  }),
  /** What this workspace is for (shown on its Overview and given to the main agent). */
  goal: z.string().default(""),
  /** Which office this workspace opens in. */
  officeStyle: z.enum(OFFICE_STYLES).default("2d"),
  /** The workspace's main agent (an agent in the library). It plans, hands out work and combines the results. */
  mainAgentId: z.string().optional(),
  /** Start a plan as soon as the main agent proposes it (only within the cost cap; send and spend still ask). */
  autoRun: z.boolean().default(false),
  squads: z.array(Squad).default([]),
  /** People invited to this workspace only (hosted access). */
  access: z.array(WorkspaceInvite).default([]),
  /** Agent ids from the shared agent library (the sub-agents; the main agent is separate). */
  memberIds: z.array(z.string()).default([]),
  /**
   * Resolved members (filled by the server from the agent library when a team is read
   * or a run starts; a run snapshot keeps them). Not the source of truth for membership.
   */
  agents: z.array(AgentTemplate).default([]),
  /** Resolved skills used by the members (filled for runs, kept in the run snapshot). */
  skills: z.array(Skill).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Team = z.infer<typeof Team>;
export type TeamInput = z.input<typeof Team>;

/** Resolve an agent's effective runtime + model against team defaults. */
export function resolveAgent(team: Team, agent: AgentTemplate): {
  runtime: string;
  model: ModelRef;
} {
  return {
    runtime: agent.runtime || team.defaults.runtime,
    model: agent.model ?? team.defaults.model,
  };
}

/**
 * Active skills of an agent: global skills (unless the agent switched them off)
 * plus agent-scoped skills the agent has ticked and enabled.
 */
export function agentSkills(team: Team, agent: AgentTemplate): Skill[] {
  const refs = new Map(agent.skills.map((r) => [r.skillId, r.enabled]));
  return team.skills.filter((s) => (s.scope === "global" ? refs.get(s.id) !== false : refs.get(s.id) === true));
}
