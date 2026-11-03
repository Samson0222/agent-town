"use client";
import type { AgentTownEvent, RunState, Team, Workflow } from "@agent-town/core";

export const API = process.env.NEXT_PUBLIC_AGENT_TOWN_API ?? "http://127.0.0.1:4317";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  const res = await fetch(API + path, {
    method: init?.method ?? (init?.json === undefined ? "GET" : "POST"),
    headers: init?.json === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.json === undefined ? undefined : JSON.stringify(init.json),
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText, body?.details);
  return body as T;
}

export interface RuntimeInfo {
  id: string;
  name: string;
  kind: string;
  capabilities: string[];
  spendsCredit: boolean;
  models: Array<{ id: string; name?: string }>;
}

export interface ToolInfo {
  id: string;
  name: string;
  connector: string;
  description: string;
  category: "read" | "write" | "send" | "spend";
}

export interface RunRow {
  id: string;
  workflowId: string;
  workflowName: string;
  teamId: string;
  status: string;
  costUsd: number;
  createdAt: string;
  endedAt?: string;
}

export interface PreflightResult {
  ok: boolean;
  issues: Array<{ level: "error" | "warning"; message: string; nodeId?: string }>;
}

export type RunDetail = {
  run: RunRow & { workflow: Workflow; team: Team };
  events: AgentTownEvent[];
  state: RunState;
  live: boolean;
  /** Run folder relative to the vault root, e.g. launch-team/04-OUTPUTS/2026-11-03-launch-brief-1a2b3c4d */
  vaultDir?: string;
};

export function formatUsd(n: number): string {
  if (n === 0) return "$0";
  return n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(3)}`;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.details as
      | { issues?: Array<{ level?: string; message: string }> }
      | Array<{ message: string; path?: unknown[] }>
      | undefined;
    if (Array.isArray(d)) return `${e.message}: ${d.slice(0, 3).map((i) => `${(i.path ?? []).join(".")} ${i.message}`).join("; ")}`;
    if (d && "issues" in d && d.issues) {
      return `${e.message}: ${d.issues.filter((i) => i.level !== "warning").map((i) => i.message).join("; ")}`;
    }
    return e.message;
  }
  return (e as Error)?.message ?? String(e);
}

export function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
