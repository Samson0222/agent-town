"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bookmark, Check, ChevronDown, ChevronRight, Crown, Loader2, Maximize2, Play, Send, Settings2, Square, Wand2 } from "lucide-react";
import { isSimulatedRun, type AgentTemplate, type AgentTownEvent, type Team } from "@agent-town/core";
import { api, errorText, formatUsd, type RunRow } from "@/lib/api";
import { useWorkspaces, wsPath } from "@/lib/workspace";
import { useRun } from "@/lib/useRun";
import { Office, officePeople, type OfficePerson } from "@/components/Office";
import { ApprovalBanner } from "@/components/RunPanels";
import { Avatar, RunStatusChip, timeAgo } from "@/components/ui";
import { reporterPeople, useReporters } from "@/lib/reporters";

interface Message {
  id: string;
  agentId: string;
  role: "person" | "agent";
  text: string;
  planId?: string;
  runId?: string;
  createdAt: string;
}
interface PlanStepView {
  id: string;
  title: string;
  who: string;
  status: string;
  needsApproval?: boolean;
}
interface PlanView {
  id: string;
  number: number;
  request: string;
  status: "planning" | "proposed" | "running" | "done" | "failed" | "cancelled" | "answered" | "error";
  plan?: { reply: string; assumptions: string[]; workflow?: string; steps: Array<{ who: string; title: string; after?: number[]; needsApproval?: boolean; reviewBy?: string }> };
  runId?: string;
  workflowId?: string;
  reply?: string;
  error?: string;
  steps: PlanStepView[];
  done: number;
  total: number;
  costUsd?: number;
  workflowName?: string;
  createdAt: string;
}
interface HistoryRow {
  runId: string;
  nodeId: string;
  title: string;
  workflowName: string;
  status: string;
  startedAt: string;
  costUsd: number;
}

type Tab = "chat" | "tasks" | "computer" | "history" | "settings";

/**
 * The AI Agent screen, where work starts: the team on the left, the selected
 * agent's panel in the middle, the live office on the right.
 */
