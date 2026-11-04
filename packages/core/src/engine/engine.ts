import type { RuntimeAdapter } from "../adapters/contract";
import { CAPABILITIES } from "../adapters/contract";
import type { RuntimeAdapterRegistry } from "../adapters/registry";
import type { Vault } from "../connectors/contract";
import { isToolAllowed, type ConnectorRegistry } from "../connectors/registry";
import type { AgentInfo, AgentStatus, AgentTownEvent, EventDraft, RunStatus, TaskStage } from "../events";
import { agentSkills, resolveAgent, type AgentTemplate, type Team } from "../schema/team";
import { renderSkillsForPrompt } from "../schema/skill";
import { entryNodes, type Workflow, type WorkflowNode } from "../schema/workflow";
import { GraphIndex, selectEdges, type NodeResult } from "./graph";
import { checkAgentForNode, nodeAgentId, nodeUsesRuntime, preflight, type PreflightResult } from "./preflight";
import { formatUpstream, renderTemplate, truncate, usesKey, type Handoff } from "./template";

export interface EngineDeps {
  adapters: RuntimeAdapterRegistry;
  connectors: ConnectorRegistry;
  vault: Vault;
  /** Called for every event of every run (persistence, SSE fan-out). */
  onEvent?: (ev: AgentTownEvent) => void;
  newId?: () => string;
}

export interface StartOptions {
  runId?: string;
  /** Start even if preflight reports errors. Default false. */
  force?: boolean;
  /** Person starting the run (recorded on run.started). */
  actor?: string;
  /** Lower the run's cost cap (e.g. to someone's remaining daily budget). Never raises it. */
  maxCostUsd?: number;
}

export class PreflightError extends Error {
  constructor(public result: PreflightResult) {
    super("Preflight failed: " + result.issues.filter((i) => i.level === "error").map((i) => i.message).join("; "));
  }
}

export class WorkflowEngine {
  private runs = new Map<string, Run>();
  constructor(private deps: EngineDeps) {}

  preflight(wf: Workflow, team: Team, inputs?: Record<string, string>): Promise<PreflightResult> {
    return preflight(wf, team, this.deps.adapters, this.deps.connectors, inputs);
  }

  async start(wf: Workflow, team: Team, inputs: Record<string, string>, opts: StartOptions = {}): Promise<Run> {
    const pf = await this.preflight(wf, team, inputs);
    if (!pf.ok && !opts.force) throw new PreflightError(pf);
    const runId = opts.runId ?? (this.deps.newId ?? (() => crypto.randomUUID()))();
    const run = new Run(runId, wf, team, inputs, this.deps, pf);
    this.runs.set(runId, run);
    run.begin(opts);
    return run;
  }

  get(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  active(): Run[] {
    return [...this.runs.values()].filter((r) => !r.isTerminal());
  }
}

interface Activation {
  nodeId: string;
  inputs: Handoff[];
  /** Set when a node is re-run because a later node sent work back. */
  feedback?: string;
}

interface PendingApproval {
  approvalId: string;
  nodeId: string;
  resolve: (r: { approved: boolean; note?: string }) => void;
}

/** One execution of a workflow. Emits the full, replayable event log. */
export class Run {
  readonly events: AgentTownEvent[] = [];
  status: RunStatus = "pending";
  readonly done: Promise<RunStatus>;

  private resolveDone!: (s: RunStatus) => void;
  private listeners = new Set<(ev: AgentTownEvent) => void>();
  private seq = 0;
  private graph: GraphIndex;
  private nodes: Map<string, WorkflowNode>;
  private agents: Map<string, AgentTemplate>;

  private queue: Activation[] = [];
  private running = new Map<string, Promise<void>>();
  private approvals = new Map<string, PendingApproval>();
  private mergeInbox = new Map<string, Handoff[]>();
  private reviewing = new Set<string>();
  private runCounts = new Map<string, number>();
  private outputs = new Map<string, string>();
  private overrides = new Map<string, string>();
  private redirects = new Map<string, string[]>();
  private sessions = new Map<string, { adapter: RuntimeAdapter; sessionId: string }>();
  private agentStatus = new Map<string, AgentStatus>();
  private agentBusy = new Map<string, number>();
  private agentCost = new Map<string, number>();
  private tasksCreated = new Set<string>();
  private savedFiles: string[] = [];
  private totalCost = 0;
  private costCap: number;
  private paused = false;

