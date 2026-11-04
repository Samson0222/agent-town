import { Skill, parseSkillMarkdown, type AgentTemplate, type SkillFile } from "@agent-town/core";

/**
 * Skill helpers: folder import, GitHub install (preview → save, pinned commit),
 * and per-agent assignment. Nothing here ever executes a skill's files — scripts
 * are stored and shown as text only.
 */

export const SCRIPT_EXT = /\.(sh|bash|zsh|ps1|psm1|bat|cmd|py|js|mjs|cjs|ts|rb|pl|php|exe|dll|so)$/i;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|tar|7z|woff2?|ttf|otf|mp3|mp4|mov|wasm|bin|skill)$/i;
const MAX_FILES = 60;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 1_000_000;

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "skill";
}

/** Build a skill from a folder's text files (SKILL.md at the root of `files`). */
export function skillFromFiles(files: Record<string, string>, source: Skill["source"], fallbackName = "Imported skill"): { skill: Skill; warnings: string[] } {
  const warnings: string[] = [];
  const mdKey = Object.keys(files).find((k) => k === "SKILL.md" || k.toLowerCase() === "skill.md");
  if (!mdKey) throw new Error("No SKILL.md in this folder");
  const md = parseSkillMarkdown(files[mdKey]!);
  const extra: SkillFile[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path === mdKey) continue;
    if (BINARY_EXT.test(path)) {
      warnings.push(`Skipped binary file ${path}`);
      continue;
    }
    if (SCRIPT_EXT.test(path)) warnings.push(`${path} is a script — kept as text for reference; Agent Town never runs it`);
    extra.push({ path, content });
  }
  const name = md.name?.trim() || fallbackName;
  const skill = Skill.parse({
    id: slugify(name),
    name,
    description: md.description ?? "",
    content: md.body,
    files: extra,
    source,
  });
  return { skill, warnings };
}

// ---------------------------------------------------------------------------
// GitHub install

export interface GithubRef {
  owner: string;
  repo: string;
  ref?: string;
  path: string;
}

/** Accepts github.com/o/r, …/tree/<ref>/<path>, …/blob/<ref>/<path>/SKILL.md, or "o/r/path". */
export function parseGithubUrl(input: string): GithubRef {
  const raw = input.trim().replace(/\/+$/, "");
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)(?:\/(tree|blob)\/([^/]+)(?:\/(.*))?)?$/.exec(raw);
  if (m) {
    let path = m[5] ?? "";
    if (/(^|\/)SKILL\.md$/i.test(path)) path = path.replace(/\/?SKILL\.md$/i, "");
    return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, ""), ref: m[4], path };
  }
  const short = /^([\w.-]+)\/([\w.-]+)(?:\/(.*))?$/.exec(raw);
  if (short) return { owner: short[1]!, repo: short[2]!, path: (short[3] ?? "").replace(/\/?SKILL\.md$/i, "") };
  throw new Error("Not a GitHub URL. Use e.g. https://github.com/owner/repo/tree/main/skills/my-skill");
}

export interface GithubPreview {
  skill: Skill;
  warnings: string[];
  files: Array<{ path: string; bytes: number; script: boolean }>;
}

/** Returned instead of a preview when the link holds several skills: the user picks one. */
export interface GithubChoices {
  choices: Array<{ path: string; url: string }>;
  repo: string;
  ref: string;
}

export const isChoices = (r: GithubPreview | GithubChoices): r is GithubChoices => "choices" in r;

type Fetch = typeof fetch;

/**
 * Download a skill folder from GitHub at an exact commit (resolved from the ref).
 * Uses the public REST API + raw.githubusercontent.com; GITHUB_TOKEN is used if set
 * (rate limits) and never logged or stored.
 */
