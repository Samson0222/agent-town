"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, LayoutTemplate, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { Team } from "@agent-town/core";
import { ApiError, api, errorText, formatUsd } from "@/lib/api";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  teamName: string;
}

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
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
    const name = prompt("Name your new team", "My team");
    if (!name) return;
    try {
      const t = await api<Team>("/api/teams", { json: { name } });
      router.push(`/teams/${t.id}`);
    } catch (e) {
      setError(errorText(e));
    }
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
    <div>
      <PageHeader
        title="Teams"
        subtitle="A team is a set of agents you design: role, instructions, model, tools and look."
        actions={
          <button className="btn btn-primary" onClick={create}>
            <Plus size={16} /> New team
          </button>
        }
      />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}

      {teams && teams.length === 0 && (
        <div className="panel mb-6">
          <EmptyState icon={<Users size={22} />} title="No teams yet">
            Create one from scratch, or start from a template below.
          </EmptyState>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(teams ?? []).map((t) => (
          <div key={t.id} className="panel flex flex-col p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/teams/${t.id}`} className="block truncate text-lg font-semibold hover:underline">
                  {t.name}
                </Link>
                <p className="muted line-clamp-2 text-sm">{t.description || "No description"}</p>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {t.agents.map((a) => (
                <span key={a.id} className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs" style={{ background: "var(--bg-soft)" }} title={a.role}>
                  <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={22} /> {a.name}
                </span>
              ))}
              {t.agents.length === 0 && <span className="muted text-xs">No agents yet</span>}
            </div>
            <div className="muted mb-4 mt-auto flex gap-4 text-xs">
              <span>{t.agents.length} agents</span>
              <span>runtime: {t.defaults.runtime}</span>
              <span>cap {formatUsd(t.defaults.costCapUsd)}</span>
            </div>
            <div className="flex gap-2">
              <Link className="btn btn-sm flex-1" href={`/teams/${t.id}`}>
                <Pencil size={14} /> Edit
              </Link>
              <button
                className="btn btn-sm"
                title="Duplicate"
                onClick={async () => {
                  await api(`/api/teams/${t.id}/clone`, { method: "POST" }).catch((e) => setError(errorText(e)));
                  void load();
                }}
              >
                <Copy size={14} />
              </button>
              <button className="btn btn-sm btn-danger" title="Delete" onClick={() => remove(t)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title mb-3 mt-10">Start from a template</h2>
      <p className="muted -mt-2 mb-4 text-sm">Examples only. Each one makes an editable copy of a team and its workflow.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {templates.map((t) => (
          <button key={t.id} onClick={() => fromTemplate(t.id)} className="panel flex flex-col gap-2 p-4 text-left transition hover:border-[var(--accent)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <LayoutTemplate size={18} />
            </span>
            <span className="font-semibold">{t.name}</span>
            <span className="muted line-clamp-3 text-xs">{t.description}</span>
            <span className="mt-auto pt-2 text-xs font-semibold" style={{ color: "var(--accent)" }}>
              Use template →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
