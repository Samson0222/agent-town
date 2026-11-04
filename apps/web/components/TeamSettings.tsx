"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Copy, Crown, Grid2x2, ShieldCheck, UsersRound, X, FolderInput, KeyRound, Plus, Radio, Save, Trash2, UserMinus, UserPlus } from "lucide-react";
import type { AgentTemplate, Team } from "@agent-town/core";
import { api, errorText, formatUsd, type RuntimeInfo } from "@/lib/api";
import { AgentStatusChip, Avatar } from "@/components/ui";
import { useMe } from "@/lib/me";
import { useReporters } from "@/lib/reporters";
import { useDialogs } from "@/components/Dialogs";

/**
 * A workspace's settings: what it's for, its office, its team (agents picked from the
 * shared Agents list, with the main agent above them), defaults and outside agents.
 */
export function TeamSettings({ id, onSaved }: { id: string; onSaved?: (t: Team) => void }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [library, setLibrary] = useState<AgentTemplate[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);

  const load = () =>
    Promise.all([api<Team>(`/api/teams/${id}`), api<AgentTemplate[]>("/api/agents"), api<RuntimeInfo[]>("/api/runtimes")])
      .then(([t, a, r]) => {
        setTeam(t);
        setLibrary(a);
        setRuntimes(r);
        setDirty(false);
      })
      .catch((e) => setMsg({ ok: false, text: errorText(e) }));
  useEffect(() => {
    void load();
  }, [id]);

  const byId = useMemo(() => new Map(library.map((a) => [a.id, a])), [library]);
  if (!team) return <p className="muted">{msg?.text ?? "Loading…"}</p>;
  const main = team.mainAgentId ? byId.get(team.mainAgentId) : undefined;
  const members = team.memberIds.map((m) => byId.get(m)).filter((a): a is AgentTemplate => !!a);
  const others = library.filter((a) => !team.memberIds.includes(a.id) && !(a as AgentTemplate & { mainOf?: string }).mainOf);
  const update = (patch: Partial<Team>) => {
    setTeam({ ...team, ...patch });
    setDirty(true);
  };
  const defaultModels = runtimes.find((r) => r.id === team.defaults.runtime)?.models ?? [];

  async function save(next = team!) {
    try {
      const saved = await api<Team>(`/api/teams/${id}`, { method: "PUT", json: { ...next, agents: [] } });
      setTeam(saved);
      onSaved?.(saved);
      setDirty(false);
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  /** Import Agent Factory role-template folders (format only — our own importer, no GPL code). */
  async function importFolder(list: FileList) {
    const byDir = new Map<string, Record<string, string>>();
    for (const f of Array.from(list)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const parts = rel.split("/");
      const name = parts.pop()!;
      if (!["template.json", "IDENTITY.md", "SOUL.md", "TOOLS.md"].includes(name)) continue;
      const dir = parts.join("/");
      const entry = byDir.get(dir) ?? {};
      entry[name] = await f.text();
      byDir.set(dir, entry);
    }
    const templates = [...byDir.values()].filter((e) => e["template.json"]);
    if (!templates.length) return setMsg({ ok: false, text: "No template.json found in that folder." });
    try {
      if (dirty) await save();
      const r = await api<{ team: Team; imported: Array<{ id: string; name: string; notes: string[] }> }>(`/api/teams/${id}/import/agent-factory`, { json: { templates } });
      await load();
      setMsg({ ok: true, text: `Imported ${r.imported.length} agent${r.imported.length > 1 ? "s" : ""}: ${r.imported.map((a) => a.name).join(", ")}` });
      setImportNotes([...new Set(r.imported.flatMap((a) => a.notes))]);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <button data-needs="edit" className="btn btn-primary ml-auto" onClick={() => save()} disabled={!dirty}>
          <Save size={16} /> {dirty ? "Save" : "Saved"}
        </button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.text}</span>}
      </div>

      <section className="panel grid gap-x-4 p-5 md:grid-cols-2">
        <label className="field">
          Name
          <input className="input" value={team.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <div className="field">
          Office
          <div className="flex gap-2" role="group" aria-label="Office style">
            {([
              ["2d", "2D office", Grid2x2],
              ["3d", "3D town", Box],
            ] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" className="btn btn-sm" aria-pressed={team.officeStyle === v} style={team.officeStyle === v ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined} onClick={() => update({ officeStyle: v })}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
        <label className="field md:col-span-2">
          Goal
          <textarea className="input" rows={2} value={team.goal} onChange={(e) => update({ goal: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={team.autoRun} onChange={(e) => update({ autoRun: e.target.checked })} />
          Run plans automatically
          <span className="muted">· up to the {formatUsd(team.defaults.costCapUsd)} cost cap; sending and spending still ask</span>
        </label>
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Team</h2>
          <span className="muted text-sm">· {members.length}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => setPicking(!picking)} disabled={!others.length}>
              <UserPlus size={14} /> Add from Agents
            </button>
            <Link className="btn btn-sm" href={`/agents/new?team=${encodeURIComponent(team.id)}`}>
              <Plus size={14} /> New agent
            </Link>
            <button className="btn btn-sm btn-ghost" title="Import Agent Factory role templates (template.json + IDENTITY.md / SOUL.md)" onClick={() => folderRef.current?.click()}>
              <FolderInput size={14} /> Import
            </button>
            <input
              ref={folderRef}
              type="file"
              hidden
              multiple
              // @ts-expect-error non-standard but widely supported folder picker
              webkitdirectory=""
              onChange={(e) => {
                if (e.target.files?.length) void importFolder(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        {importNotes.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-lg p-2 text-xs" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
            {importNotes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}
        {picking && (
          <div className="mb-4 rounded-xl p-3" style={{ background: "var(--panel-2)" }}>
            <div className="hint mb-2">Click to add to {team.name}:</div>
            <div className="flex flex-wrap gap-2">
              {others.map((a) => (
                <button
                  key={a.id}
                  className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--line)", background: "var(--panel)" }}
                  onClick={() => update({ memberIds: [...team.memberIds, a.id] })}
                >
                  <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={26} /> {a.name}
                  <span className="muted text-xs">{a.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {members.length === 0 && <p className="muted mb-3 text-sm">No members yet. Add agents from the shared list or create a new one.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {main && (
            <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--accent)" }}>
              <Avatar name={main.name} color={main.appearance.color} sprite={main.appearance.sprite} size={44} />
              <Link href={`/agents/${encodeURIComponent(main.id)}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold hover:underline">{main.name}</div>
                <div className="muted flex items-center gap-1 truncate text-xs">
                  <Crown size={12} /> Main agent
                </div>
              </Link>
            </div>
          )}
          {members.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
              <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={44} />
              <Link href={`/agents/${encodeURIComponent(a.id)}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold hover:underline">{a.name}</div>
                <div className="muted truncate text-xs">{a.role}</div>
              </Link>
              <button className="btn btn-ghost btn-icon" title="Remove from team (stays in Agents)" onClick={() => update({ memberIds: team.memberIds.filter((m) => m !== a.id) })}>
                <UserMinus size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel grid gap-x-4 p-5 md:grid-cols-3">
        <h2 className="mb-3 font-semibold md:col-span-3">Defaults</h2>
        <label className="field md:col-span-2">
          Description
          <input className="input" value={team.description} onChange={(e) => update({ description: e.target.value })} />
        </label>
        <label className="field">
          Vault folder <span className="hint">(where outputs are saved)</span>
          <input className="input" value={team.vault} onChange={(e) => update({ vault: e.target.value })} />
        </label>
        <label className="field">
          Default runtime
          <select className="input" value={team.defaults.runtime} onChange={(e) => update({ defaults: { ...team.defaults, runtime: e.target.value } })}>
            {runtimes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.spendsCredit ? " (spends credit)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Default model
          <input className="input font-mono" list="team-models" value={team.defaults.model.id} onChange={(e) => update({ defaults: { ...team.defaults, model: { ...team.defaults.model, id: e.target.value } } })} />
          <datalist id="team-models">
            {defaultModels.map((m) => (
              <option key={m.id} value={m.id} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Run cost cap (USD)
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={team.defaults.costCapUsd}
            onChange={(e) => update({ defaults: { ...team.defaults, costCapUsd: Number(e.target.value) } })}
          />
        </label>
      </section>

      <Squads team={team} members={members} update={update} />

      <WorkspacePeople team={team} update={update} />

      <OutsideAgents teamId={team.id} />
    </div>
  );
}

/**
 * Agents that run outside Agent Town (Codex, other bots, scripts) and report their status
 * into this team's office. Owner only; each gets a token that is shown once.
 */
function OutsideAgents({ teamId }: { teamId: string }) {
  const { me } = useMe();
  const { confirm } = useDialogs();
  const list = useReporters(teamId, 4000);
  const [name, setName] = useState("");
  const [look, setLook] = useState(0);
  const [shown, setShown] = useState<{ name: string; token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (me && me.role !== "owner") return null;

  const add = async () => {
    setErr(null);
    try {
      const r = await api<{ reporter: { name: string }; token: string }>(`/api/teams/${encodeURIComponent(teamId)}/reporters`, { json: { name, sprite: `char-${look}`, color: COLORS[look % COLORS.length] } });
      setShown({ name: r.reporter.name, token: r.token });
      setName("");
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const rotate = async (id: string, botName: string) => {
    if (!(await confirm({ title: `New token for ${botName}?`, message: "The old token stops working straight away.", confirmLabel: "Make new token" }))) return;
    const r = await api<{ token: string }>(`/api/reporters/${encodeURIComponent(id)}/token`, { method: "POST" });
    setShown({ name: botName, token: r.token });
  };
  const remove = async (id: string, botName: string) => {
    if (!(await confirm({ title: `Remove ${botName}?`, message: "It leaves the office and its token stops working.", confirmLabel: "Remove", danger: true }))) return;
    await api(`/api/reporters/${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Radio size={16} /> Outside agents
      </h2>
      <p className="muted mb-4 text-sm">Bots that run elsewhere and report what they&apos;re doing into this office. Task types only, never accounts, messages or amounts.</p>
      <ul className="mb-4 space-y-1.5">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl p-2" style={{ background: "var(--panel-2)" }}>
            <Avatar name={r.name} color={r.color} sprite={r.sprite} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{r.name}</div>
              <div className="muted truncate text-xs">{r.summary ?? (r.reportedAt ? "—" : "No reports yet")}</div>
            </div>
            <AgentStatusChip status={r.status} />
            <button className="btn btn-ghost btn-icon" onClick={() => rotate(r.id, r.name)} aria-label={`New token for ${r.name}`} title="New token">
              <KeyRound size={15} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => remove(r.id, r.name)} aria-label={`Remove ${r.name}`}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <input className="input max-w-64" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Codex on my Mac" aria-label="Name" />
        <div className="flex gap-1" role="group" aria-label="Look">
          {Array.from({ length: 6 }, (_, i) => (
            <button key={i} type="button" onClick={() => setLook(i)} aria-label={`Look ${i + 1}`} className="rounded-lg p-0.5" style={{ outline: look === i ? "2px solid var(--accent)" : undefined }}>
              <Avatar name={name || "?"} color={COLORS[i % COLORS.length]!} sprite={`char-${i}`} size={28} />
            </button>
          ))}
        </div>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={add}>
          <Plus size={16} /> Add
        </button>
      </div>
      {err && <p className="mt-2 text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
      {shown && <TokenOnce name={shown.name} token={shown.token} onClose={() => setShown(null)} />}
    </section>
  );
}

const COLORS = ["#2a9d8f", "#e76f51", "#4f86f7", "#9b5de5", "#e9c46a", "#f15bb5"];

function TokenOnce({ name, token, onClose }: { name: string; token: string; onClose: () => void }) {
  const cmd = `$env:AGENT_TOWN_BOT_TOKEN = "${token}"\nnode scripts/agent-town-report.mjs coding "Writing the weekly report"`;
  return (
    <div className="mt-4 space-y-2 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }}>
      <div className="font-semibold">Token for {name}: copy it now, it won&apos;t be shown again.</div>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 font-mono text-xs" style={{ background: "var(--panel)" }}>
          {token}
        </code>
        <button className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(token)}>
          <Copy size={14} /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg p-2 font-mono text-xs" style={{ background: "var(--panel)" }}>
        {cmd}
      </pre>
      <p className="muted text-xs">From another device, also set AGENT_TOWN_URL=https://agents.devsam.my and a Cloudflare service token (CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET). See docs/hosting-setup.md.</p>
      <button className="btn btn-sm" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

/** Squads: named groups inside the team, each with a lead. The main agent can give a step to a whole squad. */
function Squads({ team, members, update }: { team: Team; members: AgentTemplate[]; update: (p: Partial<Team>) => void }) {
  const set = (squads: Team["squads"]) => update({ squads });
  const add = () => {
    const n = team.squads.length + 1;
    let id = `squad-${n}`;
    for (let i = n + 1; team.squads.some((q) => q.id === id); i++) id = `squad-${i}`;
    set([...team.squads, { id, name: `Squad ${n}`, leadId: "", memberIds: [] }]);
  };
  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <UsersRound size={16} /> Squads
        </h2>
        <button data-needs="edit" className="btn btn-sm ml-auto" onClick={add} disabled={members.length === 0}>
          <Plus size={14} /> New squad
        </button>
      </div>
      {team.squads.length === 0 && <p className="muted text-sm">None yet.</p>}
      <div className="space-y-3">
        {team.squads.map((q, i) => {
          const patch = (p: Partial<(typeof team.squads)[number]>) => set(team.squads.map((x, k) => (k === i ? { ...x, ...p } : x)));
          return (
            <div key={q.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input className="input !h-9 max-w-56" value={q.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Squad name" />
                <label className="muted flex items-center gap-2 text-sm">
                  Lead
                  <select className="input !h-9" value={q.leadId} onChange={(e) => patch({ leadId: e.target.value })}>
                    <option value="">—</option>
                    {members
                      .filter((a) => q.memberIds.includes(a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="btn btn-ghost btn-icon ml-auto" aria-label={`Remove ${q.name}`} onClick={() => set(team.squads.filter((_, k) => k !== i))}>
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {members.map((a) => {
                  const on = q.memberIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      aria-pressed={on}
                      className="flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs"
                      style={{ borderColor: on ? "var(--accent)" : "var(--line)", background: on ? "var(--accent-soft)" : "var(--panel)" }}
                      onClick={() => {
                        const memberIds = on ? q.memberIds.filter((m) => m !== a.id) : [...q.memberIds, a.id];
                        patch({ memberIds, leadId: memberIds.includes(q.leadId) ? q.leadId : (memberIds[0] ?? "") });
                      }}
                    >
                      <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={22} /> {a.name}
                      {q.leadId === a.id && <Crown size={11} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Who else can open this workspace (hosted access). Owner only. */
function WorkspacePeople({ team, update }: { team: Team; update: (p: Partial<Team>) => void }) {
  const { me } = useMe();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("viewer");
  const [budget, setBudget] = useState(0);
  if (!me || me.role !== "owner") return null;
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && !team.access.some((a) => a.email === email.trim().toLowerCase());
  const add = () => {
    update({ access: [...team.access, { email: email.trim().toLowerCase(), role, ...(role === "operator" ? { dailyBudgetUsd: budget } : {}) }] });
    setEmail("");
  };
  return (
    <section className="panel p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <ShieldCheck size={16} /> People
      </h2>
      <ul className="mb-3 space-y-1.5">
        {team.access.map((a, i) => (
          <li key={a.email} className="flex flex-wrap items-center gap-2 rounded-xl p-2 text-sm" style={{ background: "var(--panel-2)" }}>
            <span className="min-w-0 flex-1 truncate">{a.email}</span>
            <select
              className="input !h-8 !w-auto"
              value={a.role}
              aria-label={`Role for ${a.email}`}
              onChange={(e) => update({ access: team.access.map((x, k) => (k === i ? { ...x, role: e.target.value as "operator" | "viewer" } : x)) })}
            >
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
            </select>
            {a.role === "operator" && (
              <label className="muted flex items-center gap-1 text-xs">
                $/day
                <input
                  className="input !h-8 w-20"
                  type="number"
                  min={0}
                  step="0.5"
                  value={a.dailyBudgetUsd ?? 0}
                  onChange={(e) => update({ access: team.access.map((x, k) => (k === i ? { ...x, dailyBudgetUsd: Number(e.target.value) } : x)) })}
                />
              </label>
            )}
            <button className="btn btn-ghost btn-icon" aria-label={`Remove ${a.email}`} onClick={() => update({ access: team.access.filter((_, k) => k !== i) })}>
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-64" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value as "operator" | "viewer")} aria-label="Role">
          <option value="viewer">Viewer</option>
          <option value="operator">Operator</option>
        </select>
        {role === "operator" && (
          <label className="muted flex items-center gap-1 text-xs">
            $/day
            <input className="input w-20" type="number" min={0} step="0.5" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </label>
        )}
        <button className="btn" disabled={!valid} onClick={add}>
          <UserPlus size={15} /> Invite
        </button>
      </div>
      {me.hosted && <p className="muted mt-2 text-xs">Also add their email to the Cloudflare Access policy.</p>}
    </section>
  );
}
