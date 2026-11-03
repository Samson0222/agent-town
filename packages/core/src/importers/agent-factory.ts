import { AgentTemplate } from "../schema/team";

/**
 * Importer for the Agent Factory role-template FORMAT
 * (https://github.com/shuanbao0/agent-factory — templates/agents/<group>/<id>/).
 *
 * Agent Factory is GPL-3.0. This file is our own implementation of a reader for
 * its folder shape; no Agent Factory code or role text is copied into Agent Town.
 *
 *   template.json  { id, name, description, emoji, category, group, defaults: { model, skills[], peers[] } }
 *   IDENTITY.md    who the agent is (name / vibe / emoji)
 *   SOUL.md        behaviour rules
 *   TOOLS.md       tool notes
 *   AGENTS.md      workspace notes (ignored)
 *
 * Mapping:
 *   systemPrompt = IDENTITY.md + SOUL.md (+ TOOLS.md notes)
 *   model        = defaults.model, kept only if the caller says the runtime knows it
 *   skills       = listed in the description (they are OpenClaw skills, not Agent Town tools)
 *   peers        = ignored — teams are built by the user, not fixed in the template
 */
export interface AgentFactoryFiles {
  "template.json": string;
  "IDENTITY.md"?: string;
  "SOUL.md"?: string;
  "TOOLS.md"?: string;
}

export interface ImportOptions {
  /** Return true if this model id is usable by the target runtime; otherwise the team default is used. */
  knownModel?: (id: string) => boolean;
  color?: string;
}

interface AfTemplate {
  id?: string;
  name?: string;
  description?: string;
  emoji?: string;
  category?: string;
  group?: string;
  defaults?: { model?: string; skills?: string[]; peers?: string[] };
}

export function importAgentFactoryTemplate(files: AgentFactoryFiles, opts: ImportOptions = {}): { agent: AgentTemplate; notes: string[] } {
  let t: AfTemplate;
  try {
    t = JSON.parse(files["template.json"]) as AfTemplate;
  } catch {
    throw new Error("template.json is not valid JSON");
  }
  if (!t.id || !t.name) throw new Error("template.json needs at least `id` and `name`");
  const notes: string[] = [];
  const section = (title: string, body?: string) => (body?.trim() ? `## ${title}\n\n${body.trim()}` : "");
  const systemPrompt = [section("Identity", files["IDENTITY.md"]), section("Rules", files["SOUL.md"]), section("Tool notes", files["TOOLS.md"])]
    .filter(Boolean)
    .join("\n\n");

  const modelId = t.defaults?.model;
  let model: { id: string } | undefined;
  if (modelId) {
    if (opts.knownModel?.(modelId)) model = { id: modelId };
    else notes.push(`Model "${modelId}" isn't available here; the agent uses the team default model.`);
  }
  const skills = t.defaults?.skills ?? [];
  if (skills.length) notes.push(`Agent Factory skills (${skills.join(", ")}) are OpenClaw skills; give the agent Agent Town tools on the Teams page.`);
  if (t.defaults?.peers?.length) notes.push("Peers were ignored — in Agent Town you build the team yourself.");

  const agent = AgentTemplate.parse({
    id: t.id.replace(/[^a-zA-Z0-9_-]/g, "-"),
    name: t.name,
    role: t.name,
    department: t.group ?? t.category ?? "General",
    description: [t.description ?? "", skills.length ? `Skills: ${skills.join(", ")}` : ""].filter(Boolean).join(" · "),
    emoji: t.emoji,
    group: t.group,
    systemPrompt: systemPrompt || (t.description ?? ""),
    model,
    tools: [],
    appearance: { color: opts.color ?? "#4f86f7", sprite: "default" },
  });
  return { agent, notes };
}
