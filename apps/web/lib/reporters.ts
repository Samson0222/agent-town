"use client";
import { useEffect, useState } from "react";
import type { AgentStatus } from "@agent-town/core";
import { api } from "./api";

/** An outside agent (Codex, another bot, a script) as the office sees it. Never includes its token. */
export interface Reporter {
  id: string;
  teamId: string;
  name: string;
  color: string;
  sprite: string;
  report: string;
  summary?: string;
  with?: string;
  reportedAt?: string;
  status: AgentStatus;
  tool?: string;
}

/** Outside agents of a team, refreshed every few seconds. */
export function useReporters(teamId: string | undefined, everyMs = 5000): Reporter[] {
  const [list, setList] = useState<Reporter[]>([]);
  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    const load = () =>
      api<Reporter[]>(`/api/teams/${encodeURIComponent(teamId)}/reporters`)
        .then((r) => alive && setList(r))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [teamId, everyMs]);
  return list;
}

/** Office people for outside agents ("ext:" ids keep them apart from team agents). */
export function reporterPeople(list: Reporter[]) {
  const ids = new Set(list.map((r) => r.id));
  return list.map((r) => ({
    id: `ext:${r.id}`,
    name: r.name,
    color: r.color,
    sprite: r.sprite,
    status: r.status,
    tool: r.tool,
    message: r.summary,
    meetWith: r.with && ids.has(r.with) ? `ext:${r.with}` : undefined,
  }));
}
