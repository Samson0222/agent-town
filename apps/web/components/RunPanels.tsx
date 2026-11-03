"use client";
import { useState } from "react";
import {
  TASK_STAGES,
  pendingApprovals,
  type AgentState,
  type AgentTownEvent,
  type RunState,
  type Team,
  type Workflow,
} from "@agent-town/core";
import { API, api, errorText, formatUsd } from "@/lib/api";

// ---------------------------------------------------------------------------
// Event formatting (shared by the log and the agent detail panel)

export function describeEvent(ev: AgentTownEvent, names: Record<string, string>): { icon: string; text: string } {
  const n = (id?: string) => (id ? names[id] ?? id : "—");
  switch (ev.type) {
    case "run.started":
      return { icon: "▶", text: `Run started: ${ev.workflowName}` };
    case "run.paused":
      return { icon: "⏸", text: `Paused${ev.reason ? ` — ${ev.reason}` : ""}` };
    case "run.resumed":
      return { icon: "▶", text: "Resumed" };
    case "run.completed":
      return { icon: "🏁", text: `Run completed · ${ev.outputs.length} files` };
    case "run.failed":
      return { icon: "💥", text: `Run failed: ${ev.error}` };
    case "run.stopped":
      return { icon: "⏹", text: `Run stopped: ${ev.reason}` };
    case "preflight":
      return { icon: "🔎", text: `Preflight: ${ev.warnings.join(" · ")}` };
    case "node.queued":
      return { icon: "·", text: `Queued ${ev.nodeId} (attempt ${ev.attempt})` };
    case "node.started":
      return { icon: "→", text: `Started ${ev.nodeId}${ev.agentId ? ` as ${n(ev.agentId)}` : ""} (attempt ${ev.attempt})` };
    case "node.completed":
      return { icon: "✓", text: `Completed ${ev.nodeId}${ev.outcome ? ` — ${ev.outcome}` : ""}` };
    case "node.failed":
      return { icon: "✗", text: `Failed ${ev.nodeId}: ${ev.error}` };
    case "node.skipped":
      return { icon: "↷", text: `Skipped ${ev.nodeId}: ${ev.reason}` };
    case "agent.status":
      return { icon: "●", text: `${n(ev.from)} is ${ev.status}${ev.message ? ` — ${ev.message}` : ""}` };
    case "task.created":
      return { icon: "📋", text: `Task “${ev.title}” → ${n(ev.assignee)}` };
    case "task.stage":
      return { icon: "📋", text: `${ev.taskId} → ${ev.stage}${ev.outputLink ? ` (${ev.outputLink})` : ""}` };
    case "task.reassigned":
      return { icon: "🔀", text: `${ev.taskId} reassigned ${n(ev.previous)} → ${n(ev.assignee)}` };
    case "task.redirected":
      return { icon: "↪", text: `${ev.taskId} redirected: ${ev.note}` };
    case "message":
      return { icon: ev.kind === "feedback" ? "↩" : "✉", text: `${n(ev.from)} → ${n(ev.to)}: ${ev.message}` };
    case "runtime.event":
      return { icon: "⚙", text: `${n(ev.from)} [${ev.kind}] ${ev.message}` };
    case "tool.call":
      return { icon: "🔧", text: `${n(ev.from)} calls ${ev.tool} (${ev.category})` };
    case "tool.result":
      return { icon: ev.ok ? "🔧" : "⚠", text: `${ev.tool}: ${ev.message}` };
    case "approval.requested":
      return { icon: "✋", text: `Approval needed: ${ev.message}` };
    case "approval.resolved":
      return { icon: ev.approved ? "👍" : "👎", text: `${ev.approved ? "Approved" : "Rejected"}${ev.note ? `: ${ev.note}` : ""}` };
    case "output.saved":
      return { icon: "💾", text: `Saved ${ev.file} (${ev.bytes} B)` };
    case "cost":
      return { icon: "$", text: `${n(ev.from)} +${formatUsd(ev.cost?.usd ?? 0)}${ev.cost?.simulated ? " (simulated)" : ""} · total ${formatUsd(ev.total)}` };
  }
}

