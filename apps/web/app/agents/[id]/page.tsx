"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, Clock, Copy, Cpu, Globe, Loader2, Save, Sparkles, Trash2, Users, Workflow as WorkflowIcon } from "lucide-react";
import type { AgentTemplate, Skill } from "@agent-town/core";
import { api, errorText, formatUsd, type RuntimeInfo, type ToolInfo } from "@/lib/api";
import { AgentForm } from "@/components/AgentForm";
import { Avatar, RunStatusChip, timeAgo } from "@/components/ui";
import { useDialogs } from "@/components/Dialogs";

interface StepRow {
  run_id: string;
  node_id: string;
  attempt: number;
  status: string;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
  tokens: number;
  cost_usd: number;
  model?: string;
  runtime?: string;
  workflow_name: string;
  run_status: string;
}

type Tab = "overview" | "settings";

/** Agent page (layout follows Multica's agent detail: Overview with Now / Recent work, side card). */
export default function AgentDetailPage() {
  const { confirm } = useDialogs();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentTemplate | null>(null);
  const [draft, setDraft] = useState<AgentTemplate | null>(null);
  const [usage, setUsage] = useState<{ teams: Array<{ id: string; name: string }>; workflows: Array<{ id: string; name: string }> }>({ teams: [], workflows: [] });
  const [activity, setActivity] = useState<{ now: StepRow[]; recent: StepRow[] }>({ now: [], recent: [] });
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = () =>
      Promise.all([
        api<{ agent: AgentTemplate; teams: Array<{ id: string; name: string }>; workflows: Array<{ id: string; name: string }> }>(`/api/agents/${encodeURIComponent(id)}`),
        api<{ now: StepRow[]; recent: StepRow[] }>(`/api/agents/${encodeURIComponent(id)}/activity`),
      ])
        .then(([a, act]) => {
          setAgent(a.agent);
          setDraft((d) => d ?? a.agent);
          setUsage({ teams: a.teams, workflows: a.workflows });
          setActivity(act);
        })
        .catch((e) => setMsg({ ok: false, text: errorText(e) }));
    void load();
    Promise.all([api<RuntimeInfo[]>("/api/runtimes"), api<{ tools: ToolInfo[] }>("/api/connectors"), api<Skill[]>("/api/skills")])
      .then(([r, c, s]) => {
        setRuntimes(r);
        setTools(c.tools);
        setSkills(s);
      })
      .catch(() => undefined);
    const t = setInterval(() => void api<{ now: StepRow[]; recent: StepRow[] }>(`/api/agents/${encodeURIComponent(id)}/activity`).then(setActivity).catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, [id]);

  if (!agent || !draft) return <p className="muted">{msg?.text ?? "Loading…"}</p>;

  const refs = new Map(agent.skills.map((r) => [r.skillId, r.enabled]));
  const globalSkills = skills.filter((s) => s.scope === "global");
  const ownSkills = skills.filter((s) => s.scope !== "global" && refs.get(s.id) === true);
  const totalCost = activity.recent.concat(activity.now).reduce((n, r) => n + Number(r.cost_usd || 0), 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(agent);

  async function save() {
    setSaving(true);
    try {
      const a = await api<AgentTemplate>(`/api/agents/${encodeURIComponent(id)}`, { method: "PUT", json: draft });
      setAgent(a);
      setDraft(a);
      setMsg({ ok: true, text: "Saved. Teams using this agent get the change on their next step." });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/agents" className="muted flex items-center gap-1 text-sm">
        <ArrowLeft size={14} /> Agents
      </Link>
      <header className="flex flex-wrap items-start gap-4">
        <button type="button" className="group flex flex-col items-center gap-1" onClick={() => setTab("settings")} title="Change look">
          <Avatar name={agent.name} color={agent.appearance.color} sprite={agent.appearance.sprite} size={72} />
          <span className="muted text-xs group-hover:underline">Change look</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            {activity.now.length > 0 ? (
              <span className="chip" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                <span className="chip-dot pulse" /> Working · {activity.now.length}
              </span>
            ) : (
              <span className="chip" style={{ background: "var(--bg-soft)", color: "var(--muted)" }}>
                <span className="chip-dot" /> Idle
              </span>
            )}
          </div>
          <p className="ink-2 mt-0.5">{agent.role}</p>
          <p className="muted mt-1 max-w-2xl text-sm">{agent.description || "No description"}</p>
          <div className="muted mt-2 flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1">
              <Cpu size={13} /> {agent.runtime || "team default"}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Bot size={13} /> {agent.model?.id ?? "team default model"}
            </span>
            <span className="flex items-center gap-1">
              <Users size={13} /> {usage.teams.length} team{usage.teams.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={async () => {
              const c = await api<AgentTemplate>(`/api/agents/${encodeURIComponent(id)}/clone`, { method: "POST" });
              router.push(`/agents/${encodeURIComponent(c.id)}`);
            }}
          >
            <Copy size={15} /> Duplicate
          </button>
          <button data-needs="edit"
            className="btn btn-danger"
            onClick={async () => {
              if (!(await confirm({ title: `Delete ${agent.name}?`, message: "They will leave every team.", confirmLabel: "Delete", danger: true }))) return;
              try {
                await api(`/api/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
                router.push("/agents");
              } catch (e) {
                setMsg({ ok: false, text: errorText(e) });
              }
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="tabs">
        <button className="tab" data-active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className="tab" data-active={tab === "settings"} onClick={() => setTab("settings")}>
          Settings {dirty && "•"}
        </button>
      </div>
      {msg && <p className="text-sm" style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.text}</p>}

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="panel p-5">
              <h2 className="mb-2 font-semibold">
                Now <span className="muted text-xs font-normal">{activity.now.length ? "" : "· no active work"}</span>
              </h2>
              {activity.now.length === 0 ? (
                <p className="muted text-sm italic">{agent.name} isn&apos;t running anything right now.</p>
              ) : (
                <WorkList rows={activity.now} />
              )}
            </section>
            <section className="panel p-5">
              <h2 className="mb-2 font-semibold">
                Recent work <span className="muted text-xs font-normal">{activity.recent.length ? `· last ${activity.recent.length} steps` : "· nothing finished yet"}</span>
              </h2>
              {activity.recent.length === 0 ? <p className="muted text-sm italic">{agent.name} hasn&apos;t completed anything yet.</p> : <WorkList rows={activity.recent} />}
            </section>
            <section className="panel p-5">
              <h2 className="mb-2 font-semibold">Instructions</h2>
              <pre className="ink-2 whitespace-pre-wrap text-sm">{agent.systemPrompt || <span className="muted italic">None yet — add them under Settings.</span>}</pre>
            </section>
          </div>

          <aside className="panel h-fit space-y-5 p-5 text-sm">
            <div>
              <div className="section-title mb-2">Agent</div>
              <dl className="grid grid-cols-[90px_1fr] gap-y-1.5">
                <dt className="muted">Runtime</dt>
                <dd className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--ok)" }} /> {agent.runtime || "team default"}
                </dd>
                <dt className="muted">Model</dt>
                <dd className="truncate font-mono text-xs">{agent.model?.id ?? "team default"}</dd>
                <dt className="muted">Cost cap</dt>
                <dd>{agent.costCapUsd !== undefined ? formatUsd(agent.costCapUsd) : "—"}</dd>
                <dt className="muted">Spent</dt>
                <dd>{formatUsd(totalCost)}</dd>
              </dl>
            </div>
            <div>
              <div className="section-title mb-2 flex items-center justify-between">
                Skills <span className="muted">{globalSkills.filter((s) => refs.get(s.id) !== false).length + ownSkills.length}</span>
              </div>
              {globalSkills.length === 0 && ownSkills.length === 0 && <p className="muted">No skills assigned.</p>}
              <ul className="space-y-1">
                {globalSkills.map((s) => {
                  const off = refs.get(s.id) === false;
                  return (
                    <li key={s.id} className={`flex items-center gap-1.5 ${off ? "muted line-through" : ""}`}>
                      <Globe size={13} /> <Link href={`/skills/${encodeURIComponent(s.id)}`} className="hover:underline">{s.name}</Link>
                      <span className="muted text-[11px]">global{off ? " · off for this agent" : ""}</span>
                    </li>
                  );
                })}
                {ownSkills.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <Sparkles size={13} style={{ color: "var(--accent)" }} /> <Link href={`/skills/${encodeURIComponent(s.id)}`} className="hover:underline">{s.name}</Link>
                  </li>
                ))}
              </ul>
              <button className="btn btn-ghost btn-sm mt-2" onClick={() => setTab("settings")}>
                Manage skills
              </button>
            </div>
            <div>
              <div className="section-title mb-2">Teams</div>
              {usage.teams.length === 0 && <p className="muted">Not in a team yet.</p>}
              <ul className="space-y-1">
                {usage.teams.map((t) => (
                  <li key={t.id}>
                    <Link href={`/teams/${encodeURIComponent(t.id)}`} className="flex items-center gap-1.5 hover:underline">
                      <Users size={13} /> {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {usage.workflows.length > 0 && (
              <div>
                <div className="section-title mb-2">Steps in workflows</div>
                <ul className="space-y-1">
                  {usage.workflows.map((w) => (
                    <li key={w.id}>
                      <Link href={`/workflows/${encodeURIComponent(w.id)}`} className="flex items-center gap-1.5 hover:underline">
                        <WorkflowIcon size={13} /> {w.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="space-y-4">
          <AgentForm agent={draft} onChange={setDraft} runtimes={runtimes} tools={tools} skills={skills} />
          <div className="sticky bottom-4 flex justify-end gap-2">
            <button className="btn" disabled={!dirty} onClick={() => setDraft(agent)}>
              Discard
            </button>
            <button data-needs="edit" className="btn btn-primary" disabled={!dirty || saving || !draft.name.trim()} onClick={save}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkList({ rows }: { rows: StepRow[] }) {
  return (
    <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
      {rows.map((r) => (
        <li key={`${r.run_id}-${r.node_id}-${r.attempt}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
          <Link href={`/runs/${r.run_id}`} className="min-w-0 flex-1 hover:underline">
            <span className="font-medium">{r.node_id}</span>
            {r.attempt > 1 && <span className="muted"> · attempt {r.attempt}</span>}
            <span className="muted"> · {r.workflow_name}</span>
          </Link>
          <span className="muted flex items-center gap-1 text-xs">
            <Clock size={12} /> {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "…"}
          </span>
          <span className="muted font-mono text-xs">{r.tokens} tok</span>
          <RunStatusChip status={r.status === "running" ? "running" : r.status === "failed" ? "failed" : "completed"} />
          <span className="muted w-20 text-right text-xs">{timeAgo(r.started_at)}</span>
        </li>
      ))}
    </ul>
  );
}
