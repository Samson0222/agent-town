"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FolderInput } from "lucide-react";
import type { AgentTemplate, Team } from "@agent-town/core";
import { api, errorText, type RuntimeInfo, type ToolInfo } from "@/lib/api";

const PALETTE = ["#2a9d8f", "#e76f51", "#4f86f7", "#9b5de5", "#e9c46a", "#43aa8b", "#f15bb5", "#577590"];

function newAgent(team: Team): AgentTemplate {
  const n = team.agents.length + 1;
  let id = `agent-${n}`;
  while (team.agents.some((a) => a.id === id)) id += "x";
  return {
    id,
    name: `Agent ${n}`,
    role: "Generalist",
    department: "General",
    description: "",
    systemPrompt: "",
    tools: [],
    permissions: { autoApproveWrite: false, shell: false },
    appearance: { color: PALETTE[n % PALETTE.length]!, sprite: "default", desk: { x: 1 + ((n - 1) % 4) * 2, y: 1 + Math.floor((n - 1) / 4) * 2 } },
  };
}

export default function TeamEditor() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api<Team>(`/api/teams/${id}`), api<RuntimeInfo[]>("/api/runtimes"), api<{ tools: ToolInfo[] }>("/api/connectors")])
      .then(([t, r, c]) => {
        setTeam(t);
        setRuntimes(r);
        setTools(c.tools);
      })
      .catch((e) => setMsg({ ok: false, text: errorText(e) }));
  }, [id]);

  if (!team) return <p className="muted">{msg?.text ?? "Loading…"}</p>;

  const agent = team.agents[sel];
  const setAgent = (patch: Partial<AgentTemplate>) => {
    const agents = team.agents.map((a, i) => (i === sel ? { ...a, ...patch } : a));
    setTeam({ ...team, agents });
  };
  const effectiveRuntime = agent?.runtime || team.defaults.runtime;
  const models = runtimes.find((r) => r.id === effectiveRuntime)?.models ?? [];
  const defaultModels = runtimes.find((r) => r.id === team.defaults.runtime)?.models ?? [];

  /**
   * Import Agent Factory role templates from a folder the user picks. Accepts one template folder
   * or a parent folder containing many; every folder with a template.json becomes one agent.
   */
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
    if (!templates.length) {
      setMsg({ ok: false, text: "No template.json found in that folder." });
      return;
    }
    try {
      if (team) await api(`/api/teams/${id}`, { method: "PUT", json: team }); // keep unsaved edits
      const r = await api<{ team: Team; imported: Array<{ id: string; name: string; notes: string[] }> }>(`/api/teams/${id}/import/agent-factory`, {
        json: { templates },
      });
      setTeam(r.team);
      setSel(r.team.agents.length - 1);
      setMsg({ ok: true, text: `Imported ${r.imported.length} agent${r.imported.length > 1 ? "s" : ""}: ${r.imported.map((a) => a.name).join(", ")}` });
      setImportNotes([...new Set(r.imported.flatMap((a) => a.notes))]);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  async function save() {
    try {
      setTeam(await api<Team>(`/api/teams/${id}`, { method: "PUT", json: team }));
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/teams" className="muted text-sm">
          ← Teams
        </Link>
        <input className="input max-w-sm text-lg font-semibold" value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} />
        <button className="btn btn-primary" onClick={save}>
          Save team
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
      </div>

      <section className="panel grid gap-4 p-4 md:grid-cols-4">
        <label className="field md:col-span-2">
          Description
          <input className="input" value={team.description} onChange={(e) => setTeam({ ...team, description: e.target.value })} />
        </label>
        <label className="field">
          Shared vault folder
          <input className="input" value={team.vault} onChange={(e) => setTeam({ ...team, vault: e.target.value })} />
        </label>
        <label className="field">
          Run cost cap (USD)
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={team.defaults.costCapUsd}
            onChange={(e) => setTeam({ ...team, defaults: { ...team.defaults, costCapUsd: Number(e.target.value) } })}
          />
        </label>
        <label className="field">
          Default runtime
          <select className="input" value={team.defaults.runtime} onChange={(e) => setTeam({ ...team, defaults: { ...team.defaults, runtime: e.target.value } })}>
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
          <ModelPicker value={team.defaults.model.id} models={defaultModels} onChange={(v) => setTeam({ ...team, defaults: { ...team.defaults, model: { ...team.defaults.model, id: v } } })} />
        </label>
        <label className="field">
          Default fallback model
          <ModelPicker
            value={team.defaults.model.fallbackId ?? ""}
            models={defaultModels}
            allowEmpty
            onChange={(v) => setTeam({ ...team, defaults: { ...team.defaults, model: { ...team.defaults.model, fallbackId: v || undefined } } })}
          />
        </label>
      </section>

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <aside className="panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Agents</h2>
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
            <button
              className="btn btn-sm"
              onClick={() => {
                setTeam({ ...team, agents: [...team.agents, newAgent(team)] });
                setSel(team.agents.length);
              }}
            >
              + Add
            </button>
          </div>
          {importNotes.length > 0 && (
            <ul className="mb-2 space-y-1 rounded-lg p-2 text-[11px]" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
              {importNotes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          )}
          <ul className="space-y-1">
            {team.agents.map((a, i) => (
              <li key={a.id}>
                <button
                  onClick={() => setSel(i)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm"
                  style={{ background: i === sel ? "var(--bg)" : undefined }}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: a.appearance.color }} />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="muted truncate text-xs">{a.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {agent ? (
          <section className="panel grid gap-x-4 p-4 md:grid-cols-3">
            <label className="field">
              Id (used in workflows)
              <input className="input font-mono" value={agent.id} onChange={(e) => setAgent({ id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} />
            </label>
            <label className="field">
              Name
              <input className="input" value={agent.name} onChange={(e) => setAgent({ name: e.target.value })} />
            </label>
            <label className="field">
              Role
              <input className="input" value={agent.role} onChange={(e) => setAgent({ role: e.target.value })} />
            </label>
            <label className="field">
              Department
              <input className="input" value={agent.department} onChange={(e) => setAgent({ department: e.target.value })} />
            </label>
            <label className="field md:col-span-3">
              Description <span className="hint">(what this agent is for: shown to you, not sent to the model)</span>
              <input className="input" value={agent.description ?? ""} onChange={(e) => setAgent({ description: e.target.value })} />
            </label>
            <label className="field">
              Runtime
              <select className="input" value={agent.runtime ?? ""} onChange={(e) => setAgent({ runtime: e.target.value || undefined })}>
                <option value="">Team default ({team.defaults.runtime})</option>
                {runtimes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Model
              <ModelPicker
                value={agent.model?.id ?? ""}
                models={models}
                allowEmpty
                emptyLabel={`Team default (${team.defaults.model.id})`}
                onChange={(v) => setAgent({ model: v ? { ...agent.model, id: v } : undefined })}
              />
            </label>
            <label className="field md:col-span-3">
              System prompt
              <textarea className="input font-mono text-xs" rows={4} value={agent.systemPrompt} onChange={(e) => setAgent({ systemPrompt: e.target.value })} />
            </label>

            <fieldset className="md:col-span-2">
              <legend className="muted mb-1 text-xs">Allowed tools (send / spend tools always ask you first)</legend>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {tools.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={agent.tools.includes(t.id) || agent.tools.includes(`${t.connector}.*`)}
                      disabled={agent.tools.includes(`${t.connector}.*`)}
                      onChange={(e) => setAgent({ tools: e.target.checked ? [...agent.tools, t.id] : agent.tools.filter((x) => x !== t.id) })}
                    />
                    <span className="font-mono text-xs">{t.id}</span>
                    <CategoryBadge c={t.category} />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="muted mb-1 text-xs">Permissions</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={agent.permissions.autoApproveWrite}
                  onChange={(e) => setAgent({ permissions: { ...agent.permissions, autoApproveWrite: e.target.checked } })}
                />
                Auto-approve write tools
              </label>
              <label className="mt-2 block text-xs muted">
                Agent cost cap (USD, optional)
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={agent.costCapUsd ?? ""}
                  onChange={(e) => setAgent({ costCapUsd: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </label>
            </fieldset>

            <div className="mt-3 flex flex-wrap items-end gap-4 md:col-span-3">
              <label className="field">
                Colour (outfit in the office)
                <input type="color" className="block h-8 w-16" value={agent.appearance.color} onChange={(e) => setAgent({ appearance: { ...agent.appearance, color: e.target.value } })} />
              </label>
              <label className="field">
                Sprite
                <select className="input" value={agent.appearance.sprite} onChange={(e) => setAgent({ appearance: { ...agent.appearance, sprite: e.target.value } })}>
                  {["default", "hat", "bun", "bald", "cap"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Desk X (hint)
                <input
                  className="input w-20"
                  type="number"
                  min="0"
                  max="9"
                  value={agent.appearance.desk?.x ?? ""}
                  onChange={(e) => setAgent({ appearance: { ...agent.appearance, desk: { x: Number(e.target.value), y: agent.appearance.desk?.y ?? 1 } } })}
                />
              </label>
              <label className="field">
                Desk Y (hint)
                <input
                  className="input w-20"
                  type="number"
                  min="0"
                  max="5"
                  value={agent.appearance.desk?.y ?? ""}
                  onChange={(e) => setAgent({ appearance: { ...agent.appearance, desk: { x: agent.appearance.desk?.x ?? 1, y: Number(e.target.value) } } })}
                />
              </label>
              <button
                className="btn btn-danger ml-auto"
                onClick={() => {
                  setTeam({ ...team, agents: team.agents.filter((_, i) => i !== sel) });
                  setSel(0);
                }}
              >
                Remove agent
              </button>
            </div>
          </section>
        ) : (
          <p className="muted p-4">No agents yet. Add one to get started.</p>
        )}
      </div>
    </div>
  );
}

function ModelPicker(props: { value: string; models: Array<{ id: string; name?: string }>; onChange: (v: string) => void; allowEmpty?: boolean; emptyLabel?: string }) {
  const listId = `models-${props.models.map((m) => m.id).join("").length}-${props.emptyLabel ?? ""}`;
  return (
    <>
      <input className="input font-mono" list={listId} placeholder={props.emptyLabel ?? (props.allowEmpty ? "(none)" : "")} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      <datalist id={listId}>
        {props.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </datalist>
    </>
  );
}

function CategoryBadge({ c }: { c: string }) {
  const color = c === "send" || c === "spend" ? "#dc2626" : c === "write" ? "#d97706" : "#16a34a";
  return (
    <span className="rounded px-1 text-[10px] uppercase" style={{ color, border: `1px solid ${color}` }}>
      {c}
    </span>
  );
}
