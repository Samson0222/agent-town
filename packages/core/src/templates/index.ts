import { Team, type TeamInput } from "../schema/team";
import { parseWorkflow, type Workflow, type WorkflowInputJson } from "../schema/workflow";

/**
 * Starter templates — EXAMPLES ONLY. They are plain data the user can clone,
 * edit or delete. Nothing in the engine or UI depends on these ids.
 */

const DESCRIPTIONS: Record<string, string> = {
  researcher: "Finds competitors, prices and local facts, with numbers.",
  writer: "Turns research into positioning, taglines and short copy.",
  developer: "Builds simple, accessible web pages from the copy.",
  reviewer: "Checks facts and tone; sends work back when something is off.",
  ceo: "Pulls everything together into a decision-ready brief.",
  pm: "Writes user stories with clear acceptance criteria.",
  dev: "Implements features in small, tested changes.",
  qa: "Reviews work against the acceptance criteria.",
  "analyst-a": "Researches market size and the main players.",
  "analyst-b": "Researches what users need and what frustrates them.",
  "research-editor": "Synthesizes research into a one-page brief.",
  author: "Writes clear, friendly blog posts.",
  "copy-editor": "Edits posts for clarity and approves them.",
};
let lookCounter = 0;

const agent = (
  id: string,
  name: string,
  role: string,
  department: string,
  color: string,
  desk: { x: number; y: number },
  systemPrompt: string,
  tools: string[] = [],
) => ({
  id,
  name,
  role,
  department,
  description: DESCRIPTIONS[id] ?? "",
  systemPrompt,
  tools,
  // A fixed office character per starter agent, so the roster avatar and the office match.
  appearance: { color, sprite: `char-${lookCounter++ % 6}`, desk },
});

// ---------------------------------------------------------------------------
// Launch Brief (the v0.3 demo)

const launchTeam: TeamInput = {
  id: "launch-team",
  name: "Launch Team",
  description: "Researcher, Writer, Developer, Reviewer and CEO for product launch briefs.",
  vault: "launch-team",
  defaults: { runtime: "mock", model: { id: "mock/standard" }, costCapUsd: 0.5 },
  agents: [
    agent("researcher", "Riley", "Researcher", "Research", "#2a9d8f", { x: 1, y: 1 }, "You research markets. Be concise and cite numbers.", ["mock-web.search"]),
    agent("writer", "Wren", "Writer", "Marketing", "#e76f51", { x: 3, y: 1 }, "You write positioning and copy. Short, concrete, no hype."),
    agent("developer", "Dev", "Developer", "Engineering", "#4f86f7", { x: 5, y: 1 }, "You build simple, accessible static web pages. Output only the HTML.", ["vault.*"]),
    agent("reviewer", "Rae", "Reviewer", "Quality", "#9b5de5", { x: 2, y: 3 }, "You check facts and consistency. Start your answer with 'VERDICT: APPROVE' or 'VERDICT: REJECT'."),
    agent("ceo", "Casey", "CEO", "Leadership", "#e9c46a", { x: 4, y: 3 }, "You merge work into a final decision-ready brief.", ["mock-chat.send_message"]),
  ],
};

