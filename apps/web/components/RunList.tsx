"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api, errorText, formatUsd, type RunRow } from "@/lib/api";
import { useInbox } from "@/lib/inbox";
import { EmptyState, PageHeader, RunStatusChip, timeAgo } from "./ui";

type Row = RunRow & { inputs?: Record<string, string> };

/** Runs grouped the way you scan them: Needs you · Running · Finished. */
export function RunList({ teamId }: { teamId?: string }) {
  const [runs, setRuns] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { items } = useInbox(5000);
  useEffect(() => {
    const load = () =>
      api<Row[]>(`/api/runs?limit=200${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`)
        .then(setRuns)
        .catch((e) => setError(errorText(e)));
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [teamId]);

  const waiting = new Set((items ?? []).filter((i) => i.kind === "approval").map((i) => i.runId));
  const live = (r: Row) => r.status === "running" || r.status === "paused" || r.status === "pending";
  const groups: Array<[string, Row[]]> = [
    ["Needs you", (runs ?? []).filter((r) => live(r) && (waiting.has(r.id) || r.status === "paused"))],
    ["Running", (runs ?? []).filter((r) => live(r) && !waiting.has(r.id) && r.status !== "paused")],
    ["Finished", (runs ?? []).filter((r) => !live(r))],
  ];

  return (
    <div>
      <PageHeader title="Runs" />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {runs && runs.length === 0 && (
        <div className="panel">
          <EmptyState icon={<History size={22} />} title="No runs yet" />
        </div>
      )}
      <div className="space-y-6">
        {groups
          .filter(([, rows]) => rows.length)
          .map(([title, rows]) => (
            <section key={title}>
              <h2 className="section-title mb-2">
                {title} <span className="muted font-normal">{rows.length}</span>
              </h2>
              <div className="panel overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t first:border-t-0 hover:bg-[var(--panel-2)]" style={{ borderColor: "var(--line)" }}>
                        <td className="px-5 py-3">
                          <Link href={`/runs/${r.id}`} className="font-medium hover:underline">
                            {r.workflowName}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <RunStatusChip status={r.status} />
                        </td>
                        <td className="muted hidden max-w-md truncate px-5 py-3 md:table-cell">{Object.values(r.inputs ?? {})[0] ?? ""}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs">{formatUsd(r.costUsd)}</td>
                        <td className="muted px-5 py-3 text-right text-xs">{timeAgo(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
