"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, Play, Plus, Workflow as WorkflowIcon, XCircle } from "lucide-react";
import type { Team, Workflow } from "@agent-town/core";
import { api, errorText, formatUsd, type PreflightResult, type RunRow } from "@/lib/api";
import { Avatar, RunStatusChip, timeAgo } from "@/components/ui";

export default function StartPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [wfId, setWfId] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api<Workflow[]>("/api/workflows"), api<Team[]>("/api/teams"), api<RunRow[]>("/api/runs")])
      .then(([w, t, r]) => {
        setWorkflows(w);
        setTeams(t);
        setRuns(r);
        const first = w.find((x) => x.id === "launch-brief") ?? w[0];
        if (first) setWfId(first.id);
      })
      .catch((e) => setError(`Can't reach the Agent Town server. Is \`npm run dev\` running? (${errorText(e)})`))
      .finally(() => setLoaded(true));
  }, []);

  const wf = workflows.find((w) => w.id === wfId);
  const team = teams.find((t) => t.id === wf?.teamId);
  const mainInput = wf?.inputs.find((i) => i.type === "longtext") ?? wf?.inputs[0];
  const otherInputs = wf?.inputs.filter((i) => i !== mainInput) ?? [];

  useEffect(() => {
    if (!wf) return;
    setInputs(Object.fromEntries(wf.inputs.map((i) => [i.key, i.default ?? ""])));
  }, [wf]);

  // Check readiness automatically whenever the workflow or inputs change.
  useEffect(() => {
    if (!wf) return;
    const t = setTimeout(() => {
      api<PreflightResult>(`/api/workflows/${wf.id}/preflight`, { json: { inputs } })
        .then(setPreflight)
        .catch(() => setPreflight(null));
    }, 300);
    return () => clearTimeout(t);
  }, [wf, inputs]);

  const errors = preflight?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = preflight?.issues.filter((i) => i.level === "warning") ?? [];
  const steps = useMemo(() => wf?.nodes.filter((n) => n.type === "agentTask" || n.type === "merge" || n.type === "toolCall").length ?? 0, [wf]);
  const approvals = wf?.nodes.filter((n) => n.type === "humanApproval" || n.type === "toolCall").length ?? 0;
  const runtimes = new Set(team?.agents.map((a) => a.runtime || team.defaults.runtime));

  async function start() {
    if (!wf) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ runId: string }>("/api/runs", { json: { workflowId: wf.id, inputs } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">What should your team work on?</h1>
          <p className="muted mt-1">Describe the goal, pick a workflow, and watch your agents work it out in the office.</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>
            <XCircle size={18} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <section className="panel p-5">
          <label className="field !mb-0">
            <span className="text-base font-semibold" style={{ color: "var(--ink)" }}>
              {mainInput?.label || "Goal"}
            </span>
            <textarea
              className="input mt-2 !text-base"
              rows={3}
              placeholder="e.g. Create a launch brief for a new neighbourhood coffee shop"
              value={mainInput ? inputs[mainInput.key] ?? "" : ""}
              onChange={(e) => mainInput && setInputs({ ...inputs, [mainInput.key]: e.target.value })}
              disabled={!mainInput}
            />
          </label>
          {otherInputs.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {otherInputs.map((i) => (
                <label key={i.key} className="field !mb-0">
                  {i.label || i.key}
                  {i.required && " *"}
                  <input className="input" value={inputs[i.key] ?? ""} onChange={(e) => setInputs({ ...inputs, [i.key]: e.target.value })} />
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="mb-3 mt-8 flex items-center justify-between">
          <h2 className="section-title">Choose a workflow</h2>
          <Link href="/workflows" className="btn btn-ghost btn-sm">
            <Plus size={14} /> New workflow
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((w) => {
            const t = teams.find((x) => x.id === w.teamId);
            const selected = w.id === wfId;
            return (
              <button
                key={w.id}
                onClick={() => setWfId(w.id)}
                className="panel flex flex-col gap-3 p-4 text-left transition"
                style={{
                  borderColor: selected ? "var(--accent)" : undefined,
                  boxShadow: selected ? "0 0 0 3px var(--accent-soft), var(--shadow)" : undefined,
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                    <WorkflowIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{w.name}</div>
                    <div className="muted truncate text-xs">{t?.name ?? "Missing team"}</div>
                  </div>
                  {selected && <CheckCircle2 size={18} className="ml-auto shrink-0" style={{ color: "var(--accent)" }} />}
                </div>
                <p className="muted line-clamp-2 min-h-[2.5em] text-xs">{w.description || "No description"}</p>
                <div className="flex -space-x-2">
                  {t?.agents.slice(0, 6).map((a) => (
                    <Avatar key={a.id} name={a.name} color={a.appearance.color} size={26} ring="transparent" />
                  ))}
                </div>
              </button>
            );
          })}
          {loaded && workflows.length === 0 && <p className="muted text-sm">No workflows yet — create one under Workflows.</p>}
        </div>
      </div>

      {/* Right rail: summary + start + recent */}
      <aside className="flex flex-col gap-4 xl:sticky xl:top-8 xl:self-start">
        <section className="panel p-5">
          <div className="section-title mb-3">Ready to start</div>
          {wf ? (
            <>
              <div className="text-lg font-semibold">{wf.name}</div>
              <div className="muted mb-4 text-sm">{team?.name}</div>
              <div className="mb-4 flex flex-wrap gap-2">
                {team?.agents.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs" style={{ background: "var(--bg-soft)" }}>
                    <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={22} />
                    {a.name} <span className="muted">· {a.role}</span>
                  </span>
                ))}
              </div>
              <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="steps" value={steps} />
                <Stat label="your OKs" value={approvals} />
                <Stat label="cost cap" value={formatUsd(wf.settings.costCapUsd ?? team?.defaults.costCapUsd ?? 0)} />
              </dl>
              {runtimes.has("mock") && (
                <p className="mb-3 rounded-lg p-2 text-xs" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                  Uses the <b>mock</b> runtime: fake agents, no credit spent.
                </p>
              )}
              {errors.length > 0 && (
                <ul className="mb-3 space-y-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.map((i, k) => (
                    <li key={k} className="flex gap-1.5">
                      <XCircle size={14} className="mt-px shrink-0" /> {i.message}
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn btn-primary btn-lg w-full" onClick={start} disabled={busy || errors.length > 0}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} {busy ? "Starting…" : "Start run"}
              </button>
              {warnings.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="muted flex cursor-pointer items-center gap-1">
                    <AlertTriangle size={13} style={{ color: "var(--warn)" }} /> {warnings.length} note{warnings.length > 1 ? "s" : ""} before you start
                  </summary>
                  <ul className="mt-2 space-y-1" style={{ color: "var(--warn)" }}>
                    {warnings.map((i, k) => (
                      <li key={k}>• {i.message}</li>
                    ))}
                  </ul>
                </details>
              )}
              <Link href={`/workflows/${wf.id}`} className="btn btn-ghost btn-sm mt-3 w-full">
                View or edit this workflow
              </Link>
            </>
          ) : (
            <p className="muted text-sm">Pick a workflow to start.</p>
          )}
        </section>

        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="section-title">Recent runs</div>
            <Link href="/runs" className="btn btn-ghost btn-sm">
              All <ArrowRight size={14} />
            </Link>
          </div>
          {runs.length === 0 ? (
            <p className="muted flex items-center gap-2 text-sm">
              <Clock size={15} /> Your runs will show up here.
            </p>
          ) : (
            <ul className="space-y-1">
              {runs.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link href={`/runs/${r.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-[var(--bg-soft)]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.workflowName}</div>
                      <div className="muted text-xs">{timeAgo(r.createdAt)}</div>
                    </div>
                    <RunStatusChip status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg py-2" style={{ background: "var(--bg-soft)" }}>
      <div className="font-semibold">{value}</div>
      <div className="muted text-[11px]">{label}</div>
    </div>
  );
}
