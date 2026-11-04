"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Box, Check, Grid2x2, Loader2, UsersRound } from "lucide-react";
import type { AgentTemplate, OfficeStyle, Team } from "@agent-town/core";
import { api, errorText } from "@/lib/api";
import { useWorkspaces, wsPath } from "@/lib/workspace";
import { Avatar, PixelCharacter } from "@/components/ui";

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  agents: Array<{ name: string; role: string; color: string; sprite: string }>;
}

const STEPS = ["Name and goal", "Office", "Team"] as const;

/** New workspace in three steps: name and goal → office style → team template or your own team. */
export default function NewWorkspacePage() {
  const router = useRouter();
  const { reload } = useWorkspaces();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [style, setStyle] = useState<OfficeStyle>("2d");
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [library, setLibrary] = useState<Array<AgentTemplate & { mainOf?: string }>>([]);
  const [choice, setChoice] = useState<string>("custom");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<TemplateInfo[]>("/api/templates"), api<Array<AgentTemplate & { mainOf?: string }>>("/api/agents")])
      .then(([t, a]) => {
        setTemplates(t);
        setLibrary(a.filter((x) => !x.mainOf));
        if (t[0]) setChoice(t[0].id);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const team =
        choice === "custom"
          ? await api<Team>("/api/workspaces", { json: { name, goal, officeStyle: style, memberIds: picked } })
          : (await api<{ team: Team }>(`/api/templates/${encodeURIComponent(choice)}/instantiate`, { json: { name, goal, officeStyle: style } })).team;
      await reload();
      router.push(wsPath(team.id, "agent"));
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const canNext = step === 0 ? name.trim().length > 0 : true;

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-8 flex items-center gap-2 text-sm" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: i <= step ? "var(--accent)" : "var(--bg-soft)", color: i <= step ? "#fff" : "var(--muted)" }}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </span>
            <span className={i === step ? "font-semibold" : "muted"}>{s}</span>
            {i < STEPS.length - 1 && <span className="muted mx-1">—</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="panel space-y-4 p-6">
          <h1 className="text-2xl font-bold tracking-tight">New workspace</h1>
          <label className="field !mb-0">
            Name
            <input className="input !text-base" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee shop launch" maxLength={80} />
          </label>
          <label className="field !mb-0">
            Goal
            <textarea className="input" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Open a neighbourhood coffee shop by spring, on a small budget" maxLength={2000} />
          </label>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="mb-4 text-2xl font-bold tracking-tight">Choose an office</h1>
          <div className="grid gap-4 sm:grid-cols-2">
            <StyleCard selected={style === "2d"} onClick={() => setStyle("2d")} title="2D office" icon={<Grid2x2 size={16} />} preview={<Preview2D />} />
            <StyleCard selected={style === "3d"} onClick={() => setStyle("3d")} title="3D town" icon={<Box size={16} />} preview={<Preview3D />} />
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="mb-4 text-2xl font-bold tracking-tight">Pick a team</h1>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setChoice(t.id)}
                className="panel flex flex-col gap-3 p-4 text-left"
                aria-pressed={choice === t.id}
                style={choice === t.id ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" } : undefined}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {t.name}
                  {choice === t.id && <Check size={16} className="ml-auto" style={{ color: "var(--accent)" }} />}
                </div>
                <p className="muted line-clamp-2 text-xs">{t.description}</p>
                <div className="flex -space-x-2">
                  {t.agents.map((a) => (
                    <Avatar key={a.name} name={`${a.name} · ${a.role}`} color={a.color} sprite={a.sprite} size={28} ring="transparent" />
                  ))}
                </div>
              </button>
            ))}
            <button
              onClick={() => setChoice("custom")}
              className="panel flex flex-col gap-3 p-4 text-left"
              aria-pressed={choice === "custom"}
              style={choice === "custom" ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" } : undefined}
            >
              <div className="flex items-center gap-2 font-semibold">
                <UsersRound size={16} /> Build your own
                {choice === "custom" && <Check size={16} className="ml-auto" style={{ color: "var(--accent)" }} />}
              </div>
              <p className="muted text-xs">Pick agents from your Agents list.</p>
            </button>
          </div>
          {choice === "custom" && (
            <div className="panel mt-4 p-4">
              {library.length === 0 && <p className="muted text-sm">No agents yet. You can add them later in Settings.</p>}
              <div className="flex flex-wrap gap-2">
                {library.map((a) => {
                  const on = picked.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      aria-pressed={on}
                      className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm"
                      style={{ borderColor: on ? "var(--accent)" : "var(--line)", background: on ? "var(--accent-soft)" : "var(--panel)" }}
                      onClick={() => setPicked(on ? picked.filter((x) => x !== a.id) : [...picked, a.id])}
                    >
                      <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={26} /> {a.name}
                      <span className="muted text-xs">{a.role}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {error && <p className="mt-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      <div className="mt-6 flex justify-between">
        <button className="btn btn-ghost" onClick={() => (step ? setStep(step - 1) : router.push("/"))}>
          <ArrowLeft size={16} /> Back
        </button>
        {step < 2 ? (
          <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Next <ArrowRight size={16} />
          </button>
        ) : (
          <button data-needs="edit" className="btn btn-primary" disabled={busy} onClick={create}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Create workspace
          </button>
        )}
      </div>
    </div>
  );
}

function StyleCard({ selected, onClick, title, icon, preview }: { selected: boolean; onClick: () => void; title: string; icon: React.ReactNode; preview: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className="panel overflow-hidden text-left"
      style={selected ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" } : undefined}
    >
      <div className="h-44 w-full">{preview}</div>
      <div className="flex items-center gap-2 p-4 font-semibold">
        {icon} {title}
        {selected && <Check size={16} className="ml-auto" style={{ color: "var(--accent)" }} />}
      </div>
    </button>
  );
}

/** A tiny pixel room: floor tiles, desks and three characters. */
function Preview2D() {
  return (
    <div
      className="relative h-full w-full"
      style={{
        background: "repeating-conic-gradient(#c9a27a 0% 25%, #bf9670 0% 50%) 0 0 / 24px 24px",
        imageRendering: "pixelated",
      }}
    >
      <div className="absolute inset-x-0 top-0 h-8" style={{ background: "#7a6a8f" }} />
      {[18, 46, 74].map((left, i) => (
        <div key={left} className="absolute" style={{ left: `${left}%`, top: 54 }}>
          <div className="h-5 w-12 rounded-sm" style={{ background: "#8a5a3b", boxShadow: "0 3px 0 #5e3d28" }} />
          <div className="-mt-1 ml-3">
            <PixelCharacter index={i * 2} scale={1.5} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A tiny isometric island with houses. */
function Preview3D() {
  return (
    <div className="relative h-full w-full" style={{ background: "linear-gradient(#9fd3f5, #d8eefb)" }}>
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/3 rotate-45 rounded-md" style={{ background: "#6fbf5f", boxShadow: "6px 6px 0 #7a5a3a, 12px 12px 0 #5c432c" }} />
      {[
        [38, 32, "#e76f51"],
        [56, 40, "#4f86f7"],
        [46, 52, "#e9c46a"],
      ].map(([l, t, c]) => (
        <div key={`${l}`} className="absolute" style={{ left: `${l}%`, top: `${t}%` }}>
          <div className="h-0 w-0" style={{ borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderBottom: `10px solid ${c}` }} />
          <div className="h-4 w-6" style={{ background: "#f5ecd9" }} />
        </div>
      ))}
    </div>
  );
}
