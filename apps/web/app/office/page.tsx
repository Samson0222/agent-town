"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Maximize2, Minimize2, Play, Users } from "lucide-react";
import type { AgentState, AgentStatus, Team } from "@agent-town/core";
import { Office, type OfficePerson } from "@/components/Office";
import { AGENT_STATUS, AgentStatusChip, Avatar, EmptyState, RunStatusChip } from "@/components/ui";
import { api, errorText, type RunRow } from "@/lib/api";
import { useRun } from "@/lib/useRun";

/**
 * The office is always open: every agent on the team is here, at their desk or
 * strolling. If the team has a run in progress, the office shows it live.
 */
export default function OfficePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([api<Team[]>("/api/teams"), api<RunRow[]>("/api/runs")])
        .then(([t, r]) => {
          setTeams(t);
          setRuns(r);
          setTeamId((cur) => {
            if (cur) return cur;
            try {
              const saved = localStorage.getItem("agent-town:office-team");
              if (saved && t.some((x) => x.id === saved)) return saved;
            } catch {}
            return r.find((x) => x.status === "running" || x.status === "paused")?.teamId ?? t[0]?.id ?? "";
          });
        })
        .catch((e) => setError(errorText(e)));
    void load();
    const timer = setInterval(() => void api<RunRow[]>("/api/runs").then(setRuns).catch(() => undefined), 5000);
    return () => clearInterval(timer);
  }, []);

  const team = teams.find((t) => t.id === teamId);
  const activeRun = runs.find((r) => r.teamId === teamId && (r.status === "running" || r.status === "paused"));

  const choose = (id: string) => {
    setTeamId(id);
    try {
      localStorage.setItem("agent-town:office-team", id);
    } catch {}
  };

  if (error) return <p style={{ color: "var(--bad)" }}>{error}</p>;
  if (teams.length === 0)
    return (
      <div className="panel m-8">
        <EmptyState icon={<Users size={22} />} title="Your office is empty">
          Create a team first. <Link href="/teams" className="underline">Go to Teams</Link>
        </EmptyState>
      </div>
    );

  const picker = (
    <select className="glass-select" value={teamId} onChange={(e) => choose(e.target.value)} aria-label="Team">
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
  if (!team) return null;
  return activeRun ? <LiveStage key={activeRun.id} team={team} run={activeRun} picker={picker} /> : <Stage key={team.id} team={team} picker={picker} />;
}

function LiveStage(props: { team: Team; run: RunRow; picker: React.ReactNode }) {
  const { state } = useRun(props.run.id);
  return <Stage {...props} state={state} />;
}

/** One full-screen stage: the office fills the page, everything else floats over it. */
function Stage({ team, run, picker, state }: { team: Team; run?: RunRow; picker: React.ReactNode; state?: ReturnType<typeof useRun>["state"] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(true);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  const live = state ? (state.agentOrder.map((a) => state.agents[a]!).filter(Boolean) as AgentState[]) : [];
  const people: OfficePerson[] = useMemo(
    () =>
      (live.length ? live : team.agents.map((a) => ({ id: a.id, name: a.name, color: a.appearance.color, status: "idle" as const, sprite: a.appearance.sprite }))).map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        status: a.status,
        tool: "currentTool" in a ? a.currentTool : undefined,
        message: "message" in a ? a.message : undefined,
        sprite: a.sprite,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, team, run],
  );
  const roleOf = (id: string) => team.agents.find((a) => a.id === id)?.role ?? "";
  const selectedAgent = team.agents.find((a) => a.id === selected);
  const count = (f: (s: AgentStatus) => boolean) => people.filter((p) => f(p.status)).length;
  const working = count((s) => s === "working" || s === "thinking");
  const needsYou = count((s) => s === "waiting-for-human");
  const idle = people.length - working - needsYou;

  return (
    <div ref={stageRef} className="relative h-full w-full overflow-hidden">
      <Office people={people} onAgentClick={setSelected} selectedId={selected} height="100%" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 md:p-4">
        <div className="flex items-start justify-between gap-3">
          {/* top-left: which team, what they're on, and the head count */}
          <div className="glass pointer-events-auto max-w-[min(440px,100%)] space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {picker}
              {run && state ? <RunStatusChip status={state.status === "pending" ? run.status : state.status} /> : <span className="muted text-xs">Nobody is working right now</span>}
            </div>
            {run && (
              <div className="text-sm">
                <span className="muted">Working on </span>
                <span className="font-semibold">{run.workflowName}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Stat n={working} label="Working" color="#60a5fa" />
              <Stat n={needsYou} label="Needs you" color="#fbbf24" />
              <Stat n={idle} label="Idle" color="#a1a1c0" />
            </div>
            <div className="flex flex-wrap gap-2">
              {run ? (
                <Link href={`/runs/${run.id}`} className="glass-btn">
                  Open run <ArrowRight size={14} />
                </Link>
              ) : (
                <Link href="/" className="glass-btn" style={{ background: "var(--accent)", borderColor: "transparent" }}>
                  <Play size={14} /> Give them work
                </Link>
              )}
              <button className="glass-btn" onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"}>
                {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {full ? "Exit" : "Full screen"}
              </button>
            </div>
          </div>

          {/* top-right: team roster */}
          <aside className="glass pointer-events-auto flex max-h-full w-[320px] max-w-[calc(100vw-1.5rem)] flex-col">
            <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setRosterOpen((o) => !o)} aria-expanded={rosterOpen}>
              <span className="text-sm font-bold">Team</span>
              <span className="muted flex items-center gap-2 text-xs">
                {people.length} agents {rosterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>
            {rosterOpen && (
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                {people.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(selected === p.id ? null : p.id)}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10"
                      style={{ background: selected === p.id ? "rgba(255,255,255,.14)" : undefined }}
                    >
                      <Avatar name={p.name} color={p.color} sprite={p.sprite} size={34} ring={p.status === "waiting-for-human" ? "#fbbf24" : undefined} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5 text-sm font-semibold">
                          {p.name} <span className="muted truncate text-[11px] font-normal">{roleOf(p.id)}</span>
                        </div>
                        <div className="muted truncate text-xs">{p.tool ? `🔧 ${p.tool}` : p.message ?? "Idle"}</div>
                      </div>
                      <AgentStatusChip status={p.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <div className="flex items-end justify-between gap-3">
          {/* bottom-left: legend */}
          <div className="glass pointer-events-auto hidden grid-cols-2 gap-x-5 gap-y-1.5 px-4 py-3 text-xs sm:grid">
            {(["working", "thinking", "waiting-for-human", "failed", "idle"] as AgentStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: AGENT_STATUS[s].fg }} />
                {AGENT_STATUS[s].label}
              </span>
            ))}
          </div>

          {/* bottom-right: selected agent */}
          {selectedAgent && (
            <div className="glass pointer-events-auto ml-auto w-[320px] max-w-full p-4 text-sm">
              <div className="font-semibold">{selectedAgent.name}</div>
              <div className="muted mb-3 text-xs">{selectedAgent.description || selectedAgent.role}</div>
              <Link className="glass-btn" href={`/agents/${encodeURIComponent(selectedAgent.id)}?team=${encodeURIComponent(team.id)}`}>
                Open profile <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.07)" }}>
      <div className="text-xl font-bold leading-none" style={{ color }}>
        {n}
      </div>
      <div className="muted mt-1 text-[11px]">{label}</div>
    </div>
  );
}
