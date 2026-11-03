"use client";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Code2,
  CornerDownRight,
  Eye,
  FileText,
  Flag,
  Hand,
  Loader2,
  Mail,
  MessageSquareReply,
  Pause,
  Play,
  Square,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
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
import { AgentStatusChip, Avatar } from "./ui";

type Names = Record<string, string>;

// ---------------------------------------------------------------------------
// Friendly activity feed

type Tone = "info" | "ok" | "warn" | "bad" | "accent" | "muted";
interface FeedItem {
  seq: number;
  ts: string;
  actor?: string;
  icon: React.ReactNode;
  tone: Tone;
  text: React.ReactNode;
}

const TONE: Record<Tone, string> = {
  info: "var(--info)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  accent: "var(--accent)",
  muted: "var(--muted)",
};

/** Human sentences for the events a person cares about; null = technical detail. */
export function friendly(ev: AgentTownEvent, names: Names, labels: Record<string, string>): Omit<FeedItem, "seq" | "ts"> | null {
  const n = (id?: string) => (id ? names[id] ?? id : "Someone");
  const step = (id?: string) => (id ? labels[id] ?? id : "a step");
  const b = (s: string) => <b className="font-semibold">{s}</b>;
  switch (ev.type) {
    case "run.started":
      return { icon: <Play size={14} />, tone: "accent", text: <>Run started: {b(ev.workflowName)}</> };
    case "run.paused":
      return { icon: <Pause size={14} />, tone: "warn", text: <>Paused. Steps already running will finish; nothing new starts.</> };
    case "run.resumed":
      return { icon: <Play size={14} />, tone: "info", text: <>Resumed</> };
    case "run.completed":
      return { icon: <Flag size={14} />, tone: "ok", text: <>All done! {ev.outputs.filter((f) => !f.startsWith("steps/")).length} files ready in Outputs.</> };
    case "run.failed":
      return { icon: <XCircle size={14} />, tone: "bad", text: <>Run failed: {ev.error}</> };
    case "run.stopped":
      return { icon: <Square size={14} />, tone: "muted", text: <>Run stopped: {ev.reason}</> };
    case "node.started":
      return ev.agentId
        ? { actor: ev.agentId, icon: <Loader2 size={14} />, tone: "info", text: <>{b(n(ev.agentId))} started {b(step(ev.nodeId))}{ev.attempt > 1 ? ` (attempt ${ev.attempt})` : ""}</> }
        : null;
    case "node.completed":
      if (ev.outcome === "approved") return null;
      return ev.from ? { actor: ev.from, icon: <CheckCircle2 size={14} />, tone: "ok", text: <>{b(n(ev.from))} finished {b(step(ev.nodeId))}</> } : null;
    case "node.failed":
      return { icon: <XCircle size={14} />, tone: "bad", text: <>{b(step(ev.nodeId))} failed: {ev.error}</> };
    case "message":
      if (!ev.to || ev.from === ev.to) return null;
      {
        const sender = ev.from ? n(ev.from) : step(ev.nodeId);
        return ev.kind === "feedback"
          ? { actor: ev.from, icon: <MessageSquareReply size={14} />, tone: "warn", text: <>{b(sender)} sent work back to {b(n(ev.to))} for changes</> }
          : { actor: ev.from, icon: <Mail size={14} />, tone: "muted", text: <>{b(sender)} handed off to {b(n(ev.to))}</> };
      }
    case "approval.requested":
      return { actor: ev.from, icon: <Hand size={14} />, tone: "warn", text: <>Waiting for your OK: {ev.message}</> };
    case "approval.resolved":
      return ev.approved
        ? { icon: <ThumbsUp size={14} />, tone: "ok", text: <>You approved{ev.note ? `: “${ev.note}”` : ""}</> }
        : { icon: <ThumbsDown size={14} />, tone: "bad", text: <>You asked for changes{ev.note ? `: “${ev.note}”` : ""}</> };
    case "task.reassigned":
      return { actor: ev.assignee, icon: <ArrowRightLeft size={14} />, tone: "accent", text: <>{b(step(ev.nodeId))} reassigned from {n(ev.previous)} to {b(n(ev.assignee))}</> };
    case "task.redirected":
      return { icon: <CornerDownRight size={14} />, tone: "accent", text: <>New instruction for {b(step(ev.nodeId))}: “{ev.note}”</> };
    case "tool.call":
      if (ev.category === "runtime") return { actor: ev.from, icon: <Wrench size={14} />, tone: "muted", text: <>{b(n(ev.from))} is using {ev.tool}</> };
      return { actor: ev.from, icon: <Wrench size={14} />, tone: "info", text: <>{b(n(ev.from))} ran {b(ev.tool)}</> };
    case "output.saved":
      if (ev.file.startsWith("steps/")) return null;
      return { actor: ev.from, icon: <FileText size={14} />, tone: "ok", text: <>Saved {b(ev.file)}</> };
    default:
      return null;
  }
}

