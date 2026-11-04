"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Play, Users } from "lucide-react";
import { isSimulatedRun, type AgentState, type Team } from "@agent-town/core";
import { Office, officePeople, type OfficePerson } from "@/components/Office";
import { AgentStatusChip, Avatar, EmptyState, RunStatusChip } from "@/components/ui";
import { api, errorText, type RunRow } from "@/lib/api";
import { useRun } from "@/lib/useRun";
import { reporterPeople, useReporters } from "@/lib/reporters";

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
      <div className="panel">
        <EmptyState icon={<Users size={22} />} title="Your office is empty">
          Create a team first. <Link href="/teams" className="underline">Go to Teams</Link>
        </EmptyState>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Office</h1>
          <p className="muted mt-1 text-sm">Your agents, always at work or around the office. Click someone to see what they're doing.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input !w-auto" value={teamId} onChange={(e) => choose(e.target.value)} aria-label="Team">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Link data-needs="run" href="/" className="btn btn-primary">
            <Play size={16} /> Give them work
          </Link>
        </div>
      </div>
      {team && (activeRun ? <LiveOffice key={activeRun.id} team={team} run={activeRun} /> : <IdleOffice key={team.id} team={team} />)}
    </div>
  );
}

function IdleOffice({ team }: { team: Team }) {
  const [selected, setSelected] = useState<string | null>(null);
  const reporters = useReporters(team.id);
  const outside = useMemo(() => reporterPeople(reporters), [reporters]);
  const people: OfficePerson[] = useMemo(
    () => [...team.agents.map((a) => ({ id: a.id, name: a.name, color: a.appearance.color, status: "idle" as const, sprite: a.appearance.sprite })), ...outside],
    [team, outside],
  );
  const agent = team.agents.find((a) => a.id === selected);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel self-start overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-3 text-sm" style={{ borderColor: "var(--line)" }}>
          <span className="font-semibold">{team.name}</span>
          <span className="muted">· nobody is working right now</span>
        </div>
        <Office people={people} onAgentClick={setSelected} selectedId={selected} height={520} />
      </section>
      <aside className="panel p-5">
        <div className="section-title mb-3">Team</div>
        <ul className="space-y-1.5">
          {team.agents.map((a) => (
            <li key={a.id}>
              <button onClick={() => setSelected(a.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--panel-2)]" style={{ background: selected === a.id ? "var(--accent-soft)" : undefined }}>
                <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="muted truncate text-xs">{a.role}</div>
                </div>
                <AgentStatusChip status="idle" />
              </button>
            </li>
          ))}
          {reporters.map((r) => (
            <li key={r.id}>
              <button onClick={() => setSelected(`ext:${r.id}`)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--panel-2)]" style={{ background: selected === `ext:${r.id}` ? "var(--accent-soft)" : undefined }}>
                <Avatar name={r.name} color={r.color} sprite={r.sprite} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="muted truncate text-xs">{r.summary ?? "—"}</div>
                </div>
                <AgentStatusChip status={r.status} />
              </button>
            </li>
          ))}
        </ul>
        {agent && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "var(--panel-2)" }}>
            <div className="font-semibold">{agent.name}</div>
            <div className="muted mb-2 text-xs">{agent.description || agent.role}</div>
            <Link className="btn btn-sm" href={`/agents/${encodeURIComponent(agent.id)}?team=${encodeURIComponent(team.id)}`}>
              Open profile <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

function LiveOffice({ team, run }: { team: Team; run: RunRow }) {
  const { state } = useRun(run.id);
  const [selected, setSelected] = useState<string | null>(null);
  const agents = useMemo(() => state.agentOrder.map((a) => state.agents[a]!).filter(Boolean) as AgentState[], [state]);
  const reporters = useReporters(team.id);
  const people: OfficePerson[] = useMemo(
    () => [
      ...(agents.length ? officePeople(state) : team.agents.map((a) => ({ id: a.id, name: a.name, color: a.appearance.color, status: "idle" as const, sprite: a.appearance.sprite }))),
      ...reporterPeople(reporters),
    ],
    [agents, state, team, reporters],
  );
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel self-start overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm" style={{ borderColor: "var(--line)" }}>
          <span className="font-semibold">{team.name}</span>
          <span className="muted">· working on</span>
          <span className="font-medium">{run.workflowName}</span>
          <RunStatusChip status={state.status === "pending" ? run.status : state.status} />
          <Link href={`/runs/${run.id}`} className="btn btn-sm ml-auto">
            Open run <ArrowRight size={14} />
          </Link>
        </div>
        <Office people={people} onAgentClick={setSelected} selectedId={selected} height={520} simulated={isSimulatedRun(state)} />
      </section>
      <aside className="panel p-5">
        <div className="section-title mb-3">Team</div>
        <ul className="space-y-1.5">
          {people.map((p) => (
            <li key={p.id}>
              <button onClick={() => setSelected(p.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--panel-2)]" style={{ background: selected === p.id ? "var(--accent-soft)" : undefined }}>
                <Avatar name={p.name} color={p.color} sprite={p.sprite} size={34} ring={p.status === "waiting-for-human" ? "var(--warn)" : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="muted truncate text-xs">{p.tool ? `🔧 ${p.tool}` : p.message ?? "—"}</div>
                </div>
                <AgentStatusChip status={p.status} />
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
