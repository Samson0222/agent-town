"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { History, Play } from "lucide-react";
import { api, errorText, formatUsd, type RunRow } from "@/lib/api";
import { EmptyState, PageHeader, RunStatusChip, timeAgo } from "@/components/ui";

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<RunRow[]>("/api/runs").then(setRuns).catch((e) => setError(errorText(e)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Runs"
        subtitle="Every run is saved with its full event log, so you can open it and replay it."
        actions={
          <Link href="/" className="btn btn-primary">
            <Play size={16} /> New run
          </Link>
        }
      />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      <section className="panel overflow-hidden">
        {runs && runs.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="No runs yet">
            Start one from the Start page.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="muted text-left text-xs" style={{ background: "var(--panel-2)" }}>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Goal</th>
                <th className="px-5 py-3 text-right font-medium">Cost</th>
                <th className="px-5 py-3 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id} className="border-t hover:bg-[var(--panel-2)]" style={{ borderColor: "var(--line)" }}>
                  <td className="px-5 py-3">
                    <Link href={`/runs/${r.id}`} className="font-medium hover:underline">
                      {r.workflowName}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <RunStatusChip status={r.status} />
                  </td>
                  <td className="muted max-w-md truncate px-5 py-3">{Object.values((r as RunRow & { inputs?: Record<string, string> }).inputs ?? {})[0] ?? ""}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{formatUsd(r.costUsd)}</td>
                  <td className="muted px-5 py-3 text-right text-xs">{timeAgo(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