const launchWorkflow: WorkflowInputJson = {
  schemaVersion: 1,
  id: "launch-brief",
  name: "Launch Brief",
  description: "Research → copy → review loop → human sign-off → parallel landing page + channels → CEO merge → share (gated).",
  teamId: "launch-team",
  inputs: [{ key: "goal", label: "Goal", type: "longtext", required: true, default: "Create a launch brief for a new neighbourhood coffee shop." }],
  nodes: [
    { id: "research", type: "agentTask", label: "Competitors & pricing", position: { x: 250, y: 0 }, config: { agentId: "researcher", prompt: "{{input.goal}}\n\nResearch local competitors and typical pricing. Return a short bullet list." } },
    { id: "copy", type: "agentTask", label: "Positioning & copy", position: { x: 250, y: 120 }, config: { agentId: "writer", prompt: "{{input.goal}}\n\nUsing the research, draft a positioning statement, a tagline and 3 lines of copy.\n\nResearch:\n{{nodes.research.output}}" } },
    { id: "review", type: "agentTask", label: "Fact & consistency check", position: { x: 250, y: 240 }, config: { agentId: "reviewer", prompt: "Check the copy against the research. Start with VERDICT: APPROVE or VERDICT: REJECT, then list issues.\n\nResearch:\n{{nodes.research.output}}\n\nCopy:\n{{nodes.copy.output}}" } },
    { id: "verdict", type: "branch", label: "Approved?", position: { x: 250, y: 360 } },
    { id: "signoff", type: "humanApproval", label: "Sign off positioning", position: { x: 250, y: 480 }, config: { message: "Approve the positioning and copy before we build the landing page?", agentId: "writer" } },
    { id: "fanout", type: "parallel", label: "Build in parallel", position: { x: 250, y: 600 } },
    { id: "landing", type: "agentTask", label: "Landing page draft", position: { x: 60, y: 720 }, config: { agentId: "developer", prompt: "Build a one-page HTML landing draft using this copy:\n\n{{nodes.copy.output}}", outputFile: "landing.html", requires: ["fileEdit"] } },
    { id: "channels", type: "agentTask", label: "Launch channels", position: { x: 440, y: 720 }, config: { agentId: "researcher", prompt: "{{input.goal}}\n\nList 5 local launch channels and partners, one line each." } },
    { id: "final", type: "merge", label: "Final brief", position: { x: 250, y: 840 }, config: { agentId: "ceo", prompt: "{{input.goal}}\n\nMerge everything below into a final launch brief (markdown). Mention that the landing page is in landing.html.", outputFile: "launch-brief.md" } },
    { id: "share", type: "toolCall", label: "Share brief with team", position: { x: 250, y: 960 }, config: { tool: "mock-chat.send_message", agentId: "ceo", args: { channel: "#launch", text: "Launch brief is ready:\n\n{{nodes.final.output}}" } } },
    { id: "end", type: "end", label: "Done", position: { x: 250, y: 1080 } },
  ],
  edges: [
    { id: "e1", source: "research", target: "copy" },
    { id: "e2", source: "copy", target: "review" },
    { id: "e3", source: "review", target: "verdict" },
    { id: "e4", source: "verdict", target: "signoff", label: "approve", condition: { type: "contains", value: "VERDICT: APPROVE" } },
    { id: "e5", source: "verdict", target: "copy", label: "reject", condition: { type: "default" } },
    { id: "e6", source: "signoff", target: "fanout", label: "approved", condition: { type: "approved" } },
    { id: "e7", source: "signoff", target: "copy", label: "changes", condition: { type: "rejected" } },
    { id: "e8", source: "fanout", target: "landing" },
    { id: "e9", source: "fanout", target: "channels" },
    { id: "e10", source: "landing", target: "final" },
    { id: "e11", source: "channels", target: "final" },
    { id: "e12", source: "final", target: "share" },
    { id: "e13", source: "share", target: "end", label: "sent", condition: { type: "approved" } },
    { id: "e14", source: "share", target: "end", label: "skipped", condition: { type: "rejected" } },
  ],
  settings: { costCapUsd: 0.5, handoffMaxChars: 4000 },
};

// ---------------------------------------------------------------------------
// Software Sprint

const sprintTeam: TeamInput = {
  id: "sprint-team",
  name: "Sprint Team",
  description: "PM, Developer and QA for a small feature.",
  defaults: { runtime: "mock", model: { id: "mock/standard" }, costCapUsd: 0.5 },
  agents: [
    agent("pm", "Pat", "Product Manager", "Product", "#e9c46a", { x: 1, y: 1 }, "You write crisp user stories with acceptance criteria."),
    agent("dev", "Dana", "Developer", "Engineering", "#4f86f7", { x: 3, y: 1 }, "You implement features with small, tested changes."),
    agent("qa", "Quinn", "QA Reviewer", "Quality", "#9b5de5", { x: 5, y: 1 }, "You review against acceptance criteria. Start with VERDICT: APPROVE or VERDICT: REJECT."),
  ],
};

