"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FolderInput, Plus, Save, UserMinus, UserPlus } from "lucide-react";
import type { AgentTemplate, Team } from "@agent-town/core";
import { api, errorText, type RuntimeInfo } from "@/lib/api";
import { Avatar } from "@/components/ui";

/** Team = a set of agents picked from the shared Agents list, plus a vault and defaults. */
export default function TeamEditor() {
  const { id } = useParams<{ id: string }>();
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
  const members = team.memberIds.map((m) => byId.get(m)).filter((a): a is AgentTemplate => !!a);
  const others = library.filter((a) => !team.memberIds.includes(a.id));
  const update = (patch: Partial<Team>) => {
    setTeam({ ...team, ...patch });
    setDirty(true);
  };
  const defaultModels = runtimes.find((r) => r.id === team.defaults.runtime)?.models ?? [];

  async function save(next = team!) {
    try {
      setTeam(await api<Team>(`/api/teams/${id}`, { method: "PUT", json: { ...next, agents: [] } }));
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
        <Link href="/teams" className="btn btn-ghost btn-icon" aria-label="Back to teams">
          <ArrowLeft size={18} />
        </Link>
        <input className="input max-w-sm !text-lg font-semibold" value={team.name} onChange={(e) => update({ name: e.target.value })} />
        <button data-needs="edit" className="btn btn-primary" onClick={() => save()} disabled={!dirty}>
          <Save size={16} /> {dirty ? "Save team" : "Saved"}
        </button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.text}</span>}
      </div>

      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Members</h2>
          <span className="muted text-sm">· {members.length} agents, each with a desk in this team&apos;s office</span>
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
        {members.length === 0 && <p className="muted text-sm">No members yet. Add agents from the shared list or create a new one.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
              <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={44} />
              <Link href={`/agents/${encodeURIComponent(a.id)}`} className="min-w-0 flex-1">
                <div className="truncate font-semibold hover:underline">{a.name}</div>
                <div className="muted truncate text-xs">{a.role}</div>
                <div className="muted truncate font-mono text-[11px]">id: {a.id}</div>
              </Link>
              <button className="btn btn-ghost btn-icon" title="Remove from team (stays in Agents)" onClick={() => update({ memberIds: team.memberIds.filter((m) => m !== a.id) })}>
                <UserMinus size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel grid gap-x-4 p-5 md:grid-cols-3">
        <h2 className="font-semibold md:col-span-3">Team settings</h2>
        <p className="muted mb-3 text-sm md:col-span-3">Defaults apply to members that don&apos;t set their own runtime or model.</p>
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
    </div>
  );
}