export default function AiAgentPage() {
  const { id } = useParams<{ id: string }>();
  const { current: ws, reload } = useWorkspaces();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [latestRun, setLatestRun] = useState<RunRow | null>(null);

  const busy = plans.some((p) => p.status === "planning" || p.status === "running");
  useEffect(() => {
    let alive = true;
    const load = () => {
      void api<PlanView[]>(`/api/workspaces/${encodeURIComponent(id)}/plans`).then((p) => alive && setPlans(p)).catch(() => undefined);
      void api<RunRow[]>(`/api/runs?all=1&limit=1&teamId=${encodeURIComponent(id)}`).then((r) => alive && setLatestRun(r[0] ?? null)).catch(() => undefined);
    };
    load();
    const t = setInterval(load, busy ? 1200 : 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, busy]);

  if (!ws || ws.id !== id) return <p className="muted">Loading…</p>;
  const mainId = ws.mainAgentId ?? "";
  const agentId = selected && ws.agents.some((a) => a.id === selected) ? selected : mainId;
  const agent = ws.agents.find((a) => a.id === agentId);
  const isMain = agentId === mainId;
  const tabs: Tab[] = isMain ? ["chat", "tasks", "computer", "settings"] : ["chat", "history", "computer", "settings"];
  const shown = tabs.includes(tab) ? tab : "chat";
  const live = latestRun && (latestRun.status === "running" || latestRun.status === "paused" || latestRun.status === "pending") ? latestRun : null;
  const pick = (aid: string) => {
    setSelected(aid);
    setTab("chat");
  };

  return (
    <div className="grid gap-4 md:h-[calc(100vh-4rem)] md:grid-cols-[64px_minmax(360px,1fr)] xl:grid-cols-[64px_minmax(380px,1fr)_minmax(420px,1.1fr)]">
      {/* team strip */}
      <nav className="panel flex gap-2 overflow-x-auto p-2 md:flex-col md:items-center md:overflow-y-auto" aria-label="Team">
        {ws.agents.map((a) => (
          <button
            key={a.id}
            onClick={() => pick(a.id)}
            className="relative shrink-0 rounded-full"
            title={`${a.name} · ${a.id === mainId ? "Main agent" : a.role}`}
            aria-label={a.name}
            aria-pressed={a.id === agentId}
          >
            <Avatar name={a.name} color={a.appearance.color} sprite={a.appearance.sprite} size={42} ring={a.id === agentId ? "var(--accent)" : undefined} />
            {a.id === mainId && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ background: "var(--accent)" }}>
                <Crown size={10} />
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* selected agent */}
      <section className="panel flex min-h-[560px] min-w-0 flex-col overflow-hidden md:min-h-0">
        {agent && (
          <header className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
            <Avatar name={agent.name} color={agent.appearance.color} sprite={agent.appearance.sprite} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{agent.name}</div>
              <div className="muted truncate text-xs">{isMain ? "Main agent" : agent.role}</div>
            </div>
            {isMain && <AutoRun ws={ws} onChange={reload} />}
          </header>
        )}
        <div className="flex gap-1 border-b px-3" style={{ borderColor: "var(--line)" }} role="tablist">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={shown === t} className="utab" onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {agent && shown === "chat" && (isMain ? <MainChat ws={ws} plans={plans} live={live} onOpenTasks={() => setTab("tasks")} /> : <AgentChat ws={ws} agent={agent} onRequest={() => pick(mainId)} />)}
          {shown === "tasks" && <Tasks ws={ws} plans={plans} />}
          {shown === "history" && agent && <History ws={ws} agent={agent} />}
          {shown === "computer" && agent && <Computer runId={latestRun?.id} agent={agent} isMain={isMain} />}
          {shown === "settings" && agent && <AgentSettings agent={agent} isMain={isMain} />}
        </div>
      </section>

      {/* live office */}
      <section className="panel relative hidden min-h-0 overflow-hidden xl:block">
        {live ? <LiveOffice key={live.id} ws={ws} runId={live.id} /> : <IdleOffice ws={ws} />}
        <Link href={`/office?team=${encodeURIComponent(ws.id)}`} className="glass-btn absolute right-3 top-3" aria-label="Open the office full screen">
          <Maximize2 size={14} />
        </Link>
      </section>
    </div>
  );
}

const TAB_LABEL: Record<Tab, string> = { chat: "Chat", tasks: "Tasks", computer: "Computer", history: "History", settings: "Settings" };

function AutoRun({ ws, onChange }: { ws: Team; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/api/teams/${encodeURIComponent(ws.id)}`, { method: "PUT", json: { ...ws, agents: [], autoRun: !ws.autoRun } });
      await onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <label data-needs="edit" className="flex shrink-0 cursor-pointer items-center gap-2 text-xs" title={`Start plans without asking, up to the ${formatUsd(ws.defaults.costCapUsd)} cost cap. Sending and spending still ask.`}>
      <span className="muted">Auto-run</span>
      <button role="switch" aria-checked={ws.autoRun} aria-label="Run plans automatically" disabled={busy} onClick={toggle} className="switch" data-on={ws.autoRun} />
    </label>
  );
}

// --- Chat with the main agent ------------------------------------------------

function useThread(teamId: string, agentId: string, fast: boolean) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ messages: Message[]; waiting: boolean }>(`/api/workspaces/${encodeURIComponent(teamId)}/chat/${encodeURIComponent(agentId)}`)
        .then((r) => {
          if (!alive) return;
          setMessages(r.messages);
          setWaiting(r.waiting);
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, fast ? 1000 : 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [teamId, agentId, fast, tick]);
  return { messages, waiting, refresh: () => setTick((n) => n + 1) };
}

function MainChat({ ws, plans, live, onOpenTasks }: { ws: Team; plans: PlanView[]; live: RunRow | null; onOpenTasks: () => void }) {
  const mainId = ws.mainAgentId!;
  const planning = plans.some((p) => p.status === "planning");
  const running = plans.find((p) => p.status === "running");
  const { messages, refresh } = useThread(ws.id, mainId, planning || !!running);
  const byPlan = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  // The plan card goes under the main agent's first reply to each request.
  const firstReply = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<string>();
    for (const m of messages) if (m.role === "agent" && m.planId && !seen.has(m.planId)) (seen.add(m.planId), ids.add(m.id));
    return ids;
  }, [messages]);
  const main = ws.agents.find((a) => a.id === mainId)!;

  return (
    <>
      <Scroller deps={[messages.length, planning]}>
        {messages.length === 0 && !planning && <Hello name={main.name} goal={ws.goal} />}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} agent={main}>
            {firstReply.has(m.id) && m.planId && byPlan.get(m.planId)?.plan && <PlanCard plan={byPlan.get(m.planId)!} ws={ws} onOpenTasks={onOpenTasks} />}
          </Bubble>
        ))}
        {planning && <Typing agent={main} text="Planning…" />}
      </Scroller>
      {live && <LiveApprovals runId={live.id} ws={ws} />}
      {running && <WorkingBar plan={running} onClick={onOpenTasks} />}
      <Composer
        placeholder={`Tell ${main.name} what you need`}
        disabled={planning}
        onSend={async (text) => {
          await api(`/api/workspaces/${encodeURIComponent(ws.id)}/chat/${encodeURIComponent(mainId)}`, { json: { text } });
          refresh();
        }}
      />
    </>
  );
}

function Hello({ name, goal }: { name: string; goal: string }) {
  return (
    <div className="muted mx-auto my-8 max-w-sm text-center text-sm">
      <Wand2 size={22} className="mx-auto mb-2" style={{ color: "var(--accent)" }} />
      Ask {name} for anything{goal ? ` toward "${goal}"` : ""}. It plans the work, hands it to the team and comes back with one answer.
    </div>
  );
}

function LiveApprovals({ runId, ws }: { runId: string; ws: Team }) {
  const { state } = useRun(runId);
  const names = Object.fromEntries(ws.agents.map((a) => [a.id, a.name]));
  const colors = Object.fromEntries(ws.agents.map((a) => [a.id, a.appearance.color]));
  return (
    <div className="px-3 pb-2 empty:hidden">
      <ApprovalBanner runId={runId} state={state} names={names} colors={colors} disabled={false} />
    </div>
  );
}

function WorkingBar({ plan, onClick }: { plan: PlanView; onClick: () => void }) {
  const pct = plan.total ? Math.round((plan.done / plan.total) * 100) : 0;
  return (
    <button onClick={onClick} className="mx-3 mb-2 flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
      <Loader2 size={15} className="shrink-0 animate-spin" />
      <span className="min-w-0 flex-1 truncate">
        Team is working on: <b>{plan.request}</b>
      </span>
      <span className="shrink-0 font-semibold">
        {plan.done}/{plan.total}
      </span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,.08)" }}>
        <span className="block h-full" style={{ width: `${pct}%`, background: "var(--info)" }} />
      </span>
    </button>
  );
}

function PlanCard({ plan, ws, onOpenTasks }: { plan: PlanView; ws: Team; onOpenTasks: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = (id: string) => ws.agents.find((a) => a.id === id)?.name ?? ws.squads.find((s) => `squad:${s.id}` === id)?.name ?? id;
  const act = async (path: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/plans/${plan.id}/${path}`, { method: "POST" });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const p = plan.plan!;
  return (
    <div className="mt-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-semibold">Plan #{plan.number}</span>
        <PlanStatus status={plan.status} />
        {plan.total > 0 && plan.status !== "proposed" && (
          <span className="muted ml-auto text-xs">
            {plan.done}/{plan.total}
          </span>
        )}
      </div>
      {p.workflow ? (
        <p className="text-sm">
          Runs the saved workflow{" "}
          <Link className="font-semibold underline" href={`/workflows/${p.workflow}`}>
            {plan.workflowName ?? p.workflow}
          </Link>
          .
        </p>
      ) : (
        <ol className="space-y-1.5">
          {p.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--bg-soft)" }}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <b>{name(s.who)}</b> · {s.title}
                <span className="muted text-xs">
                  {s.after?.length ? ` · after step ${s.after.join(", ")}` : ""}
                  {s.reviewBy ? ` · checked by ${name(s.reviewBy)}` : ""}
                  {s.needsApproval ? " · needs your OK" : ""}
                </span>
              </span>
            </li>
          ))}
          <li className="muted flex items-start gap-2 text-xs">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--bg-soft)" }}>
              <Crown size={11} />
            </span>
            {name(ws.mainAgentId!)} combines the results
          </li>
        </ol>
      )}
      {p.assumptions.length > 0 && <p className="muted mt-2 text-xs">Assumed: {p.assumptions.join(" · ")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {plan.status === "proposed" && (
          <>
            <button data-needs="run" className="btn btn-sm btn-primary" disabled={busy} onClick={() => act("run")}>
              <Play size={14} /> Run plan
            </button>
            <button data-needs="run" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act("cancel")}>
              Dismiss
            </button>
          </>
        )}
        {plan.status === "running" && (
          <button data-needs="run" className="btn btn-sm" disabled={busy} onClick={() => act("cancel")}>
            <Square size={13} /> Cancel plan
          </button>
        )}
        {plan.runId && (
          <Link className="btn btn-sm btn-ghost" href={`/runs/${plan.runId}`}>
            Open run
          </Link>
        )}
        {plan.status !== "proposed" && plan.status !== "running" && (
          <button className="btn btn-sm btn-ghost" onClick={onOpenTasks}>
            Tasks
          </button>
        )}
        {plan.status === "done" && !p.workflow && <SavePlan plan={plan} />}
      </div>
      {err && <p className="mt-2 text-xs" style={{ color: "var(--bad)" }}>{err}</p>}
    </div>
  );
}

