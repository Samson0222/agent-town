"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Team, Workflow } from "@agent-town/core";
import { api, download, errorText } from "@/lib/api";

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [importTeam, setImportTeam] = useState("");
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

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? `${id} (missing)`;

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
      const q = importTeam ? `?teamId=${encodeURIComponent(importTeam)}` : "";
      const r = await api<{ workflow: Workflow }>(`/api/workflows/import${q}`, { json });
      router.push(`/workflows/${r.workflow.id}`);
    } catch (e) {
      setError(`Import failed: ${errorText(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h1 className="mb-3 text-lg font-semibold">Workflows</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="field mb-0 min-w-56 flex-1">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My workflow" />
          </label>
          <label className="field mb-0">
            Team
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={create} disabled={!teamId}>
            Start blank
          </button>
          <span className="mx-2 muted">or</span>
          <label className="field mb-0">
            Import into team
            <select className="input" value={importTeam} onChange={(e) => setImportTeam(e.target.value)}>
              <option value="">(team named in the file)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON…
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section className="panel p-4">
        <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
          {workflows.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/workflows/${w.id}`} className="font-medium hover:underline">
                  {w.name}
                </Link>
                <div className="muted truncate text-xs">
                  {teamName(w.teamId)} · {w.nodes.length} nodes · rev {w.revision} · {w.description}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => download(`${w.id}.workflow.json`, JSON.stringify(w, null, 2))}>
                Export
              </button>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  await api(`/api/workflows/${w.id}/clone`, { method: "POST" }).catch((e) => setError(errorText(e)));
                  void load();
                }}
              >
                Clone
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={async () => {
                  if (!confirm(`Delete workflow "${w.name}"?`)) return;
                  await api(`/api/workflows/${w.id}`, { method: "DELETE" }).catch((e) => setError(errorText(e)));
                  void load();
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
