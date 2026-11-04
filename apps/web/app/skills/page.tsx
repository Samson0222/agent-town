"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, ChevronRight, Download, FileCode2, FileText, FolderOpen, GitBranch, Globe, Loader2, PenLine, Plus, Sparkles, X } from "lucide-react";
import type { AgentTemplate, Skill } from "@agent-town/core";
import { api, errorText } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/ui";
import { SkillScopePicker, type ScopeValue } from "@/components/SkillScope";

type Mode = null | "choose" | "write" | "folder" | "github" | "starters";
interface GithubPreview {
  skill: Skill;
  warnings: string[];
  files: Array<{ path: string; bytes: number; script: boolean }>;
}
interface GithubChoices {
  choices: Array<{ path: string; url: string }>;
  repo: string;
  ref: string;
}

/** Skills library (pattern from Multica's skills page — design only). */
export default function SkillsPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [agents, setAgents] = useState<AgentTemplate[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api<Skill[]>("/api/skills"), api<AgentTemplate[]>("/api/agents")])
      .then(([s, a]) => {
        setSkills(s);
        setAgents(a);
      })
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);

  const done = (id?: string) => {
    setMode(null);
    if (id) router.push(`/skills/${encodeURIComponent(id)}`);
    else void load();
  };

  return (
    <div>
      <PageHeader
        title="Skills"
        subtitle="Reusable know-how (a SKILL.md plus optional files). Write it once, give it to any agent. It goes into their prompt next to their instructions."
        actions={
          <button data-needs="edit" className="btn btn-primary" onClick={() => setMode("choose")}>
            <Plus size={16} /> New skill
          </button>
        }
      />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {skills && skills.length === 0 && (
        <div className="panel">
          <EmptyState icon={<BookOpen size={22} />} title="No skills yet">
            <button className="underline" onClick={() => setMode("starters")}>Add a starter skill</button> or write your own.
          </EmptyState>
        </div>
      )}
      <div className="panel divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>
        {(skills ?? []).map((s) => {
          const users = s.scope === "global" ? agents.filter((a) => !a.skills.some((r) => r.skillId === s.id && !r.enabled)).length : agents.filter((a) => a.skills.some((r) => r.skillId === s.id && r.enabled)).length;
          return (
            <Link key={s.id} href={`/skills/${encodeURIComponent(s.id)}`} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--panel-2)]" style={{ borderColor: "var(--line)" }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                {s.source === "github" ? <GitBranch size={18} /> : <Sparkles size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  {s.scope === "global" ? (
                    <span className="chip" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                      <Globe size={11} /> All agents
                    </span>
                  ) : (
                    <span className="chip" style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}>
                      {users} agent{users === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="muted truncate text-sm">{s.description || "No description"}</div>
              </div>
              <span className="muted hidden text-xs sm:block">
                {s.source === "github" ? `GitHub · ${s.origin?.repo}@${s.origin?.commit.slice(0, 7)}` : s.source === "starter" ? "Starter" : s.source === "folder" ? "Imported folder" : "Written here"}
                {s.files.length > 0 && ` · ${s.files.length + 1} files`}
              </span>
              <ChevronRight size={16} className="muted" />
            </Link>
          );
        })}
      </div>

      {mode && (
        <div className="drawer-backdrop flex items-start justify-center overflow-auto p-4 sm:items-center" onClick={() => setMode(null)}>
          <div className="panel w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5" style={{ borderColor: "var(--line)" }}>
              <div>
                <h2 className="text-lg font-semibold">New skill</h2>
                <p className="muted text-sm">{mode === "choose" ? "Choose how you want to add a skill." : MODE_TITLE[mode]}</p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setMode(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {mode === "choose" && (
                <div className="space-y-2">
                  <Choice icon={<PenLine size={18} />} title="Write one" text="Start from a blank SKILL.md and write your own steps." onClick={() => setMode("write")} />
                  <Choice icon={<FolderOpen size={18} />} title="Import a folder" text="Pick a folder that contains SKILL.md (and optional extra files)." onClick={() => setMode("folder")} />
                  <Choice icon={<GitBranch size={18} />} title="Install from GitHub" text="Paste a link to a skill folder. You'll see a preview first; it's pinned to the exact commit." onClick={() => setMode("github")} />
                  <Choice icon={<Sparkles size={18} />} title="Starter skills" text="Ready-made examples you can install and edit." onClick={() => setMode("starters")} />
                </div>
              )}
              {mode === "write" && <WriteSkill agents={agents} onDone={done} />}
              {mode === "folder" && <FolderSkill agents={agents} onDone={done} />}
              {mode === "github" && <GithubSkill agents={agents} onDone={done} />}
              {mode === "starters" && <StarterSkills agents={agents} onDone={done} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MODE_TITLE: Record<Exclude<Mode, null | "choose">, string> = {
  write: "Write a skill",
  folder: "Import a folder containing SKILL.md",
  github: "Install from GitHub",
  starters: "Starter skills",
};

function Choice({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-xl border p-4 text-left hover:border-[var(--accent)]" style={{ borderColor: "var(--line)" }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--bg-soft)" }}>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="muted block text-sm">{text}</span>
      </span>
      <ChevronRight size={16} className="muted" />
    </button>
  );
}

const defaultScope: ScopeValue = { scope: "agents", agentIds: [] };

function WriteSkill({ agents, onDone }: { agents: AgentTemplate[]; onDone: (id?: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("# Steps\n\n1. \n2. \n\n# Output\n\n");
  const [scope, setScope] = useState(defaultScope);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      const s = await api<Skill>("/api/skills", { json: { skill: { name, description, content, source: "manual" }, ...scope } });
      onDone(s.id);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="space-y-4">
      <label className="field">
        Name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fact-check checklist" />
      </label>
      <label className="field">
        When to use it <span className="hint">(shown to people and to the model)</span>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Use when reviewing copy before it goes out" />
      </label>
      <label className="field">
        SKILL.md
        <textarea className="input font-mono text-[13px]" rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      <SkillScopePicker value={scope} onChange={setScope} agents={agents} />
      {err && <p className="text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
      <div className="flex justify-end">
        <button data-needs="edit" className="btn btn-primary" disabled={!name.trim()} onClick={save}>
          Save skill
        </button>
      </div>
    </div>
  );
}

function FolderSkill({ agents, onDone }: { agents: AgentTemplate[]; onDone: (id?: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<Array<{ name: string; files: Record<string, string> }>>([]);
  const [scope, setScope] = useState(defaultScope);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function read(list: FileList) {
    setErr(null);
    // Group files by the folder that holds each SKILL.md (supports picking a parent with several skills).
    const all = await Promise.all(
      Array.from(list).map(async (f) => ({ path: ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).split("/"), file: f })),
    );
    const roots = all.filter((x) => x.path.at(-1)?.toLowerCase() === "skill.md").map((x) => x.path.slice(0, -1).join("/"));
    if (!roots.length) return setErr("No SKILL.md in that folder.");
    const out: Array<{ name: string; files: Record<string, string> }> = [];
    for (const root of roots) {
      const files: Record<string, string> = {};
      for (const x of all) {
        const p = x.path.join("/");
        if (!p.startsWith(root + "/")) continue;
        const rel = p.slice(root.length + 1);
        if (roots.some((r) => r !== root && r.startsWith(root + "/") && p.startsWith(r + "/"))) continue; // nested skill
        if (x.file.size > 200_000) continue;
        files[rel === "skill.md" ? "SKILL.md" : rel] = await x.file.text();
      }
      out.push({ name: root.split("/").pop() || "skill", files });
    }
    setFolders(out);
  }

  const save = async () => {
    try {
      const r = await api<{ created: Skill[]; warnings: string[] }>("/api/skills/import", { json: { folders, ...scope } });
      setWarnings(r.warnings);
      if (!r.warnings.length) onDone(r.created.length === 1 ? r.created[0]!.id : undefined);
      else setFolders([]);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  if (warnings.length)
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--ok)" }}>Imported. Notes:</p>
        <ul className="space-y-1 text-xs" style={{ color: "var(--warn)" }}>
          {warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
        <button data-needs="edit" className="btn btn-primary" onClick={() => onDone()}>
          Done
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <button className="btn" onClick={() => ref.current?.click()}>
        <FolderOpen size={16} /> Choose folder…
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        multiple
        // @ts-expect-error non-standard but widely supported folder picker
        webkitdirectory=""
        onChange={(e) => e.target.files?.length && void read(e.target.files)}
      />
      {folders.map((f) => (
        <div key={f.name} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--line)" }}>
          <div className="font-semibold">{f.name}</div>
          <div className="muted text-xs">{Object.keys(f.files).join(" · ")}</div>
        </div>
      ))}
      {folders.length > 0 && <SkillScopePicker value={scope} onChange={setScope} agents={agents} />}
      {err && <p className="text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
      <div className="flex justify-end">
        <button data-needs="edit" className="btn btn-primary" disabled={!folders.length} onClick={save}>
          Import {folders.length > 1 ? `${folders.length} skills` : "skill"}
        </button>
      </div>
    </div>
  );
}

function GithubSkill({ agents, onDone }: { agents: AgentTemplate[]; onDone: (id?: string) => void }) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<GithubPreview | null>(null);
  const [choices, setChoices] = useState<GithubChoices | null>(null);
  const [scope, setScope] = useState(defaultScope);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fetchPreview = async (target = url) => {
    setBusy(true);
    setErr(null);
    setPreview(null);
    setChoices(null);
    try {
      const r = await api<GithubPreview | GithubChoices>("/api/skills/github/preview", { json: { url: target } });
      if ("choices" in r) setChoices(r);
      else setPreview(r);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const install = async () => {
    try {
      const s = await api<Skill>("/api/skills", { json: { skill: preview!.skill, ...scope } });
      onDone(s.id);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/tree/main/skills/my-skill" />
        <button className="btn" disabled={!url.trim() || busy} onClick={() => fetchPreview()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Preview
        </button>
      </div>
      <p className="hint">Nothing is saved until you click Install. The skill is pinned to the exact commit, and bundled scripts are kept as text — Agent Town never runs them.</p>
      {choices && (
        <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
          <div className="text-sm font-semibold">
            {choices.repo} has {choices.choices.length} skills. Pick one to preview:
          </div>
          <ul className="space-y-1">
            {choices.choices.map((c) => (
              <li key={c.path}>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-sm hover:bg-[var(--panel-2)]"
                  onClick={() => {
                    setUrl(c.url);
                    void fetchPreview(c.url);
                  }}
                >
                  <BookOpen size={14} /> {c.path} <ChevronRight size={14} className="ml-auto" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview && (
        <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
          <div>
            <div className="font-semibold">{preview.skill.name}</div>
            <div className="muted text-sm">{preview.skill.description || "No description"}</div>
            <a className="mt-1 block font-mono text-xs underline" href={preview.skill.origin?.url} target="_blank" rel="noreferrer">
              {preview.skill.origin?.repo}/{preview.skill.origin?.path} @ {preview.skill.origin?.commit.slice(0, 7)} ({preview.skill.origin?.ref})
            </a>
          </div>
          <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-xs" style={{ background: "var(--panel-2)" }}>
            {preview.skill.content}
          </pre>
          <ul className="space-y-0.5 text-xs">
            <li className="flex items-center gap-1.5">
              <FileText size={12} /> SKILL.md
            </li>
            {preview.files
              .filter((f) => f.path !== "SKILL.md")
              .map((f) => (
                <li key={f.path} className="flex items-center gap-1.5" style={{ color: f.script ? "var(--warn)" : undefined }}>
                  {f.script ? <FileCode2 size={12} /> : <FileText size={12} />} {f.path} <span className="muted">({(f.bytes / 1000).toFixed(1)} KB)</span>
                  {f.script && <span>· script, never run</span>}
                </li>
              ))}
          </ul>
          {preview.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg p-2 text-xs" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
              {preview.warnings.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
          <SkillScopePicker value={scope} onChange={setScope} agents={agents} />
        </div>
      )}
      {err && <p className="text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
      <div className="flex justify-end">
        <button data-needs="edit" className="btn btn-primary" disabled={!preview} onClick={install}>
          Install
        </button>
      </div>
    </div>
  );
}

function StarterSkills({ agents, onDone }: { agents: AgentTemplate[]; onDone: (id?: string) => void }) {
  const [starters, setStarters] = useState<Array<Skill & { installed: boolean }>>([]);
  const [picked, setPicked] = useState<Skill | null>(null);
  const [scope, setScope] = useState<ScopeValue>(defaultScope);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Array<Skill & { installed: boolean }>>("/api/skill-starters").then(setStarters).catch((e) => setErr(errorText(e)));
  }, []);
  const install = async () => {
    try {
      const s = await api<Skill>(`/api/skill-starters/${picked!.id}/install`, { json: scope });
      onDone(s.id);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {starters.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setPicked(s);
              setScope({ scope: s.scope, agentIds: [] });
            }}
            className="rounded-xl border p-3 text-left"
            style={{ borderColor: picked?.id === s.id ? "var(--accent)" : "var(--line)", background: picked?.id === s.id ? "var(--accent-soft)" : undefined }}
          >
            <div className="flex items-center gap-2 font-semibold">
              {s.name}
              {s.installed && <span className="chip !h-5 text-[10px]" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>installed</span>}
            </div>
            <div className="muted mt-1 text-xs">{s.description}</div>
          </button>
        ))}
      </div>
      {picked && <SkillScopePicker value={scope} onChange={setScope} agents={agents} />}
      {err && <p className="text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
      <div className="flex justify-end">
        <button data-needs="edit" className="btn btn-primary" disabled={!picked} onClick={install}>
          Install {picked?.name ?? ""}
        </button>
      </div>
    </div>
  );
}