function SavePlan({ plan }: { plan: PlanView }) {
  const [saved, setSaved] = useState(plan.workflowId);
  const [err, setErr] = useState<string | null>(null);
  if (saved)
    return (
      <Link className="btn btn-sm btn-ghost" href={`/workflows/${saved}`}>
        <Check size={14} /> Saved as workflow
      </Link>
    );
  return (
    <>
      <button
        data-needs="edit"
        className="btn btn-sm"
        onClick={async () => {
          try {
            const r = await api<{ id: string }>(`/api/plans/${plan.id}/save`, { method: "POST" });
            setSaved(r.id);
          } catch (e) {
            setErr(errorText(e));
          }
        }}
      >
        <Bookmark size={14} /> Save as workflow
      </button>
      {err && <span className="text-xs" style={{ color: "var(--bad)" }}>{err}</span>}
    </>
  );
}

const PLAN_STATUS: Record<PlanView["status"], { label: string; fg: string; bg: string; live?: boolean }> = {
  planning: { label: "Planning", fg: "#7c3aed", bg: "var(--accent-soft)", live: true },
  proposed: { label: "Ready to run", fg: "var(--warn)", bg: "var(--warn-soft)" },
  running: { label: "Running", fg: "var(--info)", bg: "var(--info-soft)", live: true },
  done: { label: "Done", fg: "var(--ok)", bg: "var(--ok-soft)" },
  failed: { label: "Failed", fg: "var(--bad)", bg: "var(--bad-soft)" },
  cancelled: { label: "Cancelled", fg: "var(--muted)", bg: "var(--bg-soft)" },
  answered: { label: "Answered", fg: "var(--ok)", bg: "var(--ok-soft)" },
  error: { label: "No plan", fg: "var(--bad)", bg: "var(--bad-soft)" },
};

