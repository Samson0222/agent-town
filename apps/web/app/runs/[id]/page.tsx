"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Columns3, History, Network, Pause, Play, Radio, Square } from "lucide-react";
import { pendingApprovals } from "@agent-town/core";
import { FlowGraph } from "@/components/FlowGraph";
import { Office } from "@/components/Office";
import { ActivityFeed, AgentDrawer, ApprovalBanner, Board, CostMeter, Outputs, StepsPanel, TeamRoster } from "@/components/RunPanels";
import { RunStatusChip } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useRun } from "@/lib/useRun";

type View = "office" | "graph" | "board";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, events, visibleEvents, state, connected, error, replaySeq, setReplaySeq } = useRun(id);
  const [view, setView] = useState<View>("office");
  const [selected, setSelected] = useState<string | null>(null);
  const [ctrlErr, setCtrlErr] = useState<string | null>(null);

  const agents = useMemo(() => state.agentOrder.map((a) => state.agents[a]!).filter(Boolean), [state]);
  const names = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])), [agents]);
  const colors = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.color])), [agents]);
  const people = useMemo(
    () => agents.map((a) => ({ id: a.id, name: a.name, color: a.color, status: a.status, tool: a.currentTool, message: a.message, sprite: a.sprite })),
    [agents],
  );
  const labels = useMemo(() => Object.fromEntries((detail?.run.workflow.nodes ?? []).map((n) => [n.id, n.label || n.id])), [detail]);

  if (error) return <p style={{ color: "var(--bad)" }}>{error}</p>;
  if (!detail) return <p className="muted">Loading run…</p>;

  const { workflow, team } = detail.run;
  const lastSeq = events.at(-1)?.seq ?? 0;
  const replaying = replaySeq != null;
  const terminal = ["completed", "failed", "stopped"].includes(state.status);
  const live = !terminal && !replaying;
  const goal = Object.values(state.inputs)[0] ?? "";
  const workSteps = workflow.nodes.filter((n) => n.type === "agentTask" || n.type === "merge" || n.type === "toolCall");
  const doneSteps = workSteps.filter((n) => state.nodes[n.id]?.status === "done").length;
  const progress = workSteps.length ? Math.round((doneSteps / workSteps.length) * 100) : 0;
  const waiting = pendingApprovals(state).length;
  const agent = selected ? state.agents[selected] : undefined;

  const control = async (action: "pause" | "resume" | "stop") => {
    if (action === "stop" && !confirm("Stop this run? Running steps are cancelled.")) return;
    setCtrlErr(null);
    try {
      await api(`/api/runs/${id}/${action}`, { json: {} });
    } catch (e) {
      setCtrlErr(errorText(e));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="panel p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Link href="/runs" className="btn btn-ghost btn-icon" aria-label="Back to runs">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">{state.workflowName ?? workflow.name}</h1>
              <RunStatusChip status={state.status} />
              {!terminal && !replaying && (
                <span className="muted flex items-center gap-1 text-xs">
                  <Radio size={12} className={connected ? "pulse" : ""} style={{ color: connected ? "var(--ok)" : "var(--muted)" }} />
                  {connected ? "Live" : "Reconnecting…"}
                </span>
              )}
              {replaying && <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>Replay</span>}
            </div>
            {goal && <p className="ink-2 mt-1 line-clamp-2 text-sm">“{goal}”</p>}
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 max-w-md flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>
                <div className="h-2 rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} />
              </div>
              <span className="muted text-xs">
                {doneSteps} of {workSteps.length} steps
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {state.status === "paused" ? (
              <button className="btn btn-primary" disabled={!live} onClick={() => control("resume")}>
                <Play size={16} /> Resume
              </button>
            ) : (
              <button className="btn" disabled={!live || state.status !== "running"} onClick={() => control("pause")}>
                <Pause size={16} /> Pause
              </button>
            )}
            <button className="btn btn-danger" disabled={!live} onClick={() => control("stop")}>
              <Square size={15} /> Stop
            </button>
          </div>
        </div>
        {ctrlErr && <p className="mt-2 text-sm" style={{ color: "var(--bad)" }}>{ctrlErr}</p>}
        {state.error && <p className="mt-3 rounded-lg p-2 text-sm" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>{state.error}</p>}
        {state.endReason && <p className="mt-3 rounded-lg p-2 text-sm" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>{state.endReason}</p>}
      </header>

      <ApprovalBanner runId={id} state={state} names={names} colors={colors} disabled={!live} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {/* Main stage */}
          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
              <div className="tabs">
                <button className="tab" data-active={view === "office"} onClick={() => setView("office")}>
                  <Building2 size={15} /> Office
                </button>
                <button className="tab" data-active={view === "graph"} onClick={() => setView("graph")}>
                  <Network size={15} /> Workflow
                </button>
                <button className="tab" data-active={view === "board"} onClick={() => setView("board")}>
                  <Columns3 size={15} /> Board
                </button>
              </div>
              {waiting > 0 && (
                <span className="chip" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                  <span className="chip-dot pulse" /> {waiting} waiting for you
                </span>
              )}
              <span className="muted ml-auto hidden text-xs lg:block">Click a person to see their work</span>

            </div>
            <div style={{ height: view === "office" ? 480 : 560 }} className={view === "office" ? "" : "p-3"}>
              {view === "office" && <Office people={people} onAgentClick={setSelected} selectedId={selected} height={480} />}
              {view === "graph" && <FlowGraph workflow={workflow} team={team} statuses={state.nodes} height="100%" bare />}
              {view === "board" && <Board state={state} names={names} colors={colors} onSelect={(a) => a && setSelected(a)} />}
            </div>
            {/* Replay */}
            <div className="flex items-center gap-3 border-t px-4 py-2.5 text-xs" style={{ borderColor: "var(--line)" }}>
              <History size={14} className="muted" />
              <span className="muted">Replay</span>
              <input
                type="range"
                className="flex-1 accent-[var(--accent)]"
                min={1}
                max={Math.max(1, lastSeq)}
                value={replaySeq ?? lastSeq}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setReplaySeq(v >= lastSeq ? null : v);
                }}
              />
              <span className="muted w-20 text-right font-mono">
                {replaySeq ?? lastSeq} / {lastSeq}
              </span>
              {replaying && (
                <button className="btn btn-sm" onClick={() => setReplaySeq(null)}>
                  Back to live
                </button>
              )}
            </div>
          </section>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="panel p-5">
              <ActivityFeed events={visibleEvents} names={names} labels={labels} colors={colors} />
            </section>
            <section className="panel p-5">
              <StepsPanel runId={id} state={state} workflow={workflow} team={team} live={live} />
            </section>
          </div>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5">
            <div className="section-title mb-3">Team</div>
            <TeamRoster agents={agents} state={state} labels={labels} onSelect={setSelected} selected={selected} />
          </section>
          <section className="panel p-5">
            <div className="section-title mb-3">Outputs</div>
            <Outputs runId={id} files={state.files} vaultDir={detail.vaultDir} />
          </section>
          <section className="panel p-5">
            <div className="section-title mb-3">Cost</div>
            <CostMeter state={state} names={names} />
          </section>
          {state.warnings.length > 0 && (
            <details className="panel p-4 text-xs">
              <summary className="muted cursor-pointer">{state.warnings.length} setup notes from the pre-run check</summary>
              <ul className="mt-2 space-y-1" style={{ color: "var(--warn)" }}>
                {state.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>

      {agent && <AgentDrawer agent={agent} state={state} events={visibleEvents} names={names} labels={labels} onClose={() => setSelected(null)} />}
    </div>
  );
}
