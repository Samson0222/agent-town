"use client";
import { useEffect, useState } from "react";
import { api, errorText, formatUsd } from "@/lib/api";
import { PageHeader } from "./ui";

interface UsageRow {
  key: string;
  name?: string;
  usd: number;
  tokens: number;
  steps: number;
  runs: number;
  simulated?: boolean;
}
export interface Usage {
  days: number;
  totalUsd: number;
  runs: number;
  byDay: UsageRow[];
  byAgent: UsageRow[];
  byWorkflow: UsageRow[];
  byRuntime: UsageRow[];
}

export function useUsage(teamId?: string, days = 30) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Usage>(`/api/usage?days=${days}${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`)
      .then(setUsage)
      .catch((e) => setError(errorText(e)));
  }, [teamId, days]);
  return { usage, error };
}

/** Spending: last 30 days, by day, agent, workflow and runtime (from the step_runs table). */
export function UsageView({ teamId }: { teamId?: string }) {
  const { usage, error } = useUsage(teamId);
  const simulatedOnly = usage ? usage.byRuntime.every((r) => r.simulated) : false;
  const max = Math.max(0.000001, ...(usage?.byDay.map((d) => d.usd) ?? []));
  return (
    <div>
      <PageHeader title="Usage" />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {usage && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Last 30 days" value={formatUsd(usage.totalUsd)} note={simulatedOnly && usage.totalUsd > 0 ? "practice, not charged" : undefined} />
            <Tile label="Runs" value={String(usage.runs)} />
            <Tile label="Tokens" value={usage.byRuntime.reduce((n, r) => n + r.tokens, 0).toLocaleString()} />
          </div>
          <section className="panel p-5">
            <h2 className="section-title mb-4">By day</h2>
            {usage.byDay.length === 0 ? (
              <p className="muted text-sm">Nothing yet.</p>
            ) : (
              <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Cost per day">
                {usage.byDay.map((d) => (
                  <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${d.key}: ${formatUsd(d.usd)}`}>
                    <div className="w-full max-w-10 rounded-t" style={{ height: `${Math.max(3, (d.usd / max) * 110)}px`, background: "var(--accent)" }} />
                    <span className="muted text-[10px]">{d.key.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="grid gap-5 lg:grid-cols-3">
            <Table title="Agents" rows={usage.byAgent} />
            <Table title="Workflows" rows={usage.byWorkflow} />
            <Table title="Runtimes" rows={usage.byRuntime} />
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="panel p-4">
      <div className="muted text-xs">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {note && <div className="muted text-xs">{note}</div>}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: UsageRow[] }) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="section-title px-5 pb-2 pt-4">{title}</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t" style={{ borderColor: "var(--line)" }}>
              <td className="truncate px-5 py-2">{r.name ?? r.key}</td>
              <td className="muted px-2 py-2 text-right text-xs">{r.tokens.toLocaleString()}</td>
              <td className="px-5 py-2 text-right font-mono text-xs">{formatUsd(r.usd)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="muted px-5 py-3">—</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