function PlanStatus({ status }: { status: PlanView["status"] }) {
  const s = PLAN_STATUS[status];
  return (
    <span className="chip" style={{ color: s.fg, background: s.bg }}>
      <span className={`chip-dot ${s.live ? "pulse" : ""}`} />
      {s.label}
    </span>
  );
}

// --- Chat with a sub-agent ---------------------------------------------------

function AgentChat({ ws, agent, onRequest }: { ws: Team; agent: AgentTemplate; onRequest: () => void }) {
  const [fast, setFast] = useState(false);
  const { messages, waiting, refresh } = useThread(ws.id, agent.id, fast);
  useEffect(() => setFast(waiting), [waiting]);
  return (
    <>
      <Scroller deps={[messages.length, waiting]}>
        {messages.length === 0 && <p className="muted mx-auto my-8 max-w-xs text-center text-sm">Ask {agent.name} a question. To give them work, use Request work.</p>}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} agent={agent} />
        ))}
        {waiting && <Typing agent={agent} text="Typing…" />}
      </Scroller>
      <Composer
        placeholder={`Ask ${agent.name}`}
        disabled={waiting}
        extra={(text, clear) => (
          <button
            data-needs="run"
            type="button"
            className="btn btn-sm"
            disabled={!text.trim()}
            title={`The main agent plans it with ${agent.name}`}
            onClick={async () => {
              await api(`/api/workspaces/${encodeURIComponent(ws.id)}/chat/${encodeURIComponent(ws.mainAgentId!)}`, { json: { text: `For ${agent.name}: ${text}` } });
              clear();
              onRequest();
            }}
          >
            Request work
          </button>
        )}
        onSend={async (text) => {
          await api(`/api/workspaces/${encodeURIComponent(ws.id)}/chat/${encodeURIComponent(agent.id)}`, { json: { text } });
          setFast(true);
          refresh();
        }}
      />
    </>
  );
}

