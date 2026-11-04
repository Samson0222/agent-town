import type { AgentStatus } from "../events";
import type { RunState } from "./reducer";

/**
 * What the office shows for each person. Every office view (2D or 3D) uses these
 * helpers, so they stay in step. Pure functions of the projected run state.
 */

export type OfficeActivity = "idle" | "thinking" | "coding" | "terminal" | "browsing" | "reading" | "working" | "needs-you" | "error" | "done";

export const ACTIVITY_LABEL: Record<OfficeActivity, string> = {
  idle: "Idle",
  thinking: "Thinking",
  coding: "Coding",
  terminal: "Terminal",
  browsing: "Browsing",
  reading: "Reading",
  working: "Working",
  "needs-you": "Needs you",
  error: "Error",
  done: "Done",
};

/** Turn a status plus the tool in use into one of the office activities. */
export function officeActivity(status: AgentStatus, tool?: string): OfficeActivity {
  switch (status) {
    case "thinking":
      return "thinking";
    case "waiting-for-human":
      return "needs-you";
    case "failed":
      return "error";
    case "done":
      return "done";
    case "idle":
      return "idle";
    case "working":
      return toolActivity(tool);
  }
}

function toolActivity(tool?: string): OfficeActivity {
  if (!tool) return "working";
  const t = tool.toLowerCase();
  if (/shell|bash|terminal|exec|command|run_?cmd|powershell/.test(t)) return "terminal";
  if (/web|fetch|browse|http|url|internet/.test(t)) return "browsing";
  if (/read|grep|glob|search|list|find|get|view/.test(t)) return "reading";
  if (/write|edit|patch|apply|create|code|save|update/.test(t)) return "coding";
  return "working";
}

/**
 * Pairs of agents that are meeting: an agent is working on something handed to it
 * by a teammate whose own work is waiting in review (e.g. a reviewer checking a
 * writer's draft). Each agent is in at most one meeting.
 */
export function officeMeetings(s: RunState): Array<[string, string]> {
  if (runEnded(s)) return [];
  const busy = new Set<string>();
  const out: Array<[string, string]> = [];
  const inReview = new Set(Object.values(s.tasks).filter((t) => t.stage === "review" && t.assignee).map((t) => t.assignee!));
  for (const id of s.agentOrder) {
    const a = s.agents[id];
    const other = a?.collaborator;
    if (!a || !other || other === id || busy.has(id) || busy.has(other)) continue;
    if (a.status !== "working" && a.status !== "thinking") continue;
    const b = s.agents[other];
    if (!b || b.status === "working" || b.status === "thinking" || b.status === "waiting-for-human") continue;
    if (!inReview.has(other)) continue;
    out.push([id, other]);
    busy.add(id).add(other);
  }
  return out;
}

/** True when every agent in the run uses the practice runtime (no real model calls). */
export function isSimulatedRun(s: RunState, practiceRuntime = "mock"): boolean {
  const agents = Object.values(s.agents);
  return agents.length > 0 && agents.every((a) => a.runtime === practiceRuntime);
}

/** Once a run has ended nobody is still working on it, whatever their last step event said. */
export function runEnded(s: RunState): boolean {
  return s.status === "completed" || s.status === "failed" || s.status === "stopped";
}

/** The status the office shows: someone left mid-step by a stopped or failed run is shown as idle. */
export function officeStatus(s: RunState, status: AgentStatus): AgentStatus {
  if (!runEnded(s)) return status;
  return status === "thinking" || status === "working" || status === "waiting-for-human" ? "idle" : status;
}
