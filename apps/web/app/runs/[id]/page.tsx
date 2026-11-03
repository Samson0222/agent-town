"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { pendingApprovals } from "@agent-town/core";
import { FlowGraph } from "@/components/FlowGraph";
import { Office } from "@/components/Office";
import { AgentDetail, Approvals, Board, Controls, CostPanel, EventLog, Files } from "@/components/RunPanels";
import { useRun } from "@/lib/useRun";

type View = "office" | "graph" | "board";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, events, visibleEvents, state, connected, error, replaySeq, setReplaySeq } = useRun(id);
  const [view, setView] = useState<View>("office");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const agents = useMemo(() => state.agentOrder.map((a) => state.agents[a]!).filter(Boolean), [state]);
  const names = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])), [agents]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!detail) return <p className="muted">Loading run…</p>;

  const { workflow, team } = detail.run;
  const lastSeq = events.at(-1)?.seq ?? 0;
  const replaying = replaySeq != null;
  const terminal = ["completed", "failed", "stopped"].includes(state.status);
  const liveOnServer = !terminal && (detail.live || events.length > 0);
  const waiting = pendingApprovals(state).length;
  const agent = selectedAgent ? state.agents[selectedAgent] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="muted text-sm">
          ← Runs
        </Link>
        <h1 className="text-lg font-semibold">{state.workflowName ?? workflow.name}</h1>
        <StatusPill status={state.status} />
        {!terminal && (
          <span className="muted text-xs" title="Live event stream">
            {connected ? "● live" : "○ reconnecting…"}
          </span>
        )}
        {waiting > 0 && <span className="rounded bg-amber-500 px-2 py-0.5 text-xs text-white">✋ {waiting} waiting for you</span>}
        <span className="muted ml-auto font-mono text-xs">{id.slice(0, 8)}</span>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.endReason && <p className="text-sm text-amber-600">{state.endReason}</p>}
      {state.warnings.length > 0 && (
        <details className="text-xs text-amber-600">
          <summary className="cursor-pointer">{state.warnings.length} preflight notes</summary>
          <ul className="mt-1 list-disc pl-5">
            {state.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="panel p-3">
            <div className="mb-2 flex items-center gap-1">
              {(["office", "graph", "board"] as View[]).map((v) => (
                <button key={v} className={`btn btn-sm ${view === v ? "btn-primary" : ""}`} onClick={() => setView(v)}>
                  {v === "office" ? "🏢 Office" : v === "graph" ? "🕸 Graph" : "📋 Board"}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-xs">
                <span className="muted">Replay</span>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, lastSeq)}
                  value={replaySeq ?? lastSeq}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setReplaySeq(v >= lastSeq ? null : v);
                  }}
                />
                <span className="w-16 font-mono">
                  {replaySeq ?? lastSeq}/{lastSeq}
                </span>
                {replaying && (
                  <button className="btn btn-sm" onClick={() => setReplaySeq(null)}>
                    Live
                  </button>
                )}
              </div>
            </div>
            {view === "office" && (
              <Office agents={agents} events={visibleEvents} runStatus={state.status} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} live={!replaying} />
            )}
            {view === "graph" && <FlowGraph workflow={workflow} team={team} statuses={state.nodes} height={460} />}
            {view === "board" && <Board state={state} names={names} onSelect={(a) => a && setSelectedAgent(a)} />}
            <div className="mt-2 flex flex-wrap gap-2">
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAgent(a.id === selectedAgent ? null : a.id)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                  style={{ border: `1px solid ${a.id === selectedAgent ? "var(--accent)" : "var(--line)"}` }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                  {a.name}: <b>{a.status}</b>
                </button>
              ))}
            </div>
          </div>

          <div className="panel p-3">
            {agent ? (
              <>
                <div className="mb-2 flex justify-end">
                  <button className="btn btn-sm" onClick={() => setSelectedAgent(null)}>
                    Show full log
                  </button>
                </div>
                <AgentDetail agent={agent} state={state} events={visibleEvents} names={names} />
              </>
            ) : (
              <>
                <h2 className="mb-2 font-semibold">Messages, tools &amp; logs</h2>
                <EventLog events={visibleEvents} names={names} />
              </>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <section className="panel p-3">
            <h2 className="mb-2 font-semibold">Waiting for you</h2>
            <Approvals runId={id} state={state} names={names} disabled={replaying || terminal} />
          </section>
          <section className="panel p-3">
            <h2 className="mb-2 font-semibold">Controls</h2>
            <Controls runId={id} state={state} workflow={workflow} team={team} live={liveOnServer && !replaying} />
          </section>
          <section className="panel p-3">
            <h2 className="mb-2 font-semibold">Cost</h2>
            <CostPanel state={state} names={names} />
          </section>
          <section className="panel p-3">
            <h2 className="mb-2 font-semibold">Outputs</h2>
            <Files runId={id} files={state.files} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color: Record<string, string> = { running: "#2563eb", paused: "#d97706", completed: "#16a34a", failed: "#dc2626", stopped: "#6b7280", pending: "#6b7280" };
  return (
    <span className="rounded px-2 py-0.5 text-xs text-white" style={{ background: color[status] ?? "#6b7280" }}>
      {status}
    </span>
  );
}