export async function fetchGithubSkill(input: string, f: Fetch = fetch, token = process.env.GITHUB_TOKEN): Promise<GithubPreview | GithubChoices> {
  const g = parseGithubUrl(input);
  let autoPicked: string | null = null;
  let hiddenCopies = 0;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "agent-town" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const getJson = async (url: string) => {
    const r = await f(url, { headers });
    if (r.status === 404) throw new Error(`Not found on GitHub: ${g.owner}/${g.repo}${g.ref ? `@${g.ref}` : ""}${g.path ? `/${g.path}` : ""}`);
    if (r.status === 403 || r.status === 429) throw new Error("GitHub rate limit reached — try again later or set GITHUB_TOKEN on the server");
    if (!r.ok) throw new Error(`GitHub API error ${r.status}`);
    return r.json() as Promise<any>;
  };
  const api = `https://api.github.com/repos/${g.owner}/${g.repo}`;
  const ref = g.ref ?? (await getJson(api)).default_branch;
  const commit: string = (await getJson(`${api}/commits/${encodeURIComponent(ref)}`)).sha;
  const tree = (await getJson(`${api}/git/trees/${commit}?recursive=1`)) as { tree: Array<{ path: string; type: string; size?: number }>; truncated?: boolean };
  const all = tree.tree.filter((e) => e.type === "blob");
  if (!all.some((b) => b.path === (g.path ? `${g.path}/SKILL.md` : "SKILL.md"))) {
    // The link points at a repo or parent folder: find the skill folders inside it.
    const under = g.path ? `${g.path}/` : "";
    const dirs = all.filter((e) => /(^|\/)SKILL\.md$/.test(e.path) && e.path.startsWith(under)).map((e) => e.path.replace(/\/?SKILL\.md$/, ""));
    // Only the outermost skills (a skill's nested sub-skills belong to it).
    const outer = dirs.filter((d) => !dirs.some((o) => o !== d && d.startsWith(`${o}/`))).sort();
    if (!outer.length) throw new Error(`No SKILL.md found in ${g.owner}/${g.repo}${g.path ? `/${g.path}` : ""}`);
    // Copies in hidden tool folders (.cursor/, .claude/, …) are usually mirrors of the real one.
    const visible = outer.filter((d) => !d.split("/").some((seg) => seg.startsWith(".")));
    const picks = visible.length ? visible : outer;
    if (picks.length > 1) {
      return {
        choices: picks.slice(0, 50).map((path) => ({ path, url: `https://github.com/${g.owner}/${g.repo}/tree/${ref}/${path}` })),
        repo: `${g.owner}/${g.repo}`,
        ref,
      };
    }
    autoPicked = picks[0]!;
    hiddenCopies = outer.length - picks.length;
    g.path = autoPicked;
  }
  const prefix = g.path ? `${g.path}/` : "";
  const blobs = all.filter((b) => (prefix ? b.path.startsWith(prefix) : true));
  // Only the skill folder itself: skip files that belong to nested skills.
  const nested = new Set(blobs.filter((b) => /\/SKILL\.md$/.test(b.path) && b.path !== `${prefix}SKILL.md`).map((b) => b.path.replace(/SKILL\.md$/, "")));
  const mine = blobs.filter((b) => ![...nested].some((n) => b.path.startsWith(n)));
  if (mine.length > MAX_FILES) throw new Error(`That folder has ${mine.length} files; the limit is ${MAX_FILES}`);

  const warnings: string[] = [];
  const files: Record<string, string> = {};
  const listing: GithubPreview["files"] = [];
  let total = 0;
  for (const b of mine) {
    const rel = b.path.slice(prefix.length);
    if (BINARY_EXT.test(rel)) {
      warnings.push(`Skipped binary file ${rel}`);
      continue;
    }
    if ((b.size ?? 0) > MAX_FILE_BYTES) {
      warnings.push(`Skipped ${rel} (larger than ${MAX_FILE_BYTES / 1000} KB)`);
      continue;
    }
    const r = await f(`https://raw.githubusercontent.com/${g.owner}/${g.repo}/${commit}/${b.path.split("/").map(encodeURIComponent).join("/")}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error(`Could not download ${rel} (${r.status})`);
    const text = await r.text();
    if (text.includes("\u0000")) {
      warnings.push(`Skipped binary file ${rel}`);
      continue;
    }
    total += text.length;
    if (total > MAX_TOTAL_BYTES) throw new Error(`Skill is larger than ${MAX_TOTAL_BYTES / 1_000_000} MB`);
    files[rel] = text;
    listing.push({ path: rel, bytes: text.length, script: SCRIPT_EXT.test(rel) });
  }
  const built = skillFromFiles(files, "github", g.path.split("/").pop() || g.repo);
  const url = `https://github.com/${g.owner}/${g.repo}/tree/${commit}${g.path ? `/${g.path}` : ""}`;
  const skill = Skill.parse({ ...built.skill, origin: { repo: `${g.owner}/${g.repo}`, path: g.path, ref, commit, url } });
  if (autoPicked) warnings.unshift(`Found the skill in ${autoPicked}/${hiddenCopies ? ` (ignored ${hiddenCopies} copy in a hidden folder such as .cursor/)` : ""}`);
  return { skill, warnings: [...warnings, ...built.warnings.filter((w) => !warnings.includes(w))], files: listing };
}

// ---------------------------------------------------------------------------
// Assignment

/**
 * Apply per-agent choices for a skill.
 *  - agents scope: true → agent has it (enabled), false → removed
 *  - global scope: false → switched off for that agent, true → default (on)
 */
export function applyAssignment(agent: AgentTemplate, skill: Skill, on: boolean): AgentTemplate {
  const others = agent.skills.filter((r) => r.skillId !== skill.id);
  if (skill.scope === "global") return { ...agent, skills: on ? others : [...others, { skillId: skill.id, enabled: false }] };
  return { ...agent, skills: on ? [...others, { skillId: skill.id, enabled: true }] : others };
}

export function isAssigned(agent: AgentTemplate, skill: Skill): boolean {
  const ref = agent.skills.find((r) => r.skillId === skill.id);
  return skill.scope === "global" ? ref?.enabled !== false : ref?.enabled === true;
}
