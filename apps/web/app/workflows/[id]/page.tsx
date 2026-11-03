"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { parseWorkflow, type EdgeCondition, type Team, type Workflow, type WorkflowNode, type WorkflowIssue } from "@agent-town/core";
import { FlowGraph, NODE_META } from "@/components/FlowGraph";
import { StepListMode } from "@/components/StepList";
import { api, download, errorText, type PreflightResult, type ToolInfo } from "@/lib/api";

type Sel = { kind: "node" | "edge"; id: string } | null;
type NodePatch = { label?: string; maxRuns?: number; config?: Record<string, unknown> };

function defaultConfig(type: WorkflowNode["type"], team?: Team): WorkflowNode["config"] {
  const agentId = team?.agents[0]?.id ?? "";
  switch (type) {
    case "agentTask":
      return { agentId, prompt: "{{input.goal}}", requires: [] };
    case "merge":
      return { agentId: undefined, prompt: "", requires: [] };
    case "toolCall":
      return { tool: "vault.write_file", args: { file: "notes.md", content: "{{upstream}}" } };
    case "humanApproval":
      return { message: "Please review and approve." };
    default:
      return {};
  }
}

export default function WorkflowBuilder() {
  const { id } = useParams<{ id: string }>();
  const [wf, setWf] = useState<Workflow | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [issues, setIssues] = useState<WorkflowIssue[]>([]);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"graph" | "json">("graph");
  const [jsonText, setJsonText] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ workflow: Workflow; issues: WorkflowIssue[] }>(`/api/workflows/${id}`),
      api<Team[]>("/api/teams"),
      api<{ tools: ToolInfo[] }>("/api/connectors"),
    ])
      .then(([w, t, c]) => {
        setWf(w.workflow);
        setIssues(w.issues);
        setTeams(t);
        setTools(c.tools);
      })
      .catch((e) => setMsg({ ok: false, text: errorText(e) }));
  }, [id]);

  if (!wf) return <p className="muted">{msg?.text ?? "Loading…"}</p>;
  const team = teams.find((t) => t.id === wf.teamId);
  const update = (next: Workflow) => {
    setWf(next);
    setDirty(true);
  };

  async function save(next = wf!) {
    try {
      const r = await api<{ workflow: Workflow; issues: WorkflowIssue[] }>(`/api/workflows/${id}`, { method: "PUT", json: next });
      setWf(r.workflow);
      setIssues(r.issues);
      setDirty(false);
      setMsg({ ok: true, text: `Saved revision ${r.workflow.revision}.` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  async function check() {
    if (dirty) await save();
    try {
      setPreflight(await api<PreflightResult>(`/api/workflows/${id}/preflight`, { json: {} }));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  function addNode(type: WorkflowNode["type"]) {
    let i = wf!.nodes.length + 1;
    while (wf!.nodes.some((n) => n.id === `${type}-${i}`)) i++;
    const node = {
      id: `${type}-${i}`,
      type,
      label: NODE_META[type].name,
      position: { x: 80 + (i % 5) * 40, y: 80 + (i % 7) * 30 },
      maxRuns: 3,
      config: defaultConfig(type, team),
    } as WorkflowNode;
    update({ ...wf!, nodes: [...wf!.nodes, node] });
    setSel({ kind: "node", id: node.id });
  }

  const node = sel?.kind === "node" ? wf.nodes.find((n) => n.id === sel.id) : undefined;
  const edge = sel?.kind === "edge" ? wf.edges.find((e) => e.id === sel.id) : undefined;
  const setNode = (patch: NodePatch) =>
    update({ ...wf, nodes: wf.nodes.map((n) => (n.id === node!.id ? ({ ...n, ...patch, config: { ...n.config, ...(patch.config ?? {}) } } as WorkflowNode) : n)) });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/workflows" className="muted text-sm">
          ← Workflows
        </Link>
        <input className="input max-w-xs text-lg font-semibold" value={wf.name} onChange={(e) => update({ ...wf, name: e.target.value })} />
        <select className="input max-w-48" value={wf.teamId} onChange={(e) => update({ ...wf, teamId: e.target.value })} title="Team">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="muted text-xs">rev {wf.revision} · schema v{wf.schemaVersion}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={check}>
            Check
          </button>
          <button className="btn" onClick={() => download(`${wf.id}.workflow.json`, JSON.stringify(wf, null, 2))}>
            Export JSON
          </button>
          <button className="btn btn-primary" onClick={() => save()} disabled={!dirty}>
            {dirty ? "Save" : "Saved"}
          </button>
          <Link className="btn" href="/">
            Run…
          </Link>
        </div>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}

      {wf.simple && tab !== "json" ? (
        <StepListMode
          wf={wf}
          team={team}
          update={update}
          issues={preflight ? preflight.issues : issues}
          onJson={() => {
            setJsonText(JSON.stringify(wf, null, 2));
            setTab("json");
          }}
          onAdvanced={() => setTab("graph")}
        />
      ) : (
      <div className="grid gap-3 lg:grid-cols-[180px_1fr_340px]">
        <aside className="panel space-y-1 p-3">
          <div className="muted mb-1 text-xs">Add node</div>
          {(Object.keys(NODE_META) as WorkflowNode["type"][]).map((t) => (
            <button key={t} className="btn btn-sm w-full justify-start" onClick={() => addNode(t)}>
              <span style={{ color: NODE_META[t].color }}>{NODE_META[t].icon}</span> {NODE_META[t].name}
            </button>
          ))}
          <p className="muted pt-2 text-[11px] leading-snug">
            Drag from a node&apos;s bottom handle to another node to connect. Select + Delete removes. Click an edge to set its condition.
          </p>
        </aside>

        <div>
          <div className="mb-2 flex gap-1">
            <button className={`btn btn-sm ${tab === "graph" ? "btn-primary" : ""}`} onClick={() => setTab("graph")}>
              {wf.simple ? "Back to steps" : "Graph"}
            </button>
            <button
              className={`btn btn-sm ${tab === "json" ? "btn-primary" : ""}`}
              onClick={() => {
                setJsonText(JSON.stringify(wf, null, 2));
                setTab("json");
              }}
            >
              JSON
            </button>
          </div>
          {tab === "graph" ? (
            <FlowGraph workflow={wf} team={team} editable selected={sel} onSelect={setSel} onChange={update} height="68vh" />
          ) : (
            <div className="panel p-2">
              <textarea className="input h-[62vh] font-mono text-xs" value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
              <button
                className="btn mt-2"
                onClick={() => {
                  try {
                    const parsed = parseWorkflow(JSON.parse(jsonText));
                    update({ ...parsed, id: wf.id });
                    setMsg({ ok: true, text: "JSON applied — remember to save." });
                    setTab("graph");
                  } catch (e) {
                    setMsg({ ok: false, text: `Invalid workflow JSON: ${errorText(e)}` });
                  }
                }}
              >
                Apply JSON
              </button>
            </div>
          )}
        </div>

        <aside className="panel space-y-3 overflow-auto p-3" style={{ maxHeight: "74vh" }}>
          {node ? (
            <NodeInspector node={node} team={team} tools={tools} setNode={setNode} wf={wf} update={update} />
          ) : edge ? (
            <EdgeInspector
              edge={edge}
              onChange={(patch) => update({ ...wf, edges: wf.edges.map((e) => (e.id === edge.id ? { ...e, ...patch } : e)) })}
              onDelete={() => {
                update({ ...wf, edges: wf.edges.filter((e) => e.id !== edge.id) });
                setSel(null);
              }}
            />
          ) : (
            <WorkflowSettings wf={wf} update={update} />
          )}

          {(issues.length > 0 || preflight) && (
            <div className="border-t pt-3 text-xs" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 font-semibold">Checks</div>
              {preflight?.ok && <p className="text-green-600">✓ Preflight passed.</p>}
              <ul className="space-y-1">
                {(preflight?.issues ?? issues).map((i, k) => (
                  <li key={k} className={i.level === "error" ? "text-red-600" : "text-amber-600"}>
                    {i.level === "error" ? "✗" : "⚠"} {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

function WorkflowSettings({ wf, update }: { wf: Workflow; update: (w: Workflow) => void }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">Workflow</h3>
      <label className="field">
        Description
        <textarea className="input" rows={2} value={wf.description} onChange={(e) => update({ ...wf, description: e.target.value })} />
      </label>
      <label className="field">
        Cost cap override (USD, blank = team default)
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          value={wf.settings.costCapUsd ?? ""}
          onChange={(e) => update({ ...wf, settings: { ...wf.settings, costCapUsd: e.target.value === "" ? undefined : Number(e.target.value) } })}
        />
      </label>
      <label className="field">
        Handoff size limit (chars)
        <input
          className="input"
          type="number"
          min="200"
          value={wf.settings.handoffMaxChars}
          onChange={(e) => update({ ...wf, settings: { ...wf.settings, handoffMaxChars: Number(e.target.value) || 4000 } })}
        />
      </label>
      <label className="field">
        Entry nodes (comma-separated ids; blank = nodes with no incoming edge)
        <input
          className="input font-mono"
          value={(wf.entryNodeIds ?? []).join(", ")}
          onChange={(e) => {
            const ids = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            update({ ...wf, entryNodeIds: ids.length ? ids : undefined });
          }}
        />
      </label>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Run inputs</h4>
        <button
          className="btn btn-sm"
          onClick={() => update({ ...wf, inputs: [...wf.inputs, { key: `input${wf.inputs.length + 1}`, label: "", type: "text", required: false }] })}
        >
          + Input
        </button>
      </div>
      {wf.inputs.map((inp, i) => (
        <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-1">
          <input
            className="input font-mono text-xs"
            value={inp.key}
            onChange={(e) => update({ ...wf, inputs: wf.inputs.map((x, k) => (k === i ? { ...x, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") } : x)) })}
          />
          <input
            className="input text-xs"
            placeholder="Label"
            value={inp.label}
            onChange={(e) => update({ ...wf, inputs: wf.inputs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })}
          />
          <button className="btn btn-sm btn-danger" onClick={() => update({ ...wf, inputs: wf.inputs.filter((_, k) => k !== i) })}>
            ✕
          </button>
          <input
            className="input col-span-3 text-xs"
            placeholder="Default value"
            value={inp.default ?? ""}
            onChange={(e) => update({ ...wf, inputs: wf.inputs.map((x, k) => (k === i ? { ...x, default: e.target.value || undefined } : x)) })}
          />
        </div>
      ))}
      <p className="muted text-[11px]">
        Use <code>{"{{input.key}}"}</code>, <code>{"{{nodes.<id>.output}}"}</code>, <code>{"{{upstream}}"}</code> and <code>{"{{feedback}}"}</code> in prompts.
      </p>
    </div>
  );
}

function NodeInspector(props: {
  node: WorkflowNode;
  team?: Team;
  tools: ToolInfo[];
  wf: Workflow;
  update: (w: Workflow) => void;
  setNode: (patch: NodePatch) => void;
}) {
  const { node, team, tools, setNode } = props;
  const meta = NODE_META[node.type];
  const agentSelect = (value: string | undefined, allowNone: boolean) => (
    <label className="field">
      Agent
      <select className="input" value={value ?? ""} onChange={(e) => setNode({ config: { agentId: e.target.value || undefined } })}>
        {allowNone && <option value="">(none)</option>}
        {team?.agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} — {a.role}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div>
      <h3 className="mb-2 font-semibold" style={{ color: meta.color }}>
        {meta.icon} {meta.name}
      </h3>
      <label className="field">
        Id
        <input className="input font-mono" value={node.id} disabled />
      </label>
      <label className="field">
        Label
        <input className="input" value={node.label} onChange={(e) => setNode({ label: e.target.value })} />
      </label>

      {(node.type === "agentTask" || node.type === "merge") && (
        <>
          {agentSelect(node.config.agentId, node.type === "merge")}
          <label className="field">
            Prompt
            <textarea className="input font-mono text-xs" rows={8} value={node.config.prompt} onChange={(e) => setNode({ config: { prompt: e.target.value } })} />
          </label>
          <label className="field">
            Save output as (optional, e.g. brief.md, landing.html)
            <input className="input font-mono" value={node.config.outputFile ?? ""} onChange={(e) => setNode({ config: { outputFile: e.target.value || undefined } })} />
          </label>
          <label className="field">
            Required runtime capabilities (comma-separated)
            <input
              className="input font-mono text-xs"
              value={node.config.requires.join(", ")}
              onChange={(e) => setNode({ config: { requires: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
            />
          </label>
        </>
      )}

      {node.type === "toolCall" && (
        <>
          <label className="field">
            Tool
            <select className="input font-mono" value={node.config.tool} onChange={(e) => setNode({ config: { tool: e.target.value } })}>
              {tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} ({t.category})
                </option>
              ))}
            </select>
          </label>
          {agentSelect(node.config.agentId, true)}
          <label className="field">
            Arguments (JSON; strings are templates)
            <ArgsEditor value={node.config.args} onChange={(args) => setNode({ config: { args } })} />
          </label>
        </>
      )}

      {node.type === "humanApproval" && (
        <>
          <label className="field">
            Message
            <textarea className="input" rows={3} value={node.config.message} onChange={(e) => setNode({ config: { message: e.target.value } })} />
          </label>
          {agentSelect(node.config.agentId, true)}
          <p className="muted text-[11px]">Connect outgoing edges with condition “approved” and “rejected”.</p>
        </>
      )}

      {node.type === "branch" && <p className="muted text-xs">Edges are tested in order; the first match wins. Use “default” for the else path.</p>}
      {node.type === "parallel" && <p className="muted text-xs">Every outgoing edge runs at the same time.</p>}

      <label className="field">
        Max runs per run (loop guard)
        <input className="input" type="number" min="1" value={node.maxRuns} onChange={(e) => setNode({ maxRuns: Math.max(1, Number(e.target.value) || 1) })} />
      </label>
      <button
        className="btn btn-sm btn-danger"
        onClick={() =>
          props.update({ ...props.wf, nodes: props.wf.nodes.filter((n) => n.id !== node.id), edges: props.wf.edges.filter((e) => e.source !== node.id && e.target !== node.id) })
        }
      >
        Delete node
      </button>
    </div>
  );
}

function ArgsEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <textarea
      className="input font-mono text-xs"
      rows={6}
      value={text}
      style={bad ? { borderColor: "#dc2626" } : undefined}
      onChange={(e) => {
        setText(e.target.value);
        try {
          onChange(JSON.parse(e.target.value));
          setBad(false);
        } catch {
          setBad(true);
        }
      }}
    />
  );
}

const CONDITIONS: EdgeCondition["type"][] = ["always", "contains", "notContains", "equals", "matches", "approved", "rejected", "default"];

function EdgeInspector(props: { edge: Workflow["edges"][number]; onChange: (p: Partial<Workflow["edges"][number]>) => void; onDelete: () => void }) {
  const { edge } = props;
  const c = edge.condition;
  const hasValue = "value" in c;
  return (
    <div>
      <h3 className="mb-2 font-semibold">Edge {edge.id}</h3>
      <p className="muted mb-2 font-mono text-xs">
        {edge.source} → {edge.target}
      </p>
      <label className="field">
        Label
        <input className="input" value={edge.label ?? ""} onChange={(e) => props.onChange({ label: e.target.value || undefined })} />
      </label>
      <label className="field">
        Condition
        <select
          className="input"
          value={c.type}
          onChange={(e) => {
            const type = e.target.value as EdgeCondition["type"];
            const needs = ["contains", "notContains", "equals", "matches"].includes(type);
            props.onChange({ condition: (needs ? { type, value: hasValue ? c.value : "" } : { type }) as EdgeCondition });
          }}
        >
          {CONDITIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      {hasValue && (
        <label className="field">
          Value (tested against the source node&apos;s output, case-insensitive)
          <input className="input font-mono" value={c.value} onChange={(e) => props.onChange({ condition: { ...c, value: e.target.value } })} />
        </label>
      )}
      <button className="btn btn-sm btn-danger" onClick={props.onDelete}>
        Delete edge
      </button>
    </div>
  );
}
