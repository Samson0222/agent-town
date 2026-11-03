"use client";
import { useEffect, useRef } from "react";
import { AgentTown, type AgentStatus as TownStatus, type EnvironmentId, type OfficeSize } from "@agent-town/office-renderer";
import type { AgentState, RunState, RunStatus, TaskStage } from "@agent-town/core";

/**
 * Office view — a thin wrapper around the vendored agent-town renderer
 * (packages/office-renderer, MIT, upstream rafapetter/agent-town).
 *
 * The renderer draws the room, characters, walking, bubbles and task items.
 * This wrapper is the boundary that keeps it honest:
 *  - `ambient: false` (our patch): no roaming / coffee breaks / random bubbles.
 *  - Every update comes from `reduceRunState(events)`: status, bubble text and
 *    task stage are pushed only when the projected state changes.
 *  - Agent Town statuses the library lacks are mapped here (e.g. waiting-for-human).
 */

const STAGE_MAP: Record<TaskStage, string> = { inbox: "todo", doing: "in_progress", review: "review", done: "done" };

export function toTownStatus(a: AgentState, runStatus: RunStatus, tool?: string): TownStatus {
  if (runStatus === "paused" && (a.status === "thinking" || a.status === "working")) return "paused";
  switch (a.status) {
    case "idle":
      return "idle";
    case "thinking":
      return "planning";
    case "working": {
      const m = `${tool ?? ""} ${a.message ?? ""}`.toLowerCase();
      if (/search|web/.test(m)) return "searching";
      if (/read/.test(m)) return "reading";
      if (/review|check/.test(m)) return "reviewing";
      if (/send|post|message/.test(m)) return "pushing";
      return "coding";
    }
    case "waiting-for-human":
      return "waiting_approval";
    case "done":
      return "success";
    case "failed":
      return "error";
  }
}

function bubbleFor(a: AgentState): string | null {
  if (a.status === "waiting-for-human") return "Waiting for you!";
  if (a.status === "failed") return a.message ? `Failed: ${a.message}`.slice(0, 60) : "Failed";
  if (a.message && (a.status === "thinking" || a.status === "working")) return a.message.slice(0, 60);
  return null;
}

/** Grid shape of each office size (width, height incl. the management row) — used to size the stage without letterboxing. */
export const OFFICE_ASPECT: Record<OfficeSize, number> = { small: 24 / 15, medium: 30 / 18, large: 38 / 22, wide: 46 / 20, xl: 54 / 24 };
export function officeSizeFor(agentCount: number): OfficeSize {
  return agentCount > 16 ? "large" : agentCount > 8 ? "medium" : "small";
}

export interface OfficeProps {
  state: RunState;
  agents: AgentState[];
  environment?: EnvironmentId;
  onAgentClick?: (id: string) => void;
  className?: string;
}

export const ENVIRONMENTS: Array<{ id: EnvironmentId; label: string; bg: string }> = [
  { id: "town", label: "Town", bg: "#24461f" },
  { id: "office", label: "Office", bg: "#3a2f26" },
  { id: "space_station", label: "Space station", bg: "#0e1529" },
  { id: "farm", label: "Farm", bg: "#2f4a1f" },
  { id: "hospital", label: "Lab", bg: "#2a3440" },
  { id: "rocket", label: "Rocket launch", bg: "#1d2433" },
  { id: "pirate_ship", label: "Pirate ship", bg: "#1b3550" },
];

export function Office({ state, agents, environment = "town", onAgentClick, className }: OfficeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const townRef = useRef<AgentTown | null>(null);
  const clickRef = useRef(onAgentClick);
  clickRef.current = onAgentClick;
  const last = useRef(new Map<string, string>());
  const tasksSeen = useRef(new Map<string, string>());

  const size = officeSizeFor(agents.length);

  // Create the renderer once per environment/size.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const town = new AgentTown({
      container: host,
      environment,
      officeSize: size,
      theme: "casual",
      settings: { ambient: false, particleDensity: "medium" },
      onAgentClick: (id) => clickRef.current?.(id),
    });
    townRef.current = town;
    last.current.clear();
    tasksSeen.current.clear();
    return () => {
      town.destroy();
      townRef.current = null;
    };
  }, [environment, size]);

  // Push projected state into the renderer (only what changed).
  useEffect(() => {
    const town = townRef.current;
    if (!town) return;
    const present = new Set(agents.map((a) => a.id));
    for (const a of agents) {
      if (!town.getAgent(a.id)) {
        town.addAgent({ id: a.id, name: a.name, role: a.role, team: a.department, status: "idle" });
        // Match the character's outfit to the agent's colour, so the town and the roster agree.
        const ch = town.getAgent(a.id);
        if (ch) ch.palette = { ...ch.palette, shirt: a.color };
      }
      const status = toTownStatus(a, state.status);
      const bubble = bubbleFor(a);
      const key = `${status}|${bubble ?? ""}`;
      if (last.current.get(a.id) !== key) {
        last.current.set(a.id, key);
        town.updateAgent(a.id, { status, message: bubble });
      }
    }
    for (const ag of town.getAgents()) if (!present.has(ag.id)) town.removeAgent(ag.id);

    for (const t of Object.values(state.tasks)) {
      const stage = STAGE_MAP[t.stage];
      const key = `${stage}|${t.assignee ?? ""}`;
      const prev = tasksSeen.current.get(t.id);
      if (prev === key) continue;
      const assignee = t.assignee ? state.agents[t.assignee] : undefined;
      if (prev === undefined) {
        town.addTask({ id: t.id, title: t.title, description: "", stage, priority: "medium", assigneeId: t.assignee, assigneeName: assignee?.name });
      } else {
        town.updateTask(t.id, { stage, assigneeId: t.assignee, assigneeName: assignee?.name });
      }
      tasksSeen.current.set(t.id, key);
    }
  }, [state, agents]);

  const bg = ENVIRONMENTS.find((e) => e.id === environment)?.bg ?? "#222";
  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: "100%", height: "100%", minHeight: 280, background: `radial-gradient(ellipse at center, ${bg} 0%, #0b0d18 140%)` }}
      aria-label="Office floor — click an agent to see their task, log and output"
    />
  );
}
