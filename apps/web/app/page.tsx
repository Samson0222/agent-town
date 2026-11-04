"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Box, Grid2x2, LayoutGrid, Plus } from "lucide-react";
import { api, errorText, type RunRow } from "@/lib/api";
import { useWorkspaces, wsPath } from "@/lib/workspace";
import { Avatar, EmptyState, PageHeader, RunStatusChip, timeAgo } from "@/components/ui";

/** Where everyone starts: your workspaces, and a way to make a new one. */
export default function WorkspacesPage() {
  const { workspaces } = useWorkspaces();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<RunRow[]>("/api/runs?limit=200")
      .then(setRuns)
      .catch((e) => setError(`Can't reach the Agent Town server. Is \`npm run dev\` running? (${errorText(e)})`));
  }, []);

  return (
    <div>
      <PageHeader
        title="Workspaces"
        actions={
          <Link data-needs="edit" href="/workspaces/new" className="btn btn-primary">
            <Plus size={16} /> New workspace
          </Link>
        }
      />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {workspaces && workspaces.length === 0 && (
        <div className="panel">
          <EmptyState icon={<LayoutGrid size={22} />} title="No workspaces yet">
            <Link href="/workspaces/new" className="underline">
              Create your first one
            </Link>
          </EmptyState>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(workspaces ?? []).map((w) => {
          const last = runs.find((r) => r.teamId === w.id);
          const main = w.agents.find((a) => a.id === w.mainAgentId);
          const team = w.agents.filter((a) => a.id !== w.mainAgentId);
          return (
            <Link key={w.id} href={wsPath(w.id, "agent")} className="panel flex flex-col gap-3 p-5 transition hover:border-[var(--accent)]">
              <div className="flex items-start gap-3">
                {main && <Avatar name={main.name} color={main.appearance.color} sprite={main.appearance.sprite} size={40} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-semibold">{w.name}</div>
                  <p className="muted line-clamp-2 text-sm">{w.goal || w.description}</p>
                </div>
                <span className="muted shrink-0" title={w.officeStyle === "3d" ? "3D town" : "2D office"}>
                  {w.officeStyle === "3d" ? <Box size={16} /> : <Grid2x2 size={16} />}
                </span>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <div className="flex -space-x-2">
                  {team.slice(0, 7).map((a) => (
                    <Avatar key={a.id} name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={26} ring="transparent" />
                  ))}
                </div>
                {last && (
                  <span className="muted ml-auto flex items-center gap-2 text-xs">
                    {timeAgo(last.createdAt)} <RunStatusChip status={last.status} />
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
