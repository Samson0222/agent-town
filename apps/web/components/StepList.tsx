"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Braces, CheckCircle2, GitFork, Hand, ListOrdered, Network, Plus, RotateCcw, Trash2, XCircle, AlertTriangle } from "lucide-react";
import { buildGraphFromSteps, newStepId, parseWorkflow, type SimpleStep, type Team, type Workflow, type WorkflowIssue } from "@agent-town/core";
import { FlowGraph } from "./FlowGraph";
import { Avatar } from "./ui";
import { useDialogs } from "@/components/Dialogs";

/**
 * Step-list mode: the default way to build a workflow. Each step has WHO and WHAT,
 * plus toggles. The graph is generated from the steps (preview here; the server
 * regenerates it on save). "Edit as graph" switches the workflow to advanced mode.
 */
export function StepListMode({
  wf,
  team,
  update,
  issues,
  onAdvanced,
  onJson,
}: {
  wf: Workflow;
  team?: Team;
  update: (w: Workflow) => void;
  issues: Array<{ level: "error" | "warning"; message: string }>;
  onAdvanced: () => void;
  onJson: () => void;
}) {
  const { confirm } = useDialogs();
  const [view, setView] = useState<"steps" | "graph">("steps");
  const steps = wf.simple?.steps ?? [];
  const agents = team?.agents ?? [];
  const setSteps = (next: SimpleStep[]) => update({ ...wf, simple: { steps: next } });
  const patch = (i: number, p: Partial<SimpleStep>) => setSteps(steps.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    if (j === 0 || i === 0) next[0] = { ...next[0]!, parallelWithPrevious: false };
    setSteps(next);
  };
  const add = () =>
    setSteps([...steps, { id: newStepId(steps), title: `Step ${steps.length + 1}`, who: agents[0]?.id ?? "", what: "", needsApproval: false, parallelWithPrevious: false }]);

  // Live preview of the graph the server will generate on save.
  const preview = useMemo(() => {
    try {
      const goalKey = wf.inputs.find((i) => i.key === "goal")?.key ?? wf.inputs[0]?.key;
      const g = buildGraphFromSteps(steps, { goalKey });
      return parseWorkflow({ ...wf, nodes: g.nodes, edges: g.edges, entryNodeIds: g.entryNodeIds });
    } catch {
      return wf;
    }
  }, [wf, steps]);

  const problems = steps.flatMap((s, i) => [
    !s.who ? `Step ${i + 1}: choose who does it` : null,
    !s.what.trim() ? `Step ${i + 1}: describe what to do` : null,
    s.who && !agents.some((a) => a.id === s.who) ? `Step ${i + 1}: ${s.who} isn't in ${team?.name ?? "this team"}` : null,
    s.reviewBy && !agents.some((a) => a.id === s.reviewBy) ? `Step ${i + 1}: reviewer isn't in this team` : null,
  ]).filter(Boolean) as string[];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="tabs">
            <button className="tab" data-active={view === "steps"} onClick={() => setView("steps")}>
              <ListOrdered size={14} /> Steps
            </button>
            <button className="tab" data-active={view === "graph"} onClick={() => setView("graph")}>
              <Network size={14} /> Graph preview
            </button>
            <button className="tab" onClick={onJson}>
              <Braces size={14} /> JSON
            </button>
          </div>
          <span className="muted text-xs">The graph is generated from these steps.</span>
          <button
            className="btn btn-sm btn-ghost ml-auto"
            onClick={async () => {
              if (!(await confirm({ title: "Edit as a graph?", message: "You'll be able to add decisions, tool calls and custom loops, but the step list can no longer edit this workflow.", confirmLabel: "Edit as graph" }))) return;
              // Keep the graph generated from the current (maybe unsaved) steps, then drop the list.
              update({ ...preview, simple: undefined });
              onAdvanced();
            }}
          >
            <GitFork size={14} /> Edit as graph (advanced)
          </button>
        </div>

        {view === "graph" ? (
          <FlowGraph workflow={preview} team={team} height="64vh" />
        ) : (
          <ol className="space-y-0">
            {steps.map((s, i) => {
              const parallel = s.parallelWithPrevious && i > 0;
              const agent = agents.find((a) => a.id === s.who);
              return (
                <li key={s.id} className="relative">
                  {i > 0 && (
                    <div className="flex h-7 items-center pl-6">
                      {parallel ? (
                        <span className="chip !h-5 text-[11px]" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                          <GitFork size={11} /> at the same time as step {i}
                        </span>
                      ) : (
                        <span className="h-full w-px" style={{ background: "var(--line)" }} />
                      )}
                    </div>
                  )}
                  <div className="panel p-4" style={parallel ? { marginLeft: 28, borderLeft: "3px solid var(--info)" } : undefined}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
                        {i + 1}
                      </span>
                      <input className="input !h-9 max-w-xs font-semibold" value={s.title} placeholder="Step name" onChange={(e) => patch(i, { title: e.target.value })} />
                      <div className="ml-auto flex gap-1">
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ArrowUp size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down">
                          <ArrowDown size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSteps(steps.filter((_, k) => k !== i).map((x, k) => (k === 0 ? { ...x, parallelWithPrevious: false } : x)))} aria-label="Delete step">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
                      <div>
                        <div className="hint mb-1">Who</div>
                        <div className="flex items-center gap-2">
                          {agent && <Avatar name={agent.name} color={agent.appearance.color} sprite={agent.appearance.sprite} size={32} />}
                          <select className="input" value={s.who} onChange={(e) => patch(i, { who: e.target.value })}>
                            <option value="">Choose…</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} — {a.role}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <div className="hint mb-1">What</div>
                        <textarea className="input" rows={2} value={s.what} placeholder="e.g. Find 3 local competitors and their prices" onChange={(e) => patch(i, { what: e.target.value })} />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={!!s.reviewBy} onChange={(e) => patch(i, { reviewBy: e.target.checked ? agents.find((a) => a.id !== s.who)?.id ?? s.who : undefined })} />
                        <RotateCcw size={14} className="muted" /> Review loop
                      </label>
                      {s.reviewBy !== undefined && (
                        <select className="input !h-8 !w-auto !py-0 text-xs" value={s.reviewBy} onChange={(e) => patch(i, { reviewBy: e.target.value })} aria-label="Reviewer">
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              reviewed by {a.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={s.needsApproval} onChange={(e) => patch(i, { needsApproval: e.target.checked })} />
                        <Hand size={14} className="muted" /> Needs my approval
                      </label>
                      <label className={`flex items-center gap-2 ${i === 0 ? "opacity-40" : ""}`}>
                        <input type="checkbox" disabled={i === 0} checked={parallel} onChange={(e) => patch(i, { parallelWithPrevious: e.target.checked })} />
                        <GitFork size={14} className="muted" /> Run in parallel with previous step
                      </label>
                      <label className="ml-auto flex items-center gap-2 text-xs">
                        Save result as
                        <input className="input !h-8 !w-40 !py-0 font-mono text-xs" value={s.outputFile ?? ""} placeholder="optional, e.g. brief.md" onChange={(e) => patch(i, { outputFile: e.target.value || undefined })} />
                      </label>
                    </div>
                  </div>
                </li>
              );
            })}
            <li className="pt-3">
              <button className="btn w-full !h-11 border-dashed" onClick={add}>
                <Plus size={16} /> Add step
              </button>
            </li>
          </ol>
        )}
      </div>

      <aside className="panel h-fit space-y-4 p-4 text-sm">
        <div>
          <div className="section-title mb-2">How it runs</div>
          <ol className="ink-2 space-y-1.5 text-xs">
            {steps.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-1">
                <b>{i + 1}.</b> {s.title || "Step"} <span className="muted">· {agents.find((a) => a.id === s.who)?.name ?? "?"}</span>
                {s.parallelWithPrevious && i > 0 && <span style={{ color: "var(--info)" }}>∥</span>}
                {s.reviewBy && <span className="muted">→ review by {agents.find((a) => a.id === s.reviewBy)?.name}</span>}
                {s.needsApproval && <span style={{ color: "var(--warn)" }}>→ your OK</span>}
              </li>
            ))}
          </ol>
          <p className="hint mt-2">Each step gets the run&apos;s goal and the results of the steps before it. A review or a &quot;no&quot; from you sends the step back with the feedback.</p>
        </div>
        <div>
          <div className="section-title mb-2">Checks</div>
          {problems.length === 0 && issues.filter((x) => x.level === "error").length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ok)" }}>
              <CheckCircle2 size={14} /> Looks good
            </p>
          ) : (
            <ul className="space-y-1 text-xs" style={{ color: "var(--bad)" }}>
              {problems.map((p) => (
                <li key={p} className="flex gap-1.5">
                  <XCircle size={13} className="mt-px shrink-0" /> {p}
                </li>
              ))}
              {issues
                .filter((x) => x.level === "error")
                .map((x) => (
                  <li key={x.message} className="flex gap-1.5">
                    <XCircle size={13} className="mt-px shrink-0" /> {x.message}
                  </li>
                ))}
            </ul>
          )}
          {issues
            .filter((x) => x.level === "warning")
            .map((x) => (
              <p key={x.message} className="mt-1 flex gap-1.5 text-xs" style={{ color: "var(--warn)" }}>
                <AlertTriangle size={13} className="mt-px shrink-0" /> {x.message}
              </p>
            ))}
        </div>
        <div>
          <div className="section-title mb-2">Run inputs</div>
          <p className="hint">This workflow asks for: {wf.inputs.map((x) => x.label || x.key).join(", ") || "nothing"}.</p>
        </div>
      </aside>
    </div>
  );
}

export type { WorkflowIssue };
