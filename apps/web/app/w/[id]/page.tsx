"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { api, formatUsd, type RunRow } from "@/lib/api";
import { useInbox } from "@/lib/inbox";
import { useWorkspaces, wsPath } from "@/lib/workspace";
import { useUsage } from "@/components/UsageView";
import { Avatar, RunStatusChip, timeAgo } from "@/components/ui";

/** A workspace at a glance: its goal, its team, what needs you, recent results and spend. */
export default function WorkspaceOverview() {
  const { id } = useParams<{ id: string }>();
  const { current: ws } = useWorkspaces();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const { items } = useInbox(5000);
  const { usage } = useUsage(id);
  useEffect(() => {
    api<RunRow[]>(`/api/runs?limit=8&teamId=${encodeURIComponent(id)}`).then(setRuns).catch(() => undefined);
  }, [id]);
  if (!ws || ws.id !== id) return <p className="muted">Loading…</p>;
  const mine = (items ?? []).filter((i) => i.teamId === id);
  const main = ws.agents.find((a) => a.id === ws.mainAgentId);
  const team = ws.agents.filter((a) => a.id !== ws.mainAgentId);
  const live = runs.filter((r) => r.status === "running" || r.status === "paused");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{ws.name}</h1>
          {ws.goal && <p className="muted mt-1 max-w-2xl">{ws.goal}</p>}
        </div>
        <Link href={wsPath(id, "agent")} className="btn btn-primary">
          <Sparkles size={16} /> Ask {main?.name ?? "the main agent"}
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h2 className="section-title mb-3">Needs you</h2>
          {mine.length === 0 ? (
            <p className="muted text-sm">Nothing right now.</p>
          ) : (
            <ul className="space-y-2">
              {mine.map((i) => (
                <li key={i.id}>
                  <Link href={i.runId ? `/runs/${i.runId}` : wsPath(id, "agent")} className="flex items-center gap-2 rounded-lg p-2 hover:bg-[var(--bg-soft)]">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.title}</span>
                    <span className="muted text-xs">{timeAgo(i.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="section-title mb-3">Spend, last 30 days</h2>
          <div className="text-3xl font-bold">{formatUsd(usage?.totalUsd ?? 0)}</div>
          <div className="muted text-sm">
            {usage?.runs ?? 0} runs · cap {formatUsd(ws.defaults.costCapUsd)} per run
          </div>
          <Link href={wsPath(id, "usage")} className="btn btn-ghost btn-sm mt-3">
            Usage <ArrowRight size={14} />
          </Link>
        </section>

        <section className="panel p-5">
          <h2 className="section-title mb-3">Team</h2>
          <ul className="space-y-2">
            {[...(main ? [main] : []), ...team].map((a) => (
              <li key={a.id}>
                <Link href={`/agents/${encodeURIComponent(a.id)}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-[var(--bg-soft)]">
                  <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{a.name}</div>
                    <div className="muted truncate text-xs">{a.id === ws.mainAgentId ? "Main agent" : a.role}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {ws.squads.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ws.squads.map((s) => (
                <span key={s.id} className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}>
                  {s.name} · {s.memberIds.length}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="panel p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Recent results</h2>
            <Link href={wsPath(id, "runs")} className="btn btn-ghost btn-sm">
              All runs <ArrowRight size={14} />
            </Link>
          </div>
          {runs.length === 0 ? (
            <p className="muted text-sm">No runs yet.</p>
          ) : (
            <ul className="space-y-1">
              {[...live, ...runs.filter((r) => !live.includes(r))].map((r) => (
                <li key={r.id}>
                  <Link href={`/runs/${r.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-[var(--bg-soft)]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.workflowName}</div>
                      <div className="muted text-xs">{timeAgo(r.createdAt)}</div>
                    </div>
                    <span className="muted font-mono text-xs">{formatUsd(r.costUsd)}</span>
                    <RunStatusChip status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
