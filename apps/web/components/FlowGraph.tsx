"use client";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useMemo } from "react";
import type { NodeRunStatus, Team, Workflow, WorkflowEdge, WorkflowNode } from "@agent-town/core";

export const NODE_META: Record<WorkflowNode["type"], { icon: string; name: string; color: string }> = {
  agentTask: { icon: "🧑‍💼", name: "Agent Task", color: "#4f86f7" },
  parallel: { icon: "⑂", name: "Parallel fan-out", color: "#0ea5e9" },
  branch: { icon: "◇", name: "Branch / Condition", color: "#a855f7" },
  toolCall: { icon: "🔧", name: "Tool Call", color: "#64748b" },
  humanApproval: { icon: "✋", name: "Human Approval", color: "#d97706" },
  merge: { icon: "⨁", name: "Merge / Synthesis", color: "#14b8a6" },
  end: { icon: "■", name: "End", color: "#6b7280" },
};

const STATUS_RING: Record<NodeRunStatus, string> = {
  idle: "transparent",
  queued: "#94a3b8",
  running: "#2563eb",
  waiting: "#d97706",
  done: "#16a34a",
  failed: "#dc2626",
  skipped: "#9ca3af",
};

type AtNodeData = { node: WorkflowNode; agentName?: string; agentColor?: string; status?: NodeRunStatus; attempts?: number };

function AtNode({ data, selected }: NodeProps<Node<AtNodeData>>) {
  const meta = NODE_META[data.node.type];
  const ring = data.status ? STATUS_RING[data.status] : "transparent";
  const active = data.status === "running" || data.status === "waiting";
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{
        background: "var(--panel)",
        color: "var(--ink)",
        border: `2px solid ${selected ? "var(--accent)" : meta.color}`,
        boxShadow: ring !== "transparent" ? `0 0 0 3px ${ring}${active ? "" : "88"}` : undefined,
        minWidth: 160,
        maxWidth: 220,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: meta.color }}>
        <span>{meta.icon}</span> {meta.name}
        {data.attempts && data.attempts > 1 ? <span className="muted ml-auto">×{data.attempts}</span> : null}
      </div>
      <div className="font-medium leading-tight">{data.node.label || data.node.id}</div>
      {data.agentName && (
        <div className="mt-1 flex items-center gap-1 text-[11px]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: data.agentColor }} />
          {data.agentName}
        </div>
      )}
      {data.node.type === "toolCall" && <div className="muted font-mono text-[10px]">{data.node.config.tool}</div>}
      {data.status && data.status !== "idle" && (
        <div className="mt-1 text-[10px] font-semibold uppercase" style={{ color: STATUS_RING[data.status] }}>
          {data.status === "waiting" ? "waiting for you" : data.status}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { at: AtNode };

export function edgeLabel(e: WorkflowEdge): string | undefined {
  if (e.label) return e.label;
  const c = e.condition;
  switch (c.type) {
    case "always":
      return undefined;
    case "default":
      return "else";
    case "approved":
    case "rejected":
      return c.type;
    default:
      return `${c.type} "${c.value}"`;
  }
}

export function FlowGraph(props: {
  workflow: Workflow;
  team?: Team;
  statuses?: Record<string, { status: NodeRunStatus; attempts: number; agentId?: string }>;
  editable?: boolean;
  selected?: { kind: "node" | "edge"; id: string } | null;
  onSelect?: (s: { kind: "node" | "edge"; id: string } | null) => void;
  onChange?: (wf: Workflow) => void;
  height?: number | string;
}) {
  const { workflow, team, statuses, editable } = props;
  const agents = useMemo(() => new Map((team?.agents ?? []).map((a) => [a.id, a])), [team]);

  const nodes: Node<AtNodeData>[] = workflow.nodes.map((n) => {
    const st = statuses?.[n.id];
    const agentId = st?.agentId ?? ("agentId" in n.config ? (n.config.agentId as string | undefined) : undefined);
    const agent = agentId ? agents.get(agentId) : undefined;
    return {
      id: n.id,
      type: "at",
      position: n.position,
      selected: props.selected?.kind === "node" && props.selected.id === n.id,
      data: { node: n, agentName: agent?.name ?? agentId, agentColor: agent?.appearance.color, status: st?.status, attempts: st?.attempts },
      draggable: !!editable,
    };
  });

  const edges: Edge[] = workflow.edges.map((e) => {
    const srcStatus = statuses?.[e.source]?.status;
    const tgtStatus = statuses?.[e.target]?.status;
    const live = srcStatus === "done" && (tgtStatus === "running" || tgtStatus === "queued" || tgtStatus === "waiting");
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: edgeLabel(e),
      animated: live,
      selected: props.selected?.kind === "edge" && props.selected.id === e.id,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: e.condition.type === "rejected" || e.condition.type === "default" ? { strokeDasharray: "5 4" } : undefined,
    };
  });

  const onNodesChange = (changes: NodeChange<Node<AtNodeData>>[]) => {
    if (!editable || !props.onChange) return;
    const moved = applyNodeChanges(changes, nodes);
    let changed = false;
    const removed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
    const next = workflow.nodes
      .filter((n) => !removed.has(n.id))
      .map((n) => {
        const m = moved.find((x) => x.id === n.id);
        if (m && (m.position.x !== n.position.x || m.position.y !== n.position.y)) {
          changed = true;
          return { ...n, position: { x: Math.round(m.position.x), y: Math.round(m.position.y) } };
        }
        return n;
      });
    if (removed.size) {
      changed = true;
      props.onSelect?.(null);
    }
    if (changed) {
      props.onChange({ ...workflow, nodes: next, edges: workflow.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)) });
    }
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    if (!editable || !props.onChange) return;
    const removed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
    if (removed.size) {
      props.onChange({ ...workflow, edges: workflow.edges.filter((e) => !removed.has(e.id)) });
      props.onSelect?.(null);
    }
  };

  const onConnect = (c: Connection) => {
    if (!editable || !props.onChange || !c.source || !c.target) return;
    let i = workflow.edges.length + 1;
    while (workflow.edges.some((e) => e.id === `e${i}`)) i++;
    props.onChange({ ...workflow, edges: [...workflow.edges, { id: `e${i}`, source: c.source, target: c.target, condition: { type: "always" } }] });
  };

  return (
    <div style={{ height: props.height ?? 560 }} className="panel">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => props.onSelect?.({ kind: "node", id: n.id })}
        onEdgeClick={(_, e) => props.onSelect?.({ kind: "edge", id: e.id })}
        onPaneClick={() => props.onSelect?.(null)}
        nodesConnectable={!!editable}
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
