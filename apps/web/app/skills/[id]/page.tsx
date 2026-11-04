"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, FileCode2, FileText, GitBranch, Globe, Loader2, Plus, RefreshCw, Save, Trash2, Users } from "lucide-react";
import type { Skill } from "@agent-town/core";
import { api, errorText } from "@/lib/api";
import { Avatar, timeAgo } from "@/components/ui";

interface SkillAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  sprite: string;
  on: boolean;
}
interface SourceCheck {
  skill: Skill;
  warnings: string[];
  changed: boolean;
  current: string;
}
const SCRIPT = /\.(sh|bash|zsh|ps1|psm1|bat|cmd|py|js|mjs|cjs|ts|rb|pl|php)$/i;

export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [draft, setDraft] = useState<Skill | null>(null);
  const [agents, setAgents] = useState<SkillAgent[]>([]);
  const [assign, setAssign] = useState<Record<string, boolean>>({});
  const [openFile, setOpenFile] = useState<string>("SKILL.md");
  const [check, setCheck] = useState<SourceCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    api<{ skill: Skill; agents: SkillAgent[] }>(`/api/skills/${encodeURIComponent(id)}`)
      .then((r) => {
        setSkill(r.skill);
        setDraft(r.skill);
        setAgents(r.agents);
        setAssign({});
      })
      .catch((e) => setMsg({ ok: false, text: errorText(e) }));
  useEffect(() => {
    void load();
  }, [id]);

  if (!skill || !draft) return <p className="muted">{msg?.text ?? "Loading…"}</p>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(skill) || Object.keys(assign).length > 0;
  const isOn = (a: SkillAgent) => assign[a.id] ?? a.on;
  const fromGithub = skill.source === "github" && skill.origin;
  const file = openFile === "SKILL.md" ? null : draft.files.find((f) => f.path === openFile);

  async function save(next = draft!) {
    setBusy("save");
    try {
      const r = await api<{ skill: Skill; agents: SkillAgent[] }>(`/api/skills/${encodeURIComponent(id)}`, { method: "PUT", json: { skill: next, assign } });
      setSkill(r.skill);
      setDraft(r.skill);
      setAgents(r.agents);
      setAssign({});
      setMsg({ ok: true, text: "Saved. Agents use the new version from their next step." });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function checkSource() {
    setBusy("check");
    setMsg(null);
    try {
      setCheck(await api<SourceCheck>(`/api/skills/${encodeURIComponent(id)}/check-source`, { method: "POST" }));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/skills" className="muted flex items-center gap-1 text-sm">
        <ArrowLeft size={14} /> Skills
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <input className="input max-w-lg !text-xl font-bold" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input mt-2 max-w-2xl" value={draft.description} placeholder="When to use it" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <div className="muted mt-2 flex flex-wrap gap-3 text-xs">
            {fromGithub ? (
              <a href={skill.origin!.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline">
                <GitBranch size={13} /> {skill.origin!.repo}/{skill.origin!.path} @ {skill.origin!.commit.slice(0, 7)} ({skill.origin!.ref})
              </a>
            ) : (
              <span>{skill.source === "starter" ? "Starter skill" : skill.source === "folder" ? "Imported from a folder" : "Written here"}</span>
            )}
            {skill.updatedAt && <span>updated {timeAgo(skill.updatedAt)}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {fromGithub && (
            <button className="btn" onClick={checkSource} disabled={busy === "check"}>
              {busy === "check" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Update from source
            </button>
          )}
          <button data-needs="edit" className="btn btn-primary" disabled={!dirty || busy === "save"} onClick={() => save()}>
            <Save size={15} /> Save
          </button>
          <button data-needs="edit"
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm(`Delete "${skill.name}"? It will be removed from every agent.`)) return;
              await api(`/api/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
              router.push("/skills");
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {msg && <p className="text-sm" style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.text}</p>}

      {check && (
        <section className="panel p-4" style={{ borderColor: check.changed ? "var(--accent)" : undefined }}>
          {check.changed ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 text-sm">
                A newer version is on GitHub: <b className="font-mono">{check.current.slice(0, 7)}</b> → <b className="font-mono">{check.skill.origin?.commit.slice(0, 7)}</b>. Updating replaces the text and files; who has the skill stays the same.
                {check.warnings.length > 0 && (
                  <ul className="mt-1 text-xs" style={{ color: "var(--warn)" }}>
                    {check.warnings.map((w) => (
                      <li key={w}>• {w}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button className="btn btn-ghost" onClick={() => setCheck(null)}>
                Not now
              </button>
              <button data-needs="edit"
                className="btn btn-primary"
                onClick={async () => {
                  await save({ ...draft, name: check.skill.name, description: check.skill.description, content: check.skill.content, files: check.skill.files, origin: check.skill.origin });
                  setCheck(null);
                }}
              >
                Update to {check.skill.origin?.commit.slice(0, 7)}
              </button>
            </div>
          ) : (
            <p className="text-sm">Already up to date with {skill.origin?.ref} ({skill.origin?.commit.slice(0, 7)}).</p>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
            {["SKILL.md", ...draft.files.map((f) => f.path)].map((p) => (
              <button key={p} className={`btn btn-sm ${openFile === p ? "btn-primary" : "btn-ghost"}`} onClick={() => setOpenFile(p)}>
                {SCRIPT.test(p) ? <FileCode2 size={13} /> : <FileText size={13} />} {p}
              </button>
            ))}
            <button
              className="btn btn-sm btn-ghost"
              title="Add a file"
              onClick={() => {
                const path = prompt("File name (e.g. templates/report.md)");
                if (!path || path === "SKILL.md" || draft.files.some((f) => f.path === path)) return;
                setDraft({ ...draft, files: [...draft.files, { path, content: "" }] });
                setOpenFile(path);
              }}
            >
              <Plus size={13} />
            </button>
          </div>
          {file && SCRIPT.test(file.path) && (
            <p className="flex items-center gap-1.5 px-4 pt-3 text-xs" style={{ color: "var(--warn)" }}>
              <AlertTriangle size={13} /> Script file — kept as reference text. Agent Town never runs it.
            </p>
          )}
          <textarea
            className="block min-h-[420px] w-full resize-y border-0 bg-transparent p-4 font-mono text-[13px] outline-none"
            value={file ? file.content : draft.content}
            onChange={(e) =>
              file
                ? setDraft({ ...draft, files: draft.files.map((f) => (f.path === file.path ? { ...f, content: e.target.value } : f)) })
                : setDraft({ ...draft, content: e.target.value })
            }
            spellCheck={false}
          />
          {file && (
            <div className="border-t px-4 py-2 text-right" style={{ borderColor: "var(--line)" }}>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  setDraft({ ...draft, files: draft.files.filter((f) => f.path !== file.path) });
                  setOpenFile("SKILL.md");
                }}
              >
                Remove file
              </button>
            </div>
          )}
        </section>

        <aside className="panel h-fit space-y-4 p-5">
          <div>
            <div className="section-title mb-2">Who gets it</div>
            <div className="tabs">
              <button
                className="tab"
                data-active={draft.scope === "global"}
                onClick={() => {
                  setDraft({ ...draft, scope: "global" });
                  setAssign({});
                }}
              >
                <Globe size={13} /> All agents
              </button>
              <button
                className="tab"
                data-active={draft.scope === "agents"}
                onClick={() => {
                  setDraft({ ...draft, scope: "agents" });
                  setAssign({});
                }}
              >
                <Users size={13} /> Specific agents
              </button>
            </div>
            <p className="hint mt-2">
              {draft.scope === "global" ? "Every agent uses it. Untick an agent to switch it off just for them." : "Only ticked agents use it."}
              {draft.scope !== skill.scope && " Changing this resets per-agent choices when you save."}
            </p>
          </div>
          <ul className="space-y-1">
            {agents.map((a) => {
              const on = draft.scope !== skill.scope ? (draft.scope === "global" ? assign[a.id] ?? true : assign[a.id] ?? false) : isOn(a);
              return (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 hover:bg-[var(--panel-2)]">
                    <input type="checkbox" checked={on} onChange={(e) => setAssign({ ...assign, [a.id]: e.target.checked })} />
                    <Avatar name={a.name} color={a.color} sprite={a.sprite} size={26} />
                    <span className="flex-1 text-sm">{a.name}</span>
                    <span className="muted text-xs">{a.role}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