const sprintWorkflow: WorkflowInputJson = {
  schemaVersion: 1,
  id: "software-sprint",
  name: "Software Sprint",
  description: "Story → implementation → QA loop → done.",
  teamId: "sprint-team",
  inputs: [{ key: "feature", label: "Feature", type: "longtext", required: true, default: "Add a dark mode toggle to the settings page." }],
  nodes: [
    { id: "story", type: "agentTask", label: "User story", position: { x: 200, y: 0 }, config: { agentId: "pm", prompt: "Write a user story with acceptance criteria for: {{input.feature}}" } },
    { id: "build", type: "agentTask", label: "Implement", position: { x: 200, y: 130 }, config: { agentId: "dev", prompt: "Implement this story. Describe the change and the tests.\n\n{{nodes.story.output}}" } },
    { id: "qa", type: "agentTask", label: "QA review", position: { x: 200, y: 260 }, config: { agentId: "qa", prompt: "Review the implementation against the story. VERDICT first.\n\n{{nodes.story.output}}\n\n{{nodes.build.output}}" } },
    { id: "ok", type: "branch", label: "Passes?", position: { x: 200, y: 390 } },
    { id: "end", type: "end", label: "Done", position: { x: 200, y: 520 } },
  ],
  edges: [
    { id: "e1", source: "story", target: "build" },
    { id: "e2", source: "build", target: "qa" },
    { id: "e3", source: "qa", target: "ok" },
    { id: "e4", source: "ok", target: "end", label: "pass", condition: { type: "contains", value: "VERDICT: APPROVE" } },
    { id: "e5", source: "ok", target: "build", label: "fix", condition: { type: "default" } },
  ],
};

// ---------------------------------------------------------------------------
// Research Brief

const researchTeam: TeamInput = {
  id: "research-team",
  name: "Research Team",
  description: "Two researchers in parallel and an editor.",
  defaults: { runtime: "mock", model: { id: "mock/standard" }, costCapUsd: 0.5 },
  agents: [
    agent("analyst-a", "Ash", "Researcher (market)", "Research", "#2a9d8f", { x: 1, y: 1 }, "You research market size and players.", ["mock-web.search"]),
    agent("analyst-b", "Blair", "Researcher (users)", "Research", "#43aa8b", { x: 3, y: 1 }, "You research user needs and pain points.", ["mock-web.search"]),
    agent("research-editor", "Eden", "Editor / Lead", "Editorial", "#e9c46a", { x: 2, y: 3 }, "You synthesize research into a one-page brief."),
  ],
};

const researchWorkflow: WorkflowInputJson = {
  schemaVersion: 1,
  id: "research-brief",
  name: "Research Brief",
  description: "Parallel research → merge → your approval.",
  teamId: "research-team",
  inputs: [{ key: "topic", label: "Topic", required: true, default: "Home espresso machines under $500" }],
  nodes: [
    { id: "split", type: "parallel", label: "Split research", position: { x: 260, y: 0 } },
    { id: "market", type: "agentTask", label: "Market scan", position: { x: 80, y: 140 }, config: { agentId: "analyst-a", prompt: "Market scan: {{input.topic}}" } },
    { id: "users", type: "agentTask", label: "User needs", position: { x: 440, y: 140 }, config: { agentId: "analyst-b", prompt: "User needs: {{input.topic}}" } },
    { id: "brief", type: "merge", label: "One-page brief", position: { x: 260, y: 280 }, config: { agentId: "research-editor", prompt: "Write a one-page brief on {{input.topic}}.", outputFile: "research-brief.md" } },
    { id: "approve", type: "humanApproval", label: "Approve brief", position: { x: 260, y: 420 }, config: { message: "Approve the research brief?", agentId: "research-editor" } },
    { id: "end", type: "end", label: "Done", position: { x: 260, y: 560 } },
  ],
  edges: [
    { id: "e1", source: "split", target: "market" },
    { id: "e2", source: "split", target: "users" },
    { id: "e3", source: "market", target: "brief" },
    { id: "e4", source: "users", target: "brief" },
    { id: "e5", source: "brief", target: "approve" },
    { id: "e6", source: "approve", target: "end", condition: { type: "approved" } },
    { id: "e7", source: "approve", target: "brief", label: "revise", condition: { type: "rejected" } },
  ],
};