// --- shared chat pieces ------------------------------------------------------

function Scroller({ children, deps }: { children: ReactNode; deps: unknown[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <div ref={ref} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {children}
    </div>
  );
}

function Bubble({ m, agent, children }: { m: Message; agent: AgentTemplate; children?: ReactNode }) {
  if (m.role === "person")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3 py-2 text-sm text-white" style={{ background: "var(--accent)" }}>
          {m.text}
        </div>
      </div>
    );
  return (
    <div className="flex items-start gap-2">
      <Avatar name={agent.name} color={agent.appearance.color} sprite={agent.appearance.sprite} size={28} />
      <div className="min-w-0 max-w-[90%]">
        <div className="rounded-2xl rounded-tl-md px-3 py-2 text-sm" style={{ background: "var(--panel-2)" }}>
          <Rich text={m.text} />
        </div>
        {children}
        <div className="muted mt-1 text-[11px]">{timeAgo(m.createdAt)}</div>
      </div>
    </div>
  );
}

/** Just enough formatting for agent replies: headings, bullets and **bold**. */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1 [overflow-wrap:anywhere]">
      {text.split("\n").map((line, i) => {
        const h = /^#{1,4}\s+(.*)$/.exec(line);
        const li = /^\s*[-*]\s+(.*)$/.exec(line);
        if (h) return <div key={i} className="font-semibold">{bold(h[1]!)}</div>;
        if (li) return <div key={i} className="flex gap-1.5"><span>•</span><span>{bold(li[1]!)}</span></div>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <div key={i}>{bold(line)}</div>;
      })}
    </div>
  );
}

function bold(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <b key={i}>{part.slice(2, -2)}</b> : part.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")));
}