  constructor(
    readonly id: string,
    readonly workflow: Workflow,
    readonly team: Team,
    readonly inputs: Record<string, string>,
    private deps: EngineDeps,
    private preflightResult: PreflightResult,
  ) {
    this.done = new Promise((r) => (this.resolveDone = r));
    this.graph = new GraphIndex(workflow);
    this.nodes = new Map(workflow.nodes.map((n) => [n.id, n]));
    this.agents = new Map(team.agents.map((a) => [a.id, a]));
    this.costCap = workflow.settings.costCapUsd ?? team.defaults.costCapUsd;
    for (const i of workflow.inputs) {
      if (this.inputs[i.key] === undefined && i.default !== undefined) this.inputs[i.key] = i.default;
    }
  }

  // ---------------------------------------------------------------------------
  // Public controls

  subscribe(fn: (ev: AgentTownEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  isTerminal(): boolean {
    return this.status === "completed" || this.status === "failed" || this.status === "stopped";
  }

  pause(reason?: string, actor?: string) {
    if (this.status !== "running") throw new Error(`Cannot pause a ${this.status} run`);
    this.paused = true;
    this.status = "paused";
    this.emit({ type: "run.paused", reason: reason ?? "Paused by user — in-flight steps finish, no new steps start", actor });
  }

  resume(actor?: string) {
    if (this.status !== "paused") throw new Error(`Cannot resume a ${this.status} run`);
    this.paused = false;
    this.status = "running";
    this.emit({ type: "run.resumed", actor });
    this.pump();
  }

  async stop(reason = "Stopped by user", actor?: string) {
    if (this.isTerminal()) return;
    const sessions = [...this.sessions.values()];
    this.finish("stopped", { type: "run.stopped", reason, actor });
    for (const a of this.approvals.values()) a.resolve({ approved: false, note: "run stopped" });
    this.approvals.clear();
    await Promise.all(sessions.map(({ adapter, sessionId }) => adapter.cancel(sessionId).catch(() => undefined)));
  }

  approve(approvalId: string, approved: boolean, note?: string, actor?: string) {
    const a = this.approvals.get(approvalId);
    if (!a) throw new Error(`No pending approval ${approvalId}`);
    this.approvals.delete(approvalId);
    this.emit({ type: "approval.resolved", approvalId, approved, note, nodeId: a.nodeId, actor });
    a.resolve({ approved, note });
  }

  pendingApprovals(): string[] {
    return [...this.approvals.keys()];
  }

  /** Reassign a node that is not currently running to another agent in the team. */
  async reassign(nodeId: string, agentId: string, actor?: string) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown node ${nodeId}`);
    if (!(node.type === "agentTask" || node.type === "merge" || node.type === "toolCall")) {
      throw new Error(`Node ${nodeId} (${node.type}) has no assignee`);
    }
    if (this.running.has(nodeId)) throw new Error("Cannot reassign a step while it is running — pause and wait for it to finish");
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent ${agentId}`);
    if (nodeUsesRuntime(node, new Map([[nodeId, agentId]]))) {
      const issues = await checkAgentForNode(node, agent, this.team, this.deps.adapters);
      const errors = issues.filter((i) => i.level === "error");
      if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
    }
    const previous = nodeAgentId(node, this.overrides);
    this.overrides.set(nodeId, agentId);
    this.emit({ type: "task.reassigned", taskId: taskId(nodeId), nodeId, assignee: agentId, previous, from: agentId, actor });
  }

