"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Plus, Sparkles } from "lucide-react";
import type { AgentTemplate } from "@agent-town/core";
import { api, errorText } from "@/lib/api";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";

type LibraryAgent = AgentTemplate & { teams: Array<{ id: string; name: string }> };

export default function AgentsPage() {
  const [agents, setAgents] = useState<LibraryAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<LibraryAgent[]>("/api/agents").then(setAgents).catch((e) => setError(errorText(e)));
  }, []);
  const shown = (agents ?? []).filter((a) => `${a.name} ${a.role} ${a.description}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Everyone who can work in your office. Create an agent once, then add it to any team."
        actions={
          <Link data-needs="edit" href="/agents/new" className="btn btn-primary">
            <Plus size={16} /> New agent
          </Link>
        }
      />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {agents && agents.length > 0 && <input className="input mb-4 max-w-sm" placeholder="Search agents…" value={q} onChange={(e) => setQ(e.target.value)} />}
      {agents && agents.length === 0 && (
        <div className="panel">
          <EmptyState icon={<Bot size={22} />} title="No agents yet">
            <Link href="/agents/new" className="underline">Create your first agent</Link>.
          </EmptyState>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((a) => (
          <Link key={a.id} href={`/agents/${encodeURIComponent(a.id)}`} className="panel flex gap-4 p-5 transition hover:border-[var(--accent)]">
            <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={52} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold">{a.name}</div>
              <div className="muted truncate text-sm">{a.role}</div>
              <p className="ink-2 mt-2 line-clamp-2 text-sm">{a.description || <span className="muted italic">No description</span>}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <span className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}>
                  <Bot size={12} /> {a.runtime || "team default"}
                </span>
                {a.skills.filter((s) => s.enabled).length > 0 && (
                  <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                    <Sparkles size={12} /> {a.skills.filter((s) => s.enabled).length} skills
                  </span>
                )}
                {a.teams.map((t) => (
                  <span key={t.id} className="chip" style={{ background: "var(--bg-soft)", color: "var(--muted)" }}>
                    {t.name}
                  </span>
                ))}
                {a.teams.length === 0 && <span className="chip" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>Not in a team</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