const FILTERS: Record<string, (e: AgentTownEvent) => boolean> = {
  all: () => true,
  messages: (e) => e.type === "message" || e.type.startsWith("approval") || e.type.startsWith("task.re"),
  tools: (e) => e.type.startsWith("tool.") || e.type === "output.saved",
  runtime: (e) => e.type === "runtime.event" || e.type === "agent.status" || e.type === "cost",
  run: (e) => e.type.startsWith("run.") || e.type.startsWith("node.") || e.type === "preflight",
};

export function EventLog({ events, names, height = 360 }: { events: AgentTownEvent[]; names: Record<string, string>; height?: number }) {
  const [filter, setFilter] = useState("all");
  const shown = events.filter(FILTERS[filter]!);
  return (
    <div>
      <div className="mb-2 flex gap-1">
        {Object.keys(FILTERS).map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? "btn-primary" : ""}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <span className="muted ml-auto self-center text-xs">{shown.length} events</span>
      </div>
      <ol className="overflow-auto font-mono text-[11px] leading-5" style={{ maxHeight: height }}>
        {shown
          .slice()
          .reverse()
          .map((ev) => {
            const d = describeEvent(ev, names);
            return (
              <li key={ev.seq} className="flex gap-2 border-b py-0.5" style={{ borderColor: "var(--line)" }}>
                <span className="muted w-8 shrink-0 text-right">{ev.seq}</span>
                <span className="muted w-16 shrink-0">{ev.ts.slice(11, 19)}</span>
                <span className="w-4 shrink-0">{d.icon}</span>
                <span className="flex-1 break-words">{d.text}</span>
                {(ev.runtime || ev.connector) && (
                  <span className="shrink-0 rounded px-1" style={{ border: "1px solid var(--line)" }}>
                    {ev.connector ?? ev.runtime}
                  </span>
                )}
              </li>
            );
          })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Board({ state, names, onSelect }: { state: RunState; names: Record<string, string>; onSelect: (agentId?: string) => void }) {
  const tasks = Object.values(state.tasks);
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {TASK_STAGES.map((stage) => (
        <div key={stage} className="rounded-md p-2" style={{ background: "var(--bg)" }}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide">
            {stage} <span className="muted">({tasks.filter((t) => t.stage === stage).length})</span>
          </div>
          <div className="space-y-2">
            {tasks
              .filter((t) => t.stage === stage)
              .map((t) => {
                const node = state.nodes[t.nodeId];
                return (
                  <button key={t.id} onClick={() => onSelect(t.assignee)} className="panel block w-full p-2 text-left text-xs">
                    <div className="font-medium">{t.title}</div>
                    <div className="muted">
                      {names[t.assignee ?? ""] ?? t.assignee ?? "unassigned"}
                      {node && node.attempts > 1 ? ` · attempt ${node.attempts}` : ""}
                    </div>
                    {t.outputLink && <div className="mt-1 font-mono text-[10px]">📄 {t.outputLink}</div>}
                    {t.note && <div className="mt-1 italic">↪ {t.note}</div>}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function CostPanel({ state, names }: { state: RunState; names: Record<string, string> }) {
  const pct = state.cost.cap > 0 ? Math.min(100, (state.cost.total / state.cost.cap) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold">{formatUsd(state.cost.total)}</span>
        <span className="muted text-xs">cap {formatUsd(state.cost.cap)}</span>
      </div>
      <div className="my-2 h-2 rounded" style={{ background: "var(--bg)" }}>
        <div className="h-2 rounded" style={{ width: `${pct}%`, background: pct > 90 ? "#dc2626" : pct > 70 ? "#d97706" : "#16a34a" }} />
      </div>
      {state.cost.simulated && <p className="mb-2 text-xs text-amber-600">Simulated cost (mock runtime). No credit spent.</p>}
      <table className="w-full text-xs">
        <tbody>
          {Object.entries(state.cost.byAgent).map(([id, usd]) => (
            <tr key={id}>
              <td>{names[id] ?? id}</td>
              <td className="text-right font-mono">{formatUsd(usd)}</td>
            </tr>
          ))}
          {Object.entries(state.cost.byRuntime).map(([rt, usd]) => (
            <tr key={rt} className="muted">
              <td>runtime: {rt}</td>
              <td className="text-right font-mono">{formatUsd(usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Approvals({ runId, state, names, disabled }: { runId: string; state: RunState; names: Record<string, string>; disabled: boolean }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const pending = pendingApprovals(state);
  if (!pending.length) return <p className="muted text-sm">Nothing is waiting for you.</p>;
  const decide = async (approvalId: string, approved: boolean) => {
    setErr(null);
    try {
      await api(`/api/runs/${runId}/approve`, { json: { approvalId, approved, note: notes[approvalId] || undefined } });
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="space-y-3">
      {pending.map((a) => (
        <div key={a.approvalId} className="rounded-md border-2 p-3" style={{ borderColor: a.category === "send" || a.category === "spend" ? "#dc2626" : "#d97706" }}>
          <div className="text-sm font-semibold">
            ✋ {a.message}
          </div>
          <div className="muted mb-2 text-xs">
            {a.kind === "tool" ? `Tool ${a.tool} · category ${a.category}` : `Step ${a.nodeId}`}
            {a.agentId ? ` · ${names[a.agentId] ?? a.agentId} is waiting` : ""}
          </div>
          {a.preview && <pre className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap rounded p-2 text-[11px]" style={{ background: "var(--bg)" }}>{a.preview}</pre>}
          <input
            className="input mb-2 text-xs"
            placeholder="Note / feedback (sent back on reject)"
            value={notes[a.approvalId] ?? ""}
            onChange={(e) => setNotes({ ...notes, [a.approvalId]: e.target.value })}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={disabled} onClick={() => decide(a.approvalId, true)}>
              Approve
            </button>
            <button className="btn btn-sm btn-danger" disabled={disabled} onClick={() => decide(a.approvalId, false)}>
              Reject
            </button>
          </div>
        </div>
      ))}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Controls({ runId, state, workflow, team, live }: { runId: string; state: RunState; workflow: Workflow; team: Team; live: boolean }) {
  const [nodeId, setNodeId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const call = async (path: string, json: unknown = {}) => {
    setMsg(null);
    try {
      await api(`/api/runs/${runId}/${path}`, { json });
      setMsg({ ok: true, text: "OK" });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };
  const assignable = workflow.nodes.filter((n) => n.type === "agentTask" || n.type === "merge" || n.type === "toolCall");
  const active = live && (state.status === "running" || state.status === "paused");
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {state.status === "paused" ? (
          <button className="btn btn-primary" disabled={!active} onClick={() => call("resume")}>
            ▶ Resume
          </button>
        ) : (
          <button className="btn" disabled={!active || state.status !== "running"} onClick={() => call("pause")}>
            ⏸ Pause
          </button>
        )}
        <button className="btn btn-danger" disabled={!active} onClick={() => confirm("Stop this run?") && call("stop")}>
          ⏹ Stop
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className="input text-xs" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
          <option value="">Step…</option>
          {assignable.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label || n.id} ({state.nodes[n.id]?.status ?? "idle"})
            </option>
          ))}
        </select>
        <select className="input text-xs" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Agent…</option>
          {team.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.role}
            </option>
          ))}
        </select>
        <button className="btn btn-sm col-span-2" disabled={!active || !nodeId || !agentId} onClick={() => call("reassign", { nodeId, agentId })}>
          🔀 Reassign step to agent
        </button>
        <input className="input col-span-2 text-xs" placeholder="Redirect note for the step's next run" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-sm col-span-2" disabled={!active || !nodeId || !note} onClick={() => call("redirect", { nodeId, note })}>
          ↪ Redirect step
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}
      <p className="muted text-[11px]">Pause lets in-flight steps finish and starts no new ones. Reassign works on steps that are not running.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Files({ runId, files }: { runId: string; files: string[] }) {
  const [open, setOpen] = useState<{ file: string; content: string } | null>(null);
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const show = async (file: string) => {
    const res = await fetch(`${API}/api/runs/${runId}/files/${file.split("/").map(encodeURIComponent).join("/")}`);
    setOpen({ file, content: await res.text() });
  };
  const deliverables = files.filter((f) => !f.startsWith("steps/"));
  const steps = files.filter((f) => f.startsWith("steps/"));
  return (
    <div className="text-sm">
      <ul className="space-y-1">
        {deliverables.map((f) => (
          <li key={f}>
            <button className="hover:underline" onClick={() => show(f)}>
              📄 {f}
            </button>
          </li>
        ))}
      </ul>
      {steps.length > 0 && (
        <details className="mt-2">
          <summary className="muted cursor-pointer text-xs">{steps.length} step outputs</summary>
          <ul className="mt-1 space-y-1 text-xs">
            {steps.map((f) => (
              <li key={f}>
                <button className="hover:underline" onClick={() => show(f)}>
                  {f}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!files.length && <p className="muted">No files yet.</p>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(null)}>
          <div className="panel flex max-h-[85vh] w-full max-w-4xl flex-col p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-sm">{open.file}</span>
              {open.file.endsWith(".html") && (
                <button className="btn btn-sm" onClick={() => setMode(mode === "preview" ? "source" : "preview")}>
                  {mode === "preview" ? "Source" : "Preview"}
                </button>
              )}
              <button className="btn btn-sm ml-auto" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
            {open.file.endsWith(".html") && mode === "preview" ? (
              // sandbox="" = no scripts, no same-origin: generated HTML can't touch the app.
              <iframe title={open.file} sandbox="" srcDoc={open.content} className="h-[70vh] w-full rounded bg-white" />
            ) : (
              <pre className="overflow-auto whitespace-pre-wrap text-xs">{open.content}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AgentDetail({ agent, state, events, names }: { agent: AgentState; state: RunState; events: AgentTownEvent[]; names: Record<string, string> }) {
  const tasks = Object.values(state.tasks).filter((t) => t.assignee === agent.id);
  const nodes = Object.values(state.nodes).filter((n) => n.agentId === agent.id);
  const current = nodes.find((n) => n.status === "running" || n.status === "waiting") ?? nodes.at(-1);
  const mine = events.filter((e) => e.from === agent.id || e.to === agent.id);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full" style={{ background: agent.color }} />
        <span className="font-semibold">{agent.name}</span>
        <span className="muted">{agent.role} · {agent.department}</span>
        <span className="ml-auto rounded px-2 text-xs" style={{ border: "1px solid var(--line)" }}>
          {agent.status}
        </span>
      </div>
      <div className="muted text-xs">
        runtime <b>{agent.runtime}</b> · model <b className="font-mono">{agent.model}</b> · spent {formatUsd(agent.costUsd)}
        {agent.message ? ` · “${agent.message}”` : ""}
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase">Tasks</div>
        {tasks.length ? (
          <ul className="text-xs">
            {tasks.map((t) => (
              <li key={t.id}>
                {t.title} — <b>{t.stage}</b>
                {t.outputLink ? ` · 📄 ${t.outputLink}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-xs">No tasks in this run.</p>
        )}
      </div>
      {current?.output && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase">Latest output ({current.id})</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded p-2 text-[11px]" style={{ background: "var(--bg)" }}>
            {current.output}
          </pre>
        </div>
      )}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase">Log</div>
        <EventLog events={mine} names={names} height={220} />
      </div>
    </div>
  );
}
