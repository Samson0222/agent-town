import { AgentTemplate, Team } from "./team";
import type { Skill } from "./skill";
import type { Workflow, WorkflowNode } from "./workflow";

/**
 * Shared agent library helpers (Multica-style): agents live in one list and
 * teams reference them by id (Team.memberIds). The engine still receives a
 * Team with resolved `agents` (and the skills they use), so runs and their
 * snapshots are self-contained.
 */

/** Team with members (and their skills) filled in from the library. */
export function resolveTeam(team: Team, library: AgentTemplate[], skills: Skill[] = []): Team {
  const byId = new Map(library.map((a) => [a.id, a]));
  // The main agent sits in the office too, first in line.
  const ids = [...new Set([...(team.mainAgentId ? [team.mainAgentId] : []), ...team.memberIds])];
  const agents = ids.map((id) => byId.get(id)).filter((a): a is AgentTemplate => !!a);
  const used = new Set<string>();
  for (const a of agents) for (const r of a.skills) used.add(r.skillId);
  // Global skills (scope "global") apply to every agent unless switched off per agent.
  for (const s of skills) if (s.scope === "global") used.add(s.id);
  return Team.parse({ ...team, agents, skills: skills.filter((s) => used.has(s.id)) });
}

/** Replace agent ids referenced by a workflow (used by migrations and template copies). */
export function remapWorkflowAgents(wf: Workflow, map: Map<string, string>): Workflow {
  if (!map.size) return wf;
  const nodes = wf.nodes.map((n) => {
    const cfg = n.config as { agentId?: string };
    if (cfg && typeof cfg.agentId === "string" && map.has(cfg.agentId)) {
      return { ...n, config: { ...n.config, agentId: map.get(cfg.agentId)! } } as WorkflowNode;
    }
    return n;
  });
  return { ...wf, nodes };
}

export function sameAgent(a: AgentTemplate, b: AgentTemplate): boolean {
  return JSON.stringify(AgentTemplate.parse(a)) === JSON.stringify(AgentTemplate.parse(b));
}