export function ActivityFeed({ events, names, labels, colors, height = 420 }: { events: AgentTownEvent[]; names: Names; labels: Record<string, string>; colors: Record<string, string>; height?: number }) {
  const [technical, setTechnical] = useState(false);
  const items = useMemo(() => {
    const out: FeedItem[] = [];
    for (const ev of events) {
      const f = friendly(ev, names, labels);
      if (f) out.push({ ...f, seq: ev.seq, ts: ev.ts });
    }
    return out.reverse();
  }, [events, names, labels]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="section-title">Activity</div>
        <label className="muted flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} /> Technical log
        </label>
      </div>
      {technical ? (
        <EventLog events={events} names={names} height={height} />
      ) : (
        <ol className="scroll-thin space-y-1 overflow-auto pr-1" style={{ maxHeight: height }}>
          {items.length === 0 && <li className="muted py-6 text-center text-sm">Nothing yet…</li>}
          {items.map((it) => (
            <li key={it.seq} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--panel-2)]">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--bg-soft)", color: TONE[it.tone] }}>
                {it.icon}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-6">{it.text}</span>
              {it.actor && colors[it.actor] && <Avatar name={names[it.actor] ?? it.actor} color={colors[it.actor]!} size={20} />}
              <span className="muted mt-1 shrink-0 font-mono text-[10px]">{it.ts.slice(11, 19)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Raw technical log: every event, with runtime/connector badges. */
export function EventLog({ events, names, height = 360 }: { events: AgentTownEvent[]; names: Names; height?: number }) {
  return (
    <ol className="scroll-thin overflow-auto rounded-lg p-2 font-mono text-[11px] leading-5" style={{ maxHeight: height, background: "var(--panel-2)" }}>
      {events
        .slice()
        .reverse()
        .map((ev) => (
          <li key={ev.seq} className="flex gap-2">
            <span className="muted w-8 shrink-0 text-right">{ev.seq}</span>
            <span className="muted w-14 shrink-0">{ev.ts.slice(11, 19)}</span>
            <span className="shrink-0" style={{ color: "var(--accent)" }}>
              {ev.type}
            </span>
            <span className="min-w-0 flex-1 break-words">{technicalText(ev, names)}</span>
            {(ev.runtime || ev.connector) && <span className="muted shrink-0">[{ev.connector ?? ev.runtime}]</span>}
          </li>
        ))}
    </ol>
  );
}

function technicalText(ev: AgentTownEvent, names: Names): string {
  const n = (id?: string) => (id ? names[id] ?? id : "");
  const who = ev.from ? `${n(ev.from)}${ev.to ? ` → ${n(ev.to)}` : ""} ` : "";
  const node = ev.nodeId ? `(${ev.nodeId}) ` : "";
  const rest = { ...ev } as Record<string, unknown>;
  for (const k of ["seq", "runId", "ts", "type", "from", "to", "nodeId", "taskId", "runtime", "connector"]) delete rest[k];
  const s = JSON.stringify(rest);
  return `${who}${node}${s.length > 220 ? s.slice(0, 220) + "…" : s}`;
}

// ---------------------------------------------------------------------------
// Approvals banner

export function ApprovalBanner({ runId, state, names, colors, disabled }: { runId: string; state: RunState; names: Names; colors: Record<string, string>; disabled: boolean }) {
  const pending = pendingApprovals(state);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  if (!pending.length) return null;
  const decide = async (approvalId: string, approved: boolean) => {
    setErr(null);
    setBusy(approvalId);
    try {
      await api(`/api/runs/${runId}/approve`, { json: { approvalId, approved, note: notes[approvalId] || undefined } });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      {pending.map((a) => {
        const risky = a.category === "send" || a.category === "spend";
        return (
          <section
            key={a.approvalId}
            className="panel overflow-hidden"
            style={{ borderColor: risky ? "var(--bad)" : "var(--warn)", boxShadow: `0 0 0 3px ${risky ? "var(--bad-soft)" : "var(--warn-soft)"}, var(--shadow)` }}
          >
            <div className="flex flex-wrap items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: risky ? "var(--bad-soft)" : "var(--warn-soft)", color: risky ? "var(--bad)" : "var(--warn)" }}>
                <Hand size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: risky ? "var(--bad)" : "var(--warn)" }}>
                  {risky ? `Needs your OK before anything is ${a.category === "send" ? "sent" : "spent"}` : "Needs your OK"}
                </div>
                <div className="font-semibold">{a.message}</div>
                {a.agentId && (
                  <div className="muted mt-0.5 flex items-center gap-1.5 text-xs">
                    <Avatar name={names[a.agentId] ?? a.agentId} color={colors[a.agentId] ?? "#888"} size={16} /> {names[a.agentId]} is waiting
                    {a.tool && <span> · tool {a.tool}</span>}
                  </div>
                )}
              </div>
              {a.preview && (
                <button className="btn btn-sm" onClick={() => setPreview(preview === a.approvalId ? null : a.approvalId)}>
                  <Eye size={14} /> {preview === a.approvalId ? "Hide" : "Review"} details
                </button>
              )}
            </div>
            {preview === a.approvalId && a.preview && (
              <pre className="scroll-thin mx-4 mb-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-xs" style={{ background: "var(--panel-2)" }}>
                {a.preview}
              </pre>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t p-3" style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}>
              <input
                className="input !h-9 min-w-48 flex-1 text-sm"
                placeholder="Optional note — sent back as feedback if you ask for changes"
                value={notes[a.approvalId] ?? ""}
                onChange={(e) => setNotes({ ...notes, [a.approvalId]: e.target.value })}
              />
              <button className="btn btn-danger" disabled={disabled || busy === a.approvalId} onClick={() => decide(a.approvalId, false)}>
                <ThumbsDown size={15} /> {a.kind === "tool" ? "Don't allow" : "Ask for changes"}
              </button>
              <button className="btn btn-success" disabled={disabled || busy === a.approvalId} onClick={() => decide(a.approvalId, true)}>
                <ThumbsUp size={15} /> {a.kind === "tool" ? "Allow" : "Approve"}
              </button>
            </div>
          </section>
        );
      })}
      {err && <p className="text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team roster

export function TeamRoster({ agents, state, labels, onSelect, selected }: { agents: AgentState[]; state: RunState; labels: Record<string, string>; onSelect: (id: string) => void; selected?: string | null }) {
  return (
    <ul className="space-y-1.5">
      {agents.map((a) => {
        const node = Object.values(state.nodes).find((n) => n.agentId === a.id && (n.status === "running" || n.status === "waiting"));
        return (
          <li key={a.id}>
            <button
              onClick={() => onSelect(a.id)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-[var(--panel-2)]"
              style={{ background: selected === a.id ? "var(--accent-soft)" : undefined }}
            >
              <Avatar name={a.name} color={a.color} size={34} ring={a.status === "waiting-for-human" ? "var(--warn)" : undefined} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{a.name}</span>
                  <span className="muted truncate text-xs">{a.role}</span>
                </div>
                <div className="muted truncate text-xs">
                  {a.currentTool ? `🔧 ${a.currentTool}` : node ? labels[node.id] ?? node.id : a.message ?? "—"}
                </div>
              </div>
              <AgentStatusChip status={a.status} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Steps (workflow order) with per-step actions

const NODE_STATUS_STYLE: Record<string, { label: string; fg: string; bg: string }> = {
  idle: { label: "Not started", fg: "var(--muted)", bg: "var(--bg-soft)" },
  queued: { label: "Up next", fg: "var(--ink-2)", bg: "var(--bg-soft)" },
  running: { label: "Running", fg: "var(--info)", bg: "var(--info-soft)" },
  waiting: { label: "Needs you", fg: "var(--warn)", bg: "var(--warn-soft)" },
  done: { label: "Done", fg: "var(--ok)", bg: "var(--ok-soft)" },
  failed: { label: "Failed", fg: "var(--bad)", bg: "var(--bad-soft)" },
  skipped: { label: "Skipped", fg: "var(--muted)", bg: "var(--bg-soft)" },
};

export function StepsPanel({ runId, state, workflow, team, live }: { runId: string; state: RunState; workflow: Workflow; team: Team; live: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const steps = workflow.nodes.filter((n) => n.type === "agentTask" || n.type === "merge" || n.type === "toolCall" || n.type === "humanApproval");
  const agentsById = Object.fromEntries(team.agents.map((a) => [a.id, a]));

  const call = async (path: string, json: unknown) => {
    setMsg(null);
    try {
      await api(`/api/runs/${runId}/${path}`, { json });
      setMsg({ ok: true, text: path === "reassign" ? "Reassigned." : "Instruction added." });
      setNote("");
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  return (
    <div>
      <div className="section-title mb-3">Steps</div>
      <ol className="space-y-1.5">
        {steps.map((n, i) => {
          const st = state.nodes[n.id];
          const s = NODE_STATUS_STYLE[st?.status ?? "idle"]!;
          const assignee = st?.agentId ?? ("agentId" in n.config ? (n.config.agentId as string | undefined) : undefined);
          const a = assignee ? agentsById[assignee] : undefined;
          const assignable = n.type !== "humanApproval";
          const isOpen = open === n.id;
          return (
            <li key={n.id} className="rounded-xl border" style={{ borderColor: isOpen ? "var(--accent)" : "var(--line)" }}>
              <button className="flex w-full items-center gap-3 p-2.5 text-left" onClick={() => setOpen(isOpen ? null : n.id)}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ color: s.fg, background: s.bg }}>
                  {st?.status === "done" ? <CheckCircle2 size={14} /> : st?.status === "running" ? <Loader2 size={13} className="animate-spin" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.label || n.id}</div>
                  <div className="muted flex items-center gap-1 text-xs">
                    {n.type === "humanApproval" ? (
                      <>
                        <Hand size={11} /> You
                      </>
                    ) : a ? (
                      <>
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: a.appearance.color }} /> {a.name}
                      </>
                    ) : (
                      "Automatic"
                    )}
                    {st && st.attempts > 1 && <span>· attempt {st.attempts}</span>}
                  </div>
                </div>
                <span className="chip" style={{ color: s.fg, background: s.bg }}>
                  {s.label}
                </span>
                <ChevronRight size={15} className="muted transition" style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
              </button>
              {isOpen && (
                <div className="space-y-3 border-t p-3" style={{ borderColor: "var(--line)" }}>
                  {st?.output && (
                    <pre className="scroll-thin max-h-40 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[11px]" style={{ background: "var(--panel-2)" }}>
                      {st.output}
                    </pre>
                  )}
                  {st?.error && <p className="text-xs" style={{ color: "var(--bad)" }}>{st.error}</p>}
                  {assignable && live && (
                    <>
                      <div className="flex gap-2">
                        <select className="input !h-9 text-sm" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                          <option value="">Give this step to…</option>
                          {team.agents.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} — {x.role}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-sm !h-9" disabled={!agentId || st?.status === "running"} onClick={() => call("reassign", { nodeId: n.id, agentId })}>
                          <ArrowRightLeft size={14} /> Reassign
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input className="input !h-9 text-sm" placeholder="Add an instruction for this step's next run" value={note} onChange={(e) => setNote(e.target.value)} />
                        <button className="btn btn-sm !h-9" disabled={!note} onClick={() => call("redirect", { nodeId: n.id, note })}>
                          <CornerDownRight size={14} /> Add
                        </button>
                      </div>
                      {st?.status === "running" && <p className="muted text-[11px]">This step is running — pause the run and wait for it to finish to reassign it.</p>}
                    </>
                  )}
                  {msg && <p className="text-xs" style={{ color: msg.ok ? "var(--ok)" : "var(--bad)" }}>{msg.text}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board

const STAGE_LABEL = { inbox: "To do", doing: "In progress", review: "In review", done: "Done" } as const;
const STAGE_COLOR = { inbox: "var(--muted)", doing: "var(--info)", review: "#9b59b6", done: "var(--ok)" } as const;

export function Board({ state, names, colors, onSelect }: { state: RunState; names: Names; colors: Record<string, string>; onSelect: (agentId?: string) => void }) {
  const tasks = Object.values(state.tasks);
  return (
    <div className="grid h-full grid-cols-2 gap-3 md:grid-cols-4">
      {TASK_STAGES.map((stage) => (
        <div key={stage} className="flex min-h-64 flex-col rounded-xl p-2.5" style={{ background: "var(--panel-2)" }}>
          <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
            {STAGE_LABEL[stage]}
            <span className="muted ml-auto">{tasks.filter((t) => t.stage === stage).length}</span>
          </div>
          <div className="space-y-2">
            {tasks
              .filter((t) => t.stage === stage)
              .map((t) => {
                const node = state.nodes[t.nodeId];
                return (
                  <button key={t.id} onClick={() => onSelect(t.assignee)} className="panel block w-full p-2.5 text-left text-xs">
                    <div className="mb-1.5 text-sm font-medium">{t.title}</div>
                    <div className="flex items-center gap-1.5">
                      {t.assignee && <Avatar name={names[t.assignee] ?? t.assignee} color={colors[t.assignee] ?? "#888"} size={18} />}
                      <span className="muted">{names[t.assignee ?? ""] ?? "Unassigned"}</span>
                      {node && node.attempts > 1 && <span className="muted ml-auto">×{node.attempts}</span>}
                    </div>
                    {t.outputLink && (
                      <div className="mt-1.5 flex items-center gap-1 font-mono text-[10px]" style={{ color: "var(--accent)" }}>
                        <FileText size={11} /> {t.outputLink}
                      </div>
                    )}
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
// Cost meter

export function CostMeter({ state, names }: { state: RunState; names: Names }) {
  const pct = state.cost.cap > 0 ? Math.min(100, (state.cost.total / state.cost.cap) * 100) : 0;
  const color = pct > 90 ? "var(--bad)" : pct > 70 ? "var(--warn)" : "var(--ok)";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-xl font-bold">
          <CircleDollarSign size={18} style={{ color }} /> {formatUsd(state.cost.total)}
        </span>
        <span className="muted text-xs">of {formatUsd(state.cost.cap)} cap · {state.cost.tokens.toLocaleString()} tokens</span>
      </div>
      <div className="my-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(pct, state.cost.total > 0 ? 2 : 0)}%`, background: color }} />
      </div>
      {state.cost.simulated && <p className="muted mb-2 text-[11px]">Simulated by the mock runtime — no credit spent.</p>}
      <ul className="space-y-0.5 text-xs">
        {Object.entries(state.cost.byAgent).map(([id, usd]) => (
          <li key={id} className="flex justify-between">
            <span className="ink-2">{names[id] ?? id}</span>
            <span className="font-mono">{formatUsd(usd)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outputs

export function Outputs({ runId, files, vaultDir }: { runId: string; files: string[]; vaultDir?: string }) {
  const [open, setOpen] = useState<{ file: string; content: string } | null>(null);
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const show = async (file: string) => {
    const res = await fetch(`${API}/api/runs/${runId}/files/${file.split("/").map(encodeURIComponent).join("/")}`);
    setMode("preview");
    setOpen({ file, content: await res.text() });
  };
  const deliverables = files.filter((f) => !f.startsWith("steps/"));
  const steps = files.filter((f) => f.startsWith("steps/"));
  return (
    <div>
      {deliverables.length === 0 && steps.length === 0 && <p className="muted text-sm">Files appear here as agents save them.</p>}
      {vaultDir && (
        <p className="muted mb-2 break-all font-mono text-[11px]" title="Folder on your computer, inside data/vault">
          📁 vault/{vaultDir}
        </p>
      )}
      <ul className="space-y-1.5">
        {deliverables.map((f) => (
          <li key={f}>
            <button className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left hover:border-[var(--accent)]" style={{ borderColor: "var(--line)" }} onClick={() => show(f)}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                {f.endsWith(".html") ? <Code2 size={16} /> : <FileText size={16} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{f}</span>
              <Eye size={15} className="muted" />
            </button>
          </li>
        ))}
      </ul>
      {steps.length > 0 && (
        <details className="mt-2">
          <summary className="muted cursor-pointer text-xs">{steps.length} intermediate step outputs</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {steps.map((f) => (
              <li key={f}>
                <button className="hover:underline" onClick={() => show(f)}>
                  {f.replace("steps/", "")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {open && (
        <div className="drawer-backdrop flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
              <FileText size={16} />
              <span className="font-mono text-sm">{open.file}</span>
              {open.file.endsWith(".html") && (
                <div className="tabs ml-3">
                  <button className="tab" data-active={mode === "preview"} onClick={() => setMode("preview")}>
                    Preview
                  </button>
                  <button className="tab" data-active={mode === "source"} onClick={() => setMode("source")}>
                    Source
                  </button>
                </div>
              )}
              <button className="btn btn-ghost btn-icon ml-auto" onClick={() => setOpen(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {open.file.endsWith(".html") && mode === "preview" ? (
              // sandbox="" = no scripts, no same-origin: generated HTML can't touch the app.
              <iframe title={open.file} sandbox="" srcDoc={open.content} className="h-[75vh] w-full bg-white" />
            ) : (
              <pre className="scroll-thin overflow-auto whitespace-pre-wrap p-5 text-sm leading-relaxed">{open.content}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent drawer: task, latest output, log

export function AgentDrawer({ agent, state, events, names, labels, onClose }: { agent: AgentState; state: RunState; events: AgentTownEvent[]; names: Names; labels: Record<string, string>; onClose: () => void }) {
  const tasks = Object.values(state.tasks).filter((t) => t.assignee === agent.id);
  const nodes = Object.values(state.nodes).filter((n) => n.agentId === agent.id);
  const current = nodes.find((n) => n.status === "running" || n.status === "waiting") ?? [...nodes].reverse().find((n) => n.output);
  const mine = events.filter((e) => e.from === agent.id || e.to === agent.id);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="flex items-center gap-3 border-b p-5" style={{ borderColor: "var(--line)" }}>
          <Avatar name={agent.name} color={agent.color} size={48} />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{agent.name}</div>
            <div className="muted text-sm">
              {agent.role} · {agent.department}
            </div>
          </div>
          <AgentStatusChip status={agent.status} />
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="scroll-thin flex-1 space-y-5 overflow-auto p-5">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="panel-flat p-2">
              <Bot size={14} className="mx-auto mb-1" style={{ color: "var(--accent)" }} />
              {agent.runtime}
            </div>
            <div className="panel-flat truncate p-2 font-mono" title={agent.model}>
              {agent.model}
            </div>
            <div className="panel-flat p-2">
              <CircleDollarSign size={14} className="mx-auto mb-1" style={{ color: "var(--ok)" }} />
              {formatUsd(agent.costUsd)}
            </div>
          </div>
          {agent.message && (
            <div className="rounded-xl p-3 text-sm" style={{ background: "var(--panel-2)" }}>
              <span className="muted text-xs">Right now: </span>
              {agent.message}
            </div>
          )}
          <div>
            <div className="section-title mb-2">Tasks</div>
            {tasks.length ? (
              <ul className="space-y-1.5 text-sm">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span className="flex-1">{t.title}</span>
                    {t.outputLink && <span className="muted font-mono text-[11px]">{t.outputLink}</span>}
                    <span className="chip" style={{ background: "var(--bg-soft)", color: STAGE_COLOR[t.stage] }}>
                      {STAGE_LABEL[t.stage]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">No tasks in this run.</p>
            )}
          </div>
          {current?.output && (
            <div>
              <div className="section-title mb-2">Latest output · {labels[current.id] ?? current.id}</div>
              <pre className="scroll-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-xl p-3 text-xs leading-relaxed" style={{ background: "var(--panel-2)" }}>
                {current.output}
              </pre>
            </div>
          )}
          {current?.error && (
            <p className="flex gap-1.5 text-sm" style={{ color: "var(--bad)" }}>
              <AlertTriangle size={16} /> {current.error}
            </p>
          )}
          <ActivityFeed events={mine} names={names} labels={labels} colors={{ [agent.id]: agent.color }} height={320} />
        </div>
      </aside>
    </>
  );
}
