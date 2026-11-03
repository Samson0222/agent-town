import { z } from "zod";

/**
 * Skill — reusable know-how an agent can use (pattern from Multica / Claude skills):
 * a main `SKILL.md` text plus optional supporting text files (templates, checklists,
 * reference notes). Skills live in one shared library and are attached to agents,
 * each attachment can be switched on/off without deleting the skill.
 *
 * Instructions (agent.systemPrompt) = this agent's own job and boundaries.
 * Skills = methods reused across agents ("Fact-check checklist", "Brand voice").
 */
export const SkillFile = z.object({
  /** Relative path inside the skill, e.g. "templates/report.md". "SKILL.md" is reserved. */
  path: z
    .string()
    .min(1)
    .refine((p) => !p.startsWith("/") && !p.split("/").includes("..") && p !== "SKILL.md", "Invalid or reserved file path"),
  content: z.string(),
});
export type SkillFile = z.infer<typeof SkillFile>;

export const Skill = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(1),
  name: z.string().min(1),
  /** When to use it — shown to people and to the model so it knows when the skill applies. */
  description: z.string().default(""),
  /** The SKILL.md body: steps, checks, expected output. */
  content: z.string().default(""),
  files: z.array(SkillFile).default([]),
  /**
   * global = applies to every agent (an agent can switch it off for itself);
   * agents = applies only to agents that have it ticked.
   */
  scope: z.enum(["global", "agents"]).default("agents"),
  source: z.enum(["manual", "folder", "starter", "github"]).default("manual"),
  /** For GitHub installs: where it came from, pinned to an exact commit. */
  origin: z
    .object({ repo: z.string(), path: z.string(), ref: z.string(), commit: z.string(), url: z.string() })
    .optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Skill = z.infer<typeof Skill>;
export type SkillInput = z.input<typeof Skill>;

export const SkillRef = z.object({ skillId: z.string().min(1), enabled: z.boolean().default(true) });
export type SkillRef = z.infer<typeof SkillRef>;

/** Parse a SKILL.md with optional `---` front matter (name / description), as used by Claude & Multica skill folders. */
export function parseSkillMarkdown(md: string): { name?: string; description?: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m) return { body: md.trim() };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return { name: meta.name, description: meta.description, body: m[2]!.trim() };
}

/** Render skills into a prompt section (used when a runtime has no native skill support). */
export function renderSkillsForPrompt(skills: Skill[], maxFileChars = 4000): string {
  if (!skills.length) return "";
  const parts = skills.map((s) => {
    const files = s.files
      .map((f) => `#### ${f.path}\n\n${f.content.length > maxFileChars ? f.content.slice(0, maxFileChars) + "\n…[truncated]" : f.content}`)
      .join("\n\n");
    return [`### Skill: ${s.name}`, s.description ? `_Use when:_ ${s.description}` : "", s.content, files].filter(Boolean).join("\n\n");
  });
  return `## Skills you can use\n\n${parts.join("\n\n---\n\n")}`;
}