  /** Add an instruction the node will see the next time it runs. */
  redirect(nodeId: string, note: string, actor?: string) {
    if (!this.nodes.has(nodeId)) throw new Error(`Unknown node ${nodeId}`);
    const list = this.redirects.get(nodeId) ?? [];
    list.push(note);
    this.redirects.set(nodeId, list);
    this.emit({ type: "task.redirected", taskId: taskId(nodeId), nodeId, note, actor });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle

  begin(opts: Pick<StartOptions, "actor" | "maxCostUsd"> = {}) {
    this.status = "running";
    if (opts.maxCostUsd !== undefined) this.costCap = Math.max(0, Math.min(this.costCap, opts.maxCostUsd));
    const agents: AgentInfo[] = this.team.agents.map((a) => {
      const { runtime, model } = resolveAgent(this.team, a);
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        department: a.department,
        color: a.appearance.color,
        sprite: a.appearance.sprite,
        desk: a.appearance.desk,
        runtime,
        model: model.id,
      };
    });
    this.emit({
      type: "run.started",
      workflowId: this.workflow.id,
      workflowName: this.workflow.name,
      inputs: { ...this.inputs },
      agents,
      costCapUsd: this.costCap,
      actor: opts.actor,
    });
    const warnings = this.preflightResult.issues.map((i) => `${i.level}: ${i.message}`);
    if (warnings.length) this.emit({ type: "preflight", warnings });
    for (const a of this.team.agents) this.setAgent(a.id, "idle");

    for (const n of entryNodes(this.workflow)) this.enqueue({ nodeId: n.id, inputs: [] });
    this.pump();
  }

  private finish(status: "completed" | "failed" | "stopped", ev: EventDraft) {
    if (this.isTerminal()) return;
    // Make the office match reality: nobody keeps "working" after the run ends.
    for (const [agentId, s] of this.agentStatus) {
      if (s === "thinking" || s === "working" || s === "waiting-for-human") {
        this.setAgent(agentId, status === "failed" ? "failed" : "idle", status === "completed" ? undefined : `Run ${status}`);
      }
    }
    this.status = status;
    this.emit(ev);
    this.resolveDone(status);
  }

  // ---------------------------------------------------------------------------
  // Scheduling

  private enqueue(act: Activation) {
    const node = this.nodes.get(act.nodeId)!;
    if (node.type === "merge") {
      // Merges collect inputs; pump() fires them once nothing active can still reach them.
      const inbox = this.mergeInbox.get(node.id) ?? [];
      inbox.push(...act.inputs);
      this.mergeInbox.set(node.id, inbox);
      return;
    }
    this.queueNode(act);
  }

  private queueNode(act: Activation) {
    const node = this.nodes.get(act.nodeId)!;
    this.queue.push(act);
    const attempt = (this.runCounts.get(node.id) ?? 0) + 1;
    this.emit({ type: "node.queued", nodeId: node.id, attempt });
    const tid = taskId(node.id);
    const agentId = nodeAgentId(node, this.overrides);
    if (hasTask(node)) {
      if (!this.tasksCreated.has(tid)) {
        this.tasksCreated.add(tid);
        this.emit({ type: "task.created", taskId: tid, nodeId: node.id, title: node.label || node.id, assignee: agentId, stage: "inbox", from: agentId });
      } else {
        this.reviewing.delete(node.id);
        this.taskStage(node.id, "inbox");
      }
    }
  }

  /** Is any queued / running / waiting node able to reach `target`? */
  private activeCanReach(target: string): boolean {
    for (const a of this.queue) if (a.nodeId !== target && this.graph.canReach(a.nodeId, target)) return true;
    for (const id of this.running.keys()) if (id !== target && this.graph.canReach(id, target)) return true;
    for (const [mid, inbox] of this.mergeInbox) if (mid !== target && inbox.length && this.graph.canReach(mid, target)) return true;
    return false;
  }