function Typing({ agent, text }: { agent: AgentTemplate; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={agent.name} color={agent.appearance.color} sprite={agent.appearance.sprite} size={28} />
      <span className="muted flex items-center gap-2 text-sm">
        <Loader2 size={14} className="animate-spin" /> {text}
      </span>
    </div>
  );
}

function Composer({ placeholder, disabled, onSend, extra }: { placeholder: string; disabled?: boolean; onSend: (text: string) => Promise<void>; extra?: (text: string, clear: () => void) => ReactNode }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    setBusy(true);
    setErr(null);
    try {
      await onSend(t);
      setText("");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      data-needs="run"
      className="border-t p-3"
      style={{ borderColor: "var(--line)" }}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          className="input min-h-[44px] flex-1 resize-none"
          rows={2}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Message"
        />
        <div className="flex flex-col gap-1.5">
          {extra?.(text, () => setText(""))}
          <button className="btn btn-primary" disabled={!text.trim() || busy || disabled} aria-label="Send">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-xs" style={{ color: "var(--bad)" }}>{err}</p>}
    </form>
  );
}

// --- Tasks: plan history ------------------------------------------------------

function Tasks({ ws, plans }: { ws: Team; plans: PlanView[] }) {
  const shown = plans.filter((p) => p.plan && (p.plan.steps.length || p.plan.workflow));
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = (id: string) => ws.agents.find((a) => a.id === id)?.name ?? id;
  if (!shown.length) return <p className="muted m-auto p-8 text-center text-sm">Plans show up here once the main agent makes one.</p>;
  const act = (p: PlanView, path: string) => api(`/api/plans/${p.id}/${path}`, { method: "POST" }).catch((e) => setErr(errorText(e)));
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {err && <p className="text-xs" style={{ color: "var(--bad)" }}>{err}</p>}
      {shown.map((p) => {
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        return (
          <article key={p.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">#{p.number}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{p.request}</span>
              <PlanStatus status={p.status} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>
                <span className="block h-full" style={{ width: `${pct}%`, background: p.status === "failed" ? "var(--bad)" : "var(--accent)" }} />
              </span>
              <span className="muted text-xs">
                {p.done}/{p.total}
              </span>
            </div>
            <ol className="mt-2 space-y-1 text-sm">
              {p.steps.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2">
                  <StepDot status={s.status} />
                  <span className="min-w-0 flex-1 truncate">
                    {s.title} <span className="muted">· {name(s.who)}</span>
                    {p.plan?.steps[i]?.after?.length ? <span className="muted text-xs"> · after step {p.plan.steps[i]!.after!.join(", ")}</span> : null}
                  </span>
                  <span className="muted text-xs">{STEP_LABEL[s.status] ?? s.status}</span>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {p.reply && (
                <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                  {open === p.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Main agent&apos;s report
                </button>
              )}
              {p.status === "proposed" && (
                <button data-needs="run" className="btn btn-sm btn-primary" onClick={() => act(p, "run")}>
                  <Play size={14} /> Run plan
                </button>
              )}
              {(p.status === "running" || p.status === "proposed") && (
                <button data-needs="run" className="btn btn-sm" onClick={() => act(p, "cancel")}>
                  <Square size={13} /> Cancel plan
                </button>
              )}
              {p.runId && (
                <Link href={`/runs/${p.runId}`} className="btn btn-sm btn-ghost">
                  Open run
                </Link>
              )}
              <span className="muted ml-auto text-xs">
                {p.costUsd !== undefined ? `${formatUsd(p.costUsd)} · ` : ""}
                {timeAgo(p.createdAt)}
              </span>
            </div>
            {open === p.id && p.reply && (
              <div className="mt-2 rounded-lg p-3 text-sm" style={{ background: "var(--panel-2)" }}>
                <Rich text={p.reply} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

const STEP_LABEL: Record<string, string> = { idle: "Scheduled", queued: "Scheduled", running: "Running", waiting: "Needs you", done: "Done", failed: "Failed", skipped: "Skipped" };

function StepDot({ status }: { status: string }) {
  const color = status === "done" ? "var(--ok)" : status === "running" ? "var(--info)" : status === "waiting" ? "var(--warn)" : status === "failed" ? "var(--bad)" : "var(--line)";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${status === "running" ? "pulse" : ""}`} style={{ background: color }} />;
}

// --- Sub-agent history --------------------------------------------------------

function History({ ws, agent }: { ws: Team; agent: AgentTemplate }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const main = ws.agents.find((a) => a.id === ws.mainAgentId);
  useEffect(() => {
    api<HistoryRow[]>(`/api/workspaces/${encodeURIComponent(ws.id)}/agents/${encodeURIComponent(agent.id)}/history`).then(setRows).catch(() => setRows([]));
  }, [ws.id, agent.id]);
  if (rows && !rows.length) return <p className="muted m-auto p-8 text-center text-sm">Nothing assigned yet.</p>;
  return (
    <ul className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
      {(rows ?? []).map((r) => (
        <li key={`${r.runId}-${r.nodeId}-${r.startedAt}`}>
          <Link href={`/runs/${r.runId}`} className="flex items-center gap-3 rounded-xl border p-3 hover:border-[var(--accent)]" style={{ borderColor: "var(--line)" }}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                <span className="muted">{r.workflowName.startsWith("Plan #") ? `${main?.name ?? "Main agent"} assigned: ` : `${r.workflowName}: `}</span>
                <b>{r.title}</b>
              </div>
              <div className="muted text-xs">
                {timeAgo(r.startedAt)} · {formatUsd(r.costUsd)}
              </div>
            </div>
            <RunStatusChip status={r.status === "success" || r.status === "approved" ? "completed" : r.status === "rejected" ? "paused" : r.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// --- Computer: the live tool log ------------------------------------------------

const SHOWN: AgentTownEvent["type"][] = ["node.started", "node.completed", "node.failed", "tool.call", "tool.result", "runtime.event", "approval.requested", "approval.resolved", "output.saved"];

function Computer({ runId, agent, isMain }: { runId?: string; agent: AgentTemplate; isMain: boolean }) {
  if (!runId) return <p className="muted m-auto p-8 text-center text-sm">No activity yet.</p>;
  return <ComputerLog runId={runId} agent={agent} isMain={isMain} />;
}

function ComputerLog({ runId, agent, isMain }: { runId: string; agent: AgentTemplate; isMain: boolean }) {
  const { events, state } = useRun(runId);
  const ref = useRef<HTMLOListElement>(null);
  const mine = events.filter((e) => SHOWN.includes(e.type) && !(e.type === "runtime.event" && e.kind === "text") && (isMain || e.from === agent.id || (e.type.startsWith("node.") && state.nodes[e.nodeId ?? ""]?.agentId === agent.id)));
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [mine.length]);
  const names = Object.fromEntries(Object.values(state.agents).map((a) => [a.id, a.name]));
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <RunStatusChip status={state.status} />
        <Link href={`/runs/${runId}`} className="muted truncate hover:underline">
          {state.workflowName}
        </Link>
      </div>
      <ol ref={ref} className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-xl p-3 font-mono text-[11.5px] leading-5" style={{ background: "#14141f", color: "#d6d6e7" }}>
        {mine.length === 0 && <li style={{ color: "#8a8aa3" }}>$ waiting…</li>}
        {mine.map((e) => (
          <li key={e.seq} className="[overflow-wrap:anywhere]">
            <span style={{ color: "#6b6b85" }}>{e.ts.slice(11, 19)} </span>
            {isMain && e.from && <span style={{ color: "#a78bfa" }}>{names[e.from] ?? e.from} </span>}
            <span style={{ color: COLOR[e.type] ?? "#d6d6e7" }}>{logLine(e)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const COLOR: Partial<Record<AgentTownEvent["type"], string>> = {
  "tool.call": "#7dd3fc",
  "tool.result": "#86efac",
  "node.failed": "#fca5a5",
  "approval.requested": "#fcd34d",
  "output.saved": "#86efac",
};

function logLine(e: AgentTownEvent): string {
  switch (e.type) {
    case "node.started":
      return `▶ start ${e.nodeId} (attempt ${e.attempt})`;
    case "node.completed":
      return `✓ done ${e.nodeId}${e.outcome ? ` · ${e.outcome}` : ""} · ${e.output.length} chars`;
    case "node.failed":
      return `✗ ${e.nodeId}: ${e.error}`;
    case "tool.call":
      return `$ ${e.tool}${e.args ? ` ${JSON.stringify(e.args).slice(0, 160)}` : ""}`;
    case "tool.result":
      return `${e.ok ? "ok" : "error"} ${e.tool}: ${e.message.slice(0, 200)}`;
    case "runtime.event":
      return `${e.kind}: ${e.message.slice(0, 200)}`;
    case "approval.requested":
      return `? waiting for your OK: ${e.message}`;
    case "approval.resolved":
      return `${e.approved ? "approved" : "rejected"}${e.note ? `: ${e.note}` : ""}`;
    case "output.saved":
      return `saved ${e.file} (${e.bytes} bytes)`;
    default:
      return e.type;
  }
}

// --- Settings ----------------------------------------------------------------

function AgentSettings({ agent, isMain }: { agent: AgentTemplate; isMain: boolean }) {
  return (
    <div className="space-y-4 p-4 text-sm">
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
        <dt className="muted">Runtime</dt>
        <dd>{agent.runtime || "Workspace default"}</dd>
        <dt className="muted">Model</dt>
        <dd className="font-mono text-xs">{agent.model?.id ?? "Workspace default"}</dd>
        <dt className="muted">Skills</dt>
        <dd>{agent.skills.filter((s) => s.enabled).length || "—"}</dd>
      </dl>
      <div>
        <div className="muted mb-1">{isMain ? "How it leads" : "Instructions"}</div>
        <p className="whitespace-pre-wrap rounded-lg p-3" style={{ background: "var(--panel-2)" }}>
          {agent.systemPrompt || "—"}
        </p>
      </div>
      <Link data-needs="edit" href={`/agents/${encodeURIComponent(agent.id)}?tab=settings`} className="btn btn-sm">
        <Settings2 size={14} /> Edit
      </Link>
    </div>
  );
}

// --- the office column -------------------------------------------------------

function IdleOffice({ ws }: { ws: Team }) {
  const reporters = useReporters(ws.id);
  const people: OfficePerson[] = useMemo(
    () => [...ws.agents.map((a) => ({ id: a.id, name: a.name, color: a.appearance.color, status: "idle" as const, sprite: a.appearance.sprite })), ...reporterPeople(reporters)],
    [ws, reporters],
  );
  return <Office people={people} height="100%" defaultMode={ws.officeStyle} viewScope={ws.id} controlsAt="bottom-center" />;
}

function LiveOffice({ ws, runId }: { ws: Team; runId: string }) {
  const { state } = useRun(runId);
  const reporters = useReporters(ws.id);
  const people: OfficePerson[] = useMemo(() => {
    const live = officePeople(state);
    const ids = new Set(live.map((p) => p.id));
    // Teammates not in this run (e.g. while the main agent plans) stay at their desks.
    const rest = ws.agents.filter((a) => !ids.has(a.id)).map((a) => ({ id: a.id, name: a.name, color: a.appearance.color, status: "idle" as const, sprite: a.appearance.sprite }));
    return [...live, ...rest, ...reporterPeople(reporters)];
  }, [state, ws, reporters]);
  return <Office people={people} height="100%" simulated={isSimulatedRun(state)} defaultMode={ws.officeStyle} viewScope={ws.id} controlsAt="bottom-center" />;
}
