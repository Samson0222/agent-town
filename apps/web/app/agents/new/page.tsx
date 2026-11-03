"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Cpu, Loader2, Lock, Play, Users } from "lucide-react";
import type { AgentTemplate, Skill, Team } from "@agent-town/core";
import { api, errorText, type RuntimeInfo, type ToolInfo } from "@/lib/api";
import { AgentForm, blankAgent } from "@/components/AgentForm";
import { Avatar } from "@/components/ui";

/**
 * New agent — three steps, following Multica's creation flow (design only):
 * 1. Choose a runtime  2. Configure (identity, instructions, skills, model)  3. Done → what next.
 */
export default function NewAgentPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <NewAgent />
    </Suspense>
  );
}

function NewAgent() {
  const params = useSearchParams();
  const teamFromUrl = params.get("team") ?? "";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [agent, setAgent] = useState<AgentTemplate>(() => blankAgent());
  const [teamId, setTeamId] = useState(teamFromUrl);
  const [created, setCreated] = useState<AgentTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<RuntimeInfo[]>("/api/runtimes"), api<{ tools: ToolInfo[] }>("/api/connectors"), api<Skill[]>("/api/skills"), api<Team[]>("/api/teams")])
      .then(([r, c, s, t]) => {
        setRuntimes(r);
        setTools(c.tools);
        setSkills(s);
        setTeams(t);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const a = await api<AgentTemplate>("/api/agents", { json: { ...agent, id: undefined, teamId: teamId || undefined } });
      setCreated(a);
      setStep(3);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const team = teams.find((t) => t.id === teamId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/agents" className="btn btn-ghost btn-icon" aria-label="Back to agents">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Create an agent</h1>
          <p className="muted text-sm">{step === 1 ? "Choose where it runs" : step === 2 ? "Review and configure" : "Ready"}</p>
        </div>
        <ol className="ml-auto flex items-center gap-2 text-xs">
          {["Runtime", "Configure", "Done"].map((label, i) => (
            <li key={label} className="flex items-center gap-1.5">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full font-bold"
                style={{ background: step > i + 1 ? "var(--ok)" : step === i + 1 ? "var(--accent)" : "var(--bg-soft)", color: step >= i + 1 ? "#fff" : "var(--muted)" }}
              >
                {step > i + 1 ? <Check size={13} /> : i + 1}
              </span>
              <span className={step === i + 1 ? "font-semibold" : "muted"}>{label}</span>
              {i < 2 && <span className="muted mx-1">›</span>}
            </li>
          ))}
        </ol>
      </div>
      {error && <p className="mb-4 rounded-lg p-3 text-sm" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>{error}</p>}

      {step === 1 && (
        <div className="space-y-3">
          <p className="muted text-sm">The runtime is the AI tool that does the work. It decides which models you can pick next.</p>
          {runtimes.map((r) => {
            const on = (agent.runtime || "mock") === r.id;
            return (
              <button
                key={r.id}
                className="panel flex w-full items-center gap-4 p-4 text-left"
                style={{ borderColor: on ? "var(--accent)" : undefined, boxShadow: on ? "0 0 0 3px var(--accent-soft), var(--shadow)" : undefined }}
                onClick={() => setAgent({ ...agent, runtime: r.id, model: undefined })}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <Cpu size={20} />
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{r.name}</div>
                  <div className="muted text-sm">{r.description ?? r.kind}</div>
                  <div className="mt-1 text-xs">{r.models.length} models · {r.spendsCredit ? "uses your subscription credit" : "free — simulated, no credit used"}</div>
                </div>
                <span className="chip" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
                  <span className="chip-dot" /> Available
                </span>
              </button>
            );
          })}
          {!(["opencode", "claude-code"].every((id) => runtimes.some((r) => r.id === id))) && (
          <div className="panel flex items-center gap-4 p-4 opacity-60">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--bg-soft)" }}>
              <Lock size={18} />
            </span>
            <div className="flex-1">
              <div className="font-semibold">{["OpenCode", "Claude Code"].filter((n) => !runtimes.some((r) => r.name === n)).join(" · ")}</div>
              <div className="muted text-sm">
                Not switched on. OpenCode turns on when the server starts with AGENT_TOWN_OPENCODE_URL (see docs/milestone-0-opencode.md); Claude Code comes in Milestone 3.
              </div>
            </div>
          </div>
          )}
          <div className="flex justify-end pt-2">
            <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!runtimes.length}>
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <AgentForm agent={agent} onChange={setAgent} runtimes={runtimes} tools={tools} skills={skills} />
          <section className="panel flex flex-wrap items-center gap-3 p-4">
            <Users size={18} className="muted" />
            <span className="text-sm font-medium">Add to a team</span>
            <select className="input !w-auto" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Not now</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </section>
          <div className="flex justify-between">
            <button className="btn" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn btn-primary" disabled={busy || !agent.name.trim()} onClick={create}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Create agent
            </button>
          </div>
        </div>
      )}

      {step === 3 && created && (
        <div className="panel p-8 text-center">
          <div className="mx-auto mb-3 w-fit">
            <Avatar name={created.name} color={created.appearance.color} sprite={created.appearance.sprite} size={84} />
          </div>
          <h2 className="flex items-center justify-center gap-2 text-xl font-bold">
            <CheckCircle2 size={22} style={{ color: "var(--ok)" }} /> {created.name} is ready
          </h2>
          <p className="muted mt-1 text-sm">
            Runs on <b>{created.runtime}</b>
            {team ? (
              <>
                {" "}
                · added to <b>{team.name}</b>, so they now have a desk in that office
              </>
            ) : null}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link className="btn btn-primary" href={`/agents/${encodeURIComponent(created.id)}`}>
              Open profile
            </Link>
            {team ? (
              <Link className="btn" href="/office">
                See them in the office
              </Link>
            ) : (
              <Link className="btn" href="/teams">
                <Users size={15} /> Add to a team
              </Link>
            )}
            <Link className="btn" href="/">
              <Play size={15} /> Give the team work
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setAgent(blankAgent());
                setCreated(null);
                setStep(1);
              }}
            >
              Create another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