  private pump() {
    if (this.isTerminal()) return;

    // Merges fire when nothing still active can deliver more input to them.
    for (const [mid, inbox] of [...this.mergeInbox]) {
      if (!inbox.length || this.running.has(mid)) continue;
      if (!this.activeCanReach(mid)) {
        this.mergeInbox.delete(mid);
        this.queueNode({ nodeId: mid, inputs: inbox });
      }
    }

    // Tasks in review move to done once nothing active can send work back to them.
    for (const nid of [...this.reviewing]) {
      if (!this.running.has(nid) && !this.queue.some((a) => a.nodeId === nid) && !this.activeCanReach(nid)) {
        this.reviewing.delete(nid);
        this.taskStage(nid, "done");
      }
    }

    if (!this.paused) {
      while (this.queue.length) {
        const idx = this.queue.findIndex((a) => !this.running.has(a.nodeId));
        if (idx < 0) break;
        const act = this.queue.splice(idx, 1)[0]!;
        const p = this.execute(act)
          .catch((err) => this.failRun(act.nodeId, err as Error))
          .finally(() => {
            this.running.delete(act.nodeId);
            this.pump();
          });
        this.running.set(act.nodeId, p);
      }
    }

    if (!this.queue.length && !this.running.size && !this.approvals.size && ![...this.mergeInbox.values()].some((i) => i.length)) {
      if (this.status === "running" || this.status === "paused") {
        for (const nid of [...this.reviewing]) this.taskStage(nid, "done");
        this.reviewing.clear();
        this.finish("completed", { type: "run.completed", outputs: [...this.savedFiles] });
      }
    }
  }

  private failRun(nodeId: string, err: Error) {
    if (this.isTerminal()) return;
    this.emit({ type: "node.failed", nodeId, error: err.message });
    this.finish("failed", { type: "run.failed", error: `${nodeId}: ${err.message}` });
    void Promise.all([...this.sessions.values()].map(({ adapter, sessionId }) => adapter.cancel(sessionId).catch(() => undefined)));
  }

  // ---------------------------------------------------------------------------
  // Node execution

  private async execute(act: Activation): Promise<void> {
    const node = this.nodes.get(act.nodeId)!;
    const count = (this.runCounts.get(node.id) ?? 0) + 1;
    if (count > node.maxRuns) {
      throw new Error(`"${node.label || node.id}" exceeded maxRuns (${node.maxRuns}) — stopping to avoid a loop`);
    }
    this.runCounts.set(node.id, count);
    const agentId = nodeAgentId(node, this.overrides);
    this.emit({ type: "node.started", nodeId: node.id, attempt: count, agentId, from: agentId });
    if (hasTask(node)) this.taskStage(node.id, "doing");

    let result: NodeResult;
    switch (node.type) {
      case "agentTask":
        result = await this.runAgent(node, act, count, node.config.agentId, node.config.prompt, node.config.outputFile);
        break;
      case "merge":
        if (nodeAgentId(node, this.overrides)) {
          result = await this.runAgent(node, act, count, node.config.agentId!, node.config.prompt || "Merge the inputs below into one result.", node.config.outputFile);
        } else {
          const output = formatUpstream(act.inputs, this.workflow.settings.handoffMaxChars);
          if (node.config.outputFile) await this.save(node, node.config.outputFile, output, undefined);
          result = { output };
        }
        break;
      case "toolCall":
        result = await this.runTool(node, act);
        break;
      case "humanApproval":
        result = await this.runApproval(node, act);
        break;
      case "parallel":
      case "branch":
      case "end":
        result = { output: act.inputs.map((h) => h.output).join("\n\n") };
        break;
    }
    if (this.isTerminal()) return;

    this.outputs.set(node.id, result.output);
    this.emit({ type: "node.completed", nodeId: node.id, output: truncate(result.output, 2000), outcome: result.outcome, from: agentId });

    const edges = selectEdges(this.workflow, node.id, node.type === "branch", result);
    const fromAgent = agentId ? this.agents.get(agentId) : undefined;
    let sentBack = false;
    for (const e of edges) {
      const target = this.nodes.get(e.target)!;
      const handoff: Handoff = { fromNodeId: node.id, fromLabel: node.label || node.id, fromAgent: fromAgent?.name, output: result.output };
      const isLoop = this.graph.canReach(e.target, node.id) && (this.runCounts.get(e.target) ?? 0) > 0;
      const toAgent = nodeAgentId(target, this.overrides);
      if ((fromAgent || toAgent) && target.type !== "end") {
        this.emit({
          type: "message",
          kind: isLoop ? "feedback" : "handoff",
          from: agentId,
          to: toAgent,
          nodeId: node.id,
          message: `${node.label || node.id} → ${target.label || target.id}${e.label ? ` [${e.label}]` : ""}`,
        });
      }
      if (this.graph.canReach(e.target, node.id) && e.target !== node.id) sentBack = true;
      this.enqueue({ nodeId: e.target, inputs: [handoff], feedback: isLoop ? result.output : undefined });
    }

    if (hasTask(node)) {
      if (sentBack) {
        this.reviewing.add(node.id);
        this.taskStage(node.id, "review");
      } else {
        this.taskStage(node.id, "done");
      }
    }
  }

