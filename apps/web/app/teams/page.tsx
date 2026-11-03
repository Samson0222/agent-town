"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Team } from "@agent-town/core";
import { ApiError, api, errorText } from "@/lib/api";

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  teamName: string;
}

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api<Team[]>("/api/teams"), api<TemplateInfo[]>("/api/templates")])
      .then(([t, tpl]) => {
        setTeams(t);
        setTemplates(tpl);
      })
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    try {
      const t = await api<Team>("/api/teams", { json: { name: name || "New team" } });
      router.push(`/teams/${t.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function clone(id: string) {
    await api(`/api/teams/${id}/clone`, { method: "POST" }).catch((e) => setError(errorText(e)));
    void load();
  }

  async function remove(t: Team) {
    if (!confirm(`Delete team "${t.name}"?`)) return;
    try {
      await api(`/api/teams/${t.id}`, { method: "DELETE" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const wfs = (e.details as { workflows: string[] }).workflows;
        if (confirm(`"${t.name}" is used by ${wfs.length} workflow(s): ${wfs.join(", ")}.\nDelete the team AND those workflows?`)) {
          await api(`/api/teams/${t.id}?force=1`, { method: "DELETE" });
        }
      } else setError(errorText(e));
    }
    void load();
  }

  async function fromTemplate(id: string) {
    try {
      const r = await api<{ team: Team }>(`/api/templates/${id}/instantiate`, { method: "POST" });
      router.push(`/teams/${r.team.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="panel p-4">
        <h1 className="mb-3 text-lg font-semibold">Teams</h1>
        <div className="mb-4 flex gap-2">
          <input className="input" placeholder="New team name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary shrink-0" onClick={create}>
            Create blank team
          </button>
        </div>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
          {teams.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <div className="flex -space-x-1">
                {t.agents.slice(0, 6).map((a) => (
                  <span key={a.id} title={`${a.name} — ${a.role}`} className="inline-block h-6 w-6 rounded-full border-2" style={{ background: a.appearance.color, borderColor: "var(--panel)" }} />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/teams/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                <div className="muted truncate text-xs">
                  {t.agents.length} agents · default runtime {t.defaults.runtime} · {t.description}
                </div>
              </div>
              <Link className="btn btn-sm" href={`/teams/${t.id}`}>
                Edit
              </Link>
              <button className="btn btn-sm" onClick={() => clone(t.id)}>
                Clone
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => remove(t)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
      <aside className="panel p-4">
        <h2 className="mb-1 font-semibold">Starter templates</h2>
        <p className="muted mb-3 text-xs">Examples only. Each creates an editable copy of a team and its workflow.</p>
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id}>
              <div className="text-sm font-medium">{t.name}</div>
              <div className="muted mb-1 text-xs">{t.description}</div>
              <button className="btn btn-sm" onClick={() => fromTemplate(t.id)}>
                Use template
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
