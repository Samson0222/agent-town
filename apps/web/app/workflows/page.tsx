"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, Pencil, Plus, Trash2, Upload, Workflow as WorkflowIcon } from "lucide-react";
import type { Team, Workflow } from "@agent-town/core";
import { api, download, errorText } from "@/lib/api";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { NODE_META } from "@/components/FlowGraph";

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    Promise.all([api<Workflow[]>("/api/workflows"), api<Team[]>("/api/teams")])
      .then(([w, t]) => {
        setWorkflows(w);
        setTeams(t);
        setTeamId((cur) => cur || t[0]?.id || "");
      })
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    try {
      const wf = await api<Workflow>("/api/workflows", { json: { name: name || "Untitled workflow", teamId } });
      router.push(`/workflows/${wf.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function onImport(file: File) {
    setError(null);
    try {
      const json = JSON.parse(await file.text());
      const r = await api<{ workflow: Workflow }>(`/api/workflows/import${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`, { json });
      router.push(`/workflows/${r.workflow.id}`);
    } catch (e) {
      setError(`Import failed: ${errorText(e)}`);
    }
  }

  return (
    <div>
      <PageHeader
        title="Workflows"
        subtitle="A workflow is the plan your team follows: steps, decisions, approvals. Draw it in the builder; it's saved as JSON."
        actions={
          <>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Import JSON
            </button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New workflow
            </button>
          </>
        }
      />
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}

      {creating && (
        <section className="panel mb-6 flex flex-wrap items-end gap-3 p-5">
          <label className="field !mb-0 min-w-64 flex-1">
            Name
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly newsletter" />
          </label>
          <label className="field !mb-0">
            Team that runs it
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={create} disabled={!teamId}>
            Create &amp; open builder
          </button>
          <button className="btn btn-ghost" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </section>
      )}

      {workflows && workflows.length === 0 && (
        <div className="panel">
          <EmptyState icon={<WorkflowIcon size={22} />} title="No workflows yet">
            Create one, import a JSON file, or start from a template on the Teams page.
          </EmptyState>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(workflows ?? []).map((w) => {
          const team = teams.find((t) => t.id === w.teamId);
          const counts = w.nodes.reduce<Record<string, number>>((m, n) => ((m[n.type] = (m[n.type] ?? 0) + 1), m), {});
          return (
            <div key={w.id} className="panel flex flex-col p-5">
              <Link href={`/workflows/${w.id}`} className="truncate text-lg font-semibold hover:underline">
                {w.name}
              </Link>
              <p className="muted mb-3 line-clamp-2 text-sm">{w.description || "No description"}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {Object.entries(counts).map(([type, c]) => {
                  const m = NODE_META[type as keyof typeof NODE_META];
                  return (
                    <span key={type} className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}>
                      {m.icon} {c} {m.name.toLowerCase()}
                    </span>
                  );
                })}
              </div>
              <div className="muted mb-4 mt-auto flex items-center gap-2 text-xs">
                <div className="flex -space-x-1.5">
                  {team?.agents.slice(0, 5).map((a) => (
                    <Avatar key={a.id} name={a.name} color={a.appearance.color} size={20} />
                  ))}
                </div>
                {team?.name ?? `${w.teamId} (missing team)`} · rev {w.revision}
              </div>
              <div className="flex gap-2">
                <Link className="btn btn-sm flex-1" href={`/workflows/${w.id}`}>
                  <Pencil size={14} /> Open builder
                </Link>
                <button className="btn btn-sm" title="Export JSON" onClick={() => download(`${w.id}.workflow.json`, JSON.stringify(w, null, 2))}>
                  <Download size={14} />
                </button>
                <button
                  className="btn btn-sm"
                  title="Duplicate"
                  onClick={async () => {
                    await api(`/api/workflows/${w.id}/clone`, { method: "POST" }).catch((e) => setError(errorText(e)));
                    void load();
                  }}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  title="Delete"
                  onClick={async () => {
                    if (!confirm(`Delete workflow "${w.name}"?`)) return;
                    await api(`/api/workflows/${w.id}`, { method: "DELETE" }).catch((e) => setError(errorText(e)));
                    void load();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