  private async runAgent(
    node: WorkflowNode,
    act: Activation,
    attempt: number,
    configuredAgentId: string,
    promptTpl: string,
    outputFile: string | undefined,
  ): Promise<NodeResult> {
    const agentId = this.overrides.get(node.id) ?? configuredAgentId;
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent ${agentId}`);
    const { runtime, model } = resolveAgent(this.team, agent);
    const adapter = this.deps.adapters.require(runtime);
    const maxChars = this.workflow.settings.handoffMaxChars;

    const ctx = { inputs: this.inputs, outputs: this.outputs, upstream: act.inputs, feedback: act.feedback, maxChars };
    const parts = [renderTemplate(promptTpl, ctx)];
    if (act.inputs.length && !usesKey(promptTpl, "upstream")) parts.push(`## Context from previous steps\n\n${formatUpstream(act.inputs, maxChars)}`);
    const previous = this.outputs.get(node.id);
    if (act.feedback && !usesKey(promptTpl, "feedback")) parts.push(`## Feedback on your previous attempt\n\n${truncate(act.feedback, maxChars)}`);
    if (previous && attempt > 1) parts.push(`## Your previous output\n\n${truncate(previous, maxChars)}`);
    const notes = this.redirects.get(node.id);
    if (notes?.length) {
      parts.push(`## Instructions from the user\n\n${notes.map((n) => `- ${n}`).join("\n")}`);
      this.redirects.delete(node.id);
    }
    const promptText = parts.join("\n\n");
    const format = outputFile?.endsWith(".html") ? "html" : outputFile?.endsWith(".md") || !outputFile ? "markdown" : "text";

    this.agentBusy.set(agentId, (this.agentBusy.get(agentId) ?? 0) + 1);
    this.setAgent(agentId, "thinking", `Starting ${node.label || node.id}`);
    const { allowed: sessionTools, withheld } = await this.sessionTools(agent);
    if (withheld.length) {
      this.emit({
        type: "runtime.event",
        kind: "tools.withheld",
        message: `Not given to the runtime session (needs your approval — use a Tool Call node): ${withheld.join(", ")}`,
        from: agentId,
        nodeId: node.id,
        runtime,
      });
    }

    // Skills: native for runtimes that support them, otherwise next to the instructions.
    const skills = agentSkills(this.team, agent);
    const nativeSkills = (await adapter.listCapabilities()).includes(CAPABILITIES.skills);
    const systemPrompt = nativeSkills || !skills.length ? agent.systemPrompt : [agent.systemPrompt, renderSkillsForPrompt(skills)].filter(Boolean).join("\n\n");
    if (skills.length) {
      this.emit({
        type: "runtime.event",
        kind: "skills.loaded",
        message: `Skills: ${skills.map((s) => s.name).join(", ")}${nativeSkills ? " (native)" : " (in instructions)"}`,
        from: agentId,
        nodeId: node.id,
        runtime,
      });
    }

    const tryModel = async (modelId: string): Promise<string> => {
      const { sessionId } = await adapter.startSession({
        runId: this.id,
        nodeId: node.id,
        agentId,
        agentName: agent.name,
        role: agent.role,
        systemPrompt,
        model: modelId,
        allowedTools: sessionTools,
        permissions: agent.permissions,
        skills: nativeSkills ? skills.map((s) => ({ id: s.id, name: s.name, description: s.description, content: s.content, files: s.files })) : undefined,
      });
      const key = `${node.id}:${sessionId}`;
      this.sessions.set(key, { adapter, sessionId });
      this.emit({ type: "runtime.event", kind: "session.started", message: `Session ${sessionId} on ${modelId}`, from: agentId, nodeId: node.id, runtime });
      try {
        const stream = adapter.streamEvents(sessionId);
        await adapter.sendPrompt(sessionId, {
          text: promptText,
          expectedOutput: { format, file: outputFile },
          meta: { attempt, nodeLabel: node.label || node.id },
        });
        let text = "";
        let sawCost = false;
        for await (const ev of stream) {
          if (this.isTerminal()) throw new Error("run ended");
          const base = { from: agentId, nodeId: node.id, taskId: hasTask(node) ? taskId(node.id) : undefined, runtime };
          switch (ev.kind) {
            case "thinking":
              this.setAgent(agentId, "thinking", ev.message);
              if (ev.message) this.emit({ ...base, type: "runtime.event", kind: "thinking", message: ev.message });
              break;
            case "text":
              text += ev.delta;
              this.setAgent(agentId, "working", "Writing");
              this.emit({ ...base, type: "runtime.event", kind: "text", message: truncate(ev.delta, 200) });
              break;
            case "tool_use":
              this.setAgent(agentId, "working", `Using ${ev.tool}`);
              this.emit({ ...base, type: "tool.call", tool: ev.tool, category: "runtime", args: ev.input });
              break;
            case "tool_result":
              this.emit({ ...base, type: "tool.result", tool: ev.tool, ok: ev.ok, message: ev.message ?? "" });
              break;
            case "waiting":
              this.setAgent(agentId, "waiting-for-human", ev.message);
              if (ev.requestId && adapter.respond) {
                // The runtime asked a person something: ask in Agent Town's approval banner.
                const requestId = ev.requestId;
                void this.requestApproval(node, { kind: "tool", message: ev.message, tool: ev.action ?? "runtime", category: "runtime", agentId }).then((d) =>
                  adapter.respond!(sessionId, requestId, d.approved, d.note).catch((err) =>
                    this.emit({ ...base, type: "runtime.event", kind: "log", message: `Couldn't pass your answer to ${runtime}: ${(err as Error).message}` }),
                  ),
                );
              }
              break;
            case "log":
              this.emit({ ...base, type: "runtime.event", kind: "log", message: ev.message });
              break;
            case "cost":
              sawCost = true;
              this.addCost(agentId, agent, runtime, node.id, ev.usd, ev.inputTokens, ev.outputTokens, ev.simulated);
              break;
            case "done":
              text = ev.output || text;
              break;
            case "failed":
              throw new Error(ev.error);
          }
        }
        if (!sawCost && (await adapter.listCapabilities()).includes(CAPABILITIES.costReporting)) {
          const c = await adapter.getCost(sessionId).catch(() => undefined);
          if (c && c.usd > 0) this.addCost(agentId, agent, runtime, node.id, c.usd, c.inputTokens, c.outputTokens, c.simulated);
        }
        return text;
      } finally {
        this.sessions.delete(key);
        await adapter.closeSession?.(sessionId).catch(() => undefined);
      }
    };

    let output: string;
    try {
      try {
        output = await tryModel(model.id);
      } catch (err) {
        if (this.isTerminal() || !model.fallbackId) throw err;
        this.emit({ type: "runtime.event", kind: "fallback", message: `${model.id} failed (${(err as Error).message}); retrying on ${model.fallbackId}`, from: agentId, nodeId: node.id, runtime });
        output = await tryModel(model.fallbackId);
      }
    } catch (err) {
      if (!this.isTerminal()) this.setAgent(agentId, "failed", (err as Error).message);
      this.agentBusy.set(agentId, (this.agentBusy.get(agentId) ?? 1) - 1);
      throw err;
    }
    if (this.isTerminal()) return { output };

    const busy = (this.agentBusy.get(agentId) ?? 1) - 1;
    this.agentBusy.set(agentId, busy);
    await this.save(node, `steps/${node.id}-${attempt}.md`, output, agentId);
    if (outputFile) await this.save(node, outputFile, output, agentId);
    if (busy <= 0) this.setAgent(agentId, "done", `Finished ${node.label || node.id}`);
    return { output };
  }