// ---------------------------------------------------------------------------
// Content Team

const contentTeam: TeamInput = {
  id: "content-team",
  name: "Content Team",
  description: "Writer and editor producing a blog post.",
  defaults: { runtime: "mock", model: { id: "mock/standard" }, costCapUsd: 0.5 },
  agents: [
    agent("author", "Alex", "Writer", "Content", "#e76f51", { x: 1, y: 1 }, "You write clear, friendly blog posts."),
    agent("copy-editor", "Morgan", "Editor (Reviewer)", "Content", "#9b5de5", { x: 3, y: 1 }, "You edit for clarity. Start with VERDICT: APPROVE or VERDICT: REJECT."),
  ],
};

const contentWorkflow: WorkflowInputJson = {
  schemaVersion: 1,
  id: "content-post",
  name: "Content Team: blog post",
  description: "Draft → edit loop → save post.",
  teamId: "content-team",
  entryNodeIds: ["draft"],
  inputs: [{ key: "topic", label: "Topic", required: true, default: "5 tips for brewing better coffee at home" }],
  nodes: [
    { id: "draft", type: "agentTask", label: "Draft post", position: { x: 200, y: 0 }, config: { agentId: "author", prompt: "Write a 300-word blog post: {{input.topic}}", outputFile: "post.md" } },
    { id: "edit", type: "agentTask", label: "Edit", position: { x: 200, y: 130 }, config: { agentId: "copy-editor", prompt: "Edit this post. VERDICT first.\n\n{{nodes.draft.output}}" } },
    { id: "ok", type: "branch", label: "Ready?", position: { x: 200, y: 260 } },
    { id: "end", type: "end", label: "Done", position: { x: 200, y: 390 } },
  ],
  edges: [
    { id: "e1", source: "draft", target: "edit" },
    { id: "e2", source: "edit", target: "ok" },
    { id: "e3", source: "ok", target: "end", condition: { type: "contains", value: "VERDICT: APPROVE" } },
    { id: "e4", source: "ok", target: "draft", label: "revise", condition: { type: "default" } },
  ],
};

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  team: Team;
  workflow: Workflow;
}

export function starterTemplates(): StarterTemplate[] {
  const pairs: Array<[TeamInput, WorkflowInputJson]> = [
    [launchTeam, launchWorkflow],
    [sprintTeam, sprintWorkflow],
    [researchTeam, researchWorkflow],
    [contentTeam, contentWorkflow],
  ];
  return pairs.map(([t, w]) => {
    const team = Team.parse({ vault: t.id, ...structuredClone(t) });
    const workflow = parseWorkflow(structuredClone(w));
    return { id: workflow.id, name: workflow.name, description: workflow.description, team, workflow };
  });
}

/** An empty workflow for "start blank". */
export function blankWorkflow(id: string, teamId: string, name = "Untitled workflow"): Workflow {
  return parseWorkflow({
    schemaVersion: 1,
    id,
    name,
    teamId,
    inputs: [{ key: "goal", label: "Goal", type: "longtext", required: true }],
    nodes: [{ id: "end", type: "end", label: "Done", position: { x: 300, y: 300 } }],
    edges: [],
  });
}