  private async runTool(node: Extract<WorkflowNode, { type: "toolCall" }>, act: Activation): Promise<NodeResult> {
    const agentId = nodeAgentId(node, this.overrides);
    const agent = agentId ? this.agents.get(agentId) : undefined;
    const toolId = node.config.tool;
    const auth = await this.deps.connectors.authorize(toolId, agent);
    const connector = toolId.split(".")[0];
    if (!auth.allowed) throw new Error(auth.reason ?? `Tool ${toolId} not allowed`);

    const ctx = { inputs: this.inputs, outputs: this.outputs, upstream: act.inputs, feedback: act.feedback, maxChars: this.workflow.settings.handoffMaxChars };
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.config.args)) args[k] = typeof v === "string" ? renderTemplate(v, ctx) : v;

    let token: { approved: true } | undefined;
    if (auth.needsApproval) {
      const decision = await this.requestApproval(node, {
        kind: "tool",
        tool: toolId,
        category: auth.category,
        message: `Allow ${agent?.name ?? "the workflow"} to ${auth.descriptor?.description ?? toolId}?`,
        preview: truncate(JSON.stringify(args, null, 2), 4000),
        agentId,
      });
      if (this.isTerminal()) return { output: "" };
      if (!decision.approved) {
        this.emit({ type: "tool.result", tool: toolId, ok: false, message: `Rejected by user${decision.note ? `: ${decision.note}` : ""}`, nodeId: node.id, connector, from: agentId });
        return { output: decision.note ?? "Rejected by user", outcome: "rejected" };
      }
      token = { approved: true };
    }

    if (agentId) this.setAgent(agentId, "working", `Using ${toolId}`);
    this.emit({ type: "tool.call", tool: toolId, category: auth.category ?? "read", args, nodeId: node.id, connector, from: agentId });
    const res = await this.deps.connectors.execute(toolId, args, { runId: this.id, nodeId: node.id, agentId }, token);
    this.emit({ type: "tool.result", tool: toolId, ok: res.ok, message: res.message, nodeId: node.id, connector, from: agentId });
    for (const f of res.files ?? []) {
      if (!this.savedFiles.includes(f.file)) this.savedFiles.push(f.file);
      this.emit({ type: "output.saved", file: f.file, bytes: f.bytes, nodeId: node.id, connector, from: agentId });
    }
    if (agentId) this.setAgent(agentId, res.ok ? "done" : "failed", res.message);
    if (!res.ok) throw new Error(res.message);
    return { output: res.output ?? res.message, outcome: auth.needsApproval ? "approved" : undefined };
  }

  private async runApproval(node: Extract<WorkflowNode, { type: "humanApproval" }>, act: Activation): Promise<NodeResult> {
    const upstream = act.inputs.map((h) => h.output).join("\n\n");
    const agentId = node.config.agentId ?? act.inputs.map((h) => this.nodeAgentOf(h.fromNodeId)).find(Boolean);
    const decision = await this.requestApproval(node, {
      kind: "node",
      message: node.config.message,
      preview: truncate(upstream, 4000),
      agentId,
    });
    const note = decision.note?.trim();
    return {
      output: decision.approved ? upstream : `Rejected by the user.${note ? ` Feedback: ${note}` : ""}\n\n${upstream}`,
      outcome: decision.approved ? "approved" : "rejected",
    };
  }

  /**
   * Tools handed to a runtime session. A session can't pause mid-prompt for a click,
   * so tools that need approval (send / spend, and write unless auto-approved) are
   * withheld; they can only run through a gated Tool Call node. Entries that are not
   * registered connector tools (runtime-native tool names) pass through unchanged.
   */
  private async sessionTools(agent: AgentTemplate): Promise<{ allowed: string[]; withheld: string[] }> {
    const registered = await this.deps.connectors.listAllTools();
    const allowed: string[] = [];
    const withheld: string[] = [];
    for (const t of registered) {
      if (!isToolAllowed(agent.tools, t.id)) continue;
      const auth = await this.deps.connectors.authorize(t.id, agent);
      (auth.allowed && !auth.needsApproval ? allowed : withheld).push(t.id);
    }
    const known = new Set(this.deps.connectors.manifests().map((m) => m.id));
    for (const entry of agent.tools) {
      const connector = entry.split(".")[0] ?? "";
      if (entry !== "*" && !known.has(connector)) allowed.push(entry);
    }
    return { allowed, withheld };
  }

  private nodeAgentOf(nodeId: string): string | undefined {
    const n = this.nodes.get(nodeId);
    return n ? nodeAgentId(n, this.overrides) : undefined;
  }

  private requestApproval(
    node: WorkflowNode,
    req: { kind: "node" | "tool"; message: string; preview?: string; tool?: string; category?: string; agentId?: string },
  ): Promise<{ approved: boolean; note?: string }> {
    const approvalId = `${node.id}-${this.runCounts.get(node.id) ?? 1}-${this.seq + 1}`;
    const prevStatus = req.agentId ? this.agentStatus.get(req.agentId) : undefined;
    return new Promise((resolve) => {
      this.approvals.set(approvalId, {
        approvalId,
        nodeId: node.id,
        resolve: (r) => {
          if (req.agentId && !this.isTerminal()) {
            this.setAgent(req.agentId, prevStatus === "waiting-for-human" || !prevStatus ? "idle" : prevStatus, r.approved ? "Approved" : "Changes requested");
          }
          resolve(r);
        },
      });
      this.emit({
        type: "approval.requested",
        approvalId,
        nodeId: node.id,
        kind: req.kind,
        message: req.message,
        preview: req.preview,
        tool: req.tool,
        category: req.category,
        from: req.agentId,
      });
      if (req.agentId) this.setAgent(req.agentId, "waiting-for-human", "Waiting for you");
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers

  private async save(node: WorkflowNode, file: string, content: string, agentId: string | undefined) {
    const res = await this.deps.vault.writeFile(this.id, file, content);
    if (!this.savedFiles.includes(res.file)) this.savedFiles.push(res.file);
    this.emit({ type: "output.saved", file: res.file, bytes: res.bytes, nodeId: node.id, from: agentId, taskId: hasTask(node) ? taskId(node.id) : undefined });
    if (hasTask(node) && !file.startsWith("steps/")) {
      this.emit({ type: "task.stage", taskId: taskId(node.id), nodeId: node.id, stage: "doing", outputLink: res.file });
    }
  }

  private addCost(agentId: string, agent: AgentTemplate, runtime: string, nodeId: string, usd: number, inTok?: number, outTok?: number, simulated?: boolean) {
    this.totalCost += usd;
    const ac = (this.agentCost.get(agentId) ?? 0) + usd;
    this.agentCost.set(agentId, ac);
    this.emit({
      type: "cost",
      total: +this.totalCost.toFixed(6),
      from: agentId,
      nodeId,
      runtime,
      cost: { usd, inputTokens: inTok, outputTokens: outTok, simulated },
    });
    if (this.totalCost > this.costCap) {
      void this.stop(`Cost cap reached: $${this.totalCost.toFixed(4)} > $${this.costCap.toFixed(4)}`);
    } else if (agent.costCapUsd !== undefined && ac > agent.costCapUsd) {
      void this.stop(`${agent.name} reached their cost cap: $${ac.toFixed(4)} > $${agent.costCapUsd.toFixed(4)}`);
    }
  }

  private setAgent(agentId: string, status: AgentStatus, message?: string) {
    if (this.agentStatus.get(agentId) === status && !message) return;
    if (this.agentStatus.get(agentId) === status && status === "working") return; // avoid spam per text chunk
    this.agentStatus.set(agentId, status);
    this.emit({ type: "agent.status", from: agentId, status, message });
  }

  private taskStage(nodeId: string, stage: TaskStage) {
    this.emit({ type: "task.stage", taskId: taskId(nodeId), nodeId, stage });
  }

  private emit(draft: EventDraft) {
    if (this.isTerminal() && !draft.type.startsWith("run.")) return;
    const ev = { ...draft, seq: ++this.seq, runId: this.id, ts: new Date().toISOString() } as AgentTownEvent;
    this.events.push(ev);
    this.deps.onEvent?.(ev);
    for (const l of this.listeners) l(ev);
  }
}

export function taskId(nodeId: string): string {
  return `task:${nodeId}`;
}

function hasTask(node: WorkflowNode): boolean {
  return node.type === "agentTask" || node.type === "merge" || node.type === "toolCall";
}
