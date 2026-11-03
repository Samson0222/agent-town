import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Vault } from "@agent-town/core";

/**
 * Markdown vault on disk, laid out like AI Agent Office (Imangali7/ai-agent-office, MIT):
 *
 *   <root>/<team vault>/
 *     00-INBOX/  01-KNOWLEDGE/  02-PROJECTS/  03-DAILY/
 *     04-OUTPUTS/<YYYY-MM-DD>-<workflow>-<run8>/   ← everything a run writes
 *     05-RESOURCES/  06-ARCHIVE/  07-SYSTEM/
 *
 * Only the folder layout is borrowed; its CEO orchestrator is not used.
 * Paths are always confined to the run's folder.
 */
export const VAULT_FOLDERS = ["00-INBOX", "01-KNOWLEDGE", "02-PROJECTS", "03-DAILY", "04-OUTPUTS", "05-RESOURCES", "06-ARCHIVE", "07-SYSTEM"] as const;

export class DiskVault implements Vault {
  constructor(
    readonly root: string,
    /** Maps a run to its folder relative to `root`; falls back to runs/<runId>. */
    private resolveRunDir: (runId: string) => string | undefined = () => undefined,
  ) {}

  /** Create the numbered folders of a team vault (idempotent). */
  async ensureTeamVault(teamVault: string): Promise<string> {
    const base = this.safeJoin(this.root, safeName(teamVault));
    await Promise.all(VAULT_FOLDERS.map((f) => mkdir(join(base, f), { recursive: true })));
    return base;
  }

  /** Folder (relative to root) for a new run's outputs. */
  static runFolder(teamVault: string, workflowName: string, runId: string, date = new Date()): string {
    const day = date.toISOString().slice(0, 10);
    const slug = workflowName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "run";
    return [safeName(teamVault), "04-OUTPUTS", `${day}-${slug}-${runId.slice(0, 8)}`].join("/");
  }

  runDir(runId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error("Invalid run id");
    const rel = this.resolveRunDir(runId);
    return rel ? this.safeJoin(this.root, rel) : resolve(this.root, "runs", runId);
  }

  resolveFile(runId: string, file: string): string {
    return this.safeJoin(this.runDir(runId), file);
  }

  async writeFile(runId: string, file: string, content: string) {
    const full = this.resolveFile(runId, file);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
    return { file: relative(this.runDir(runId), full).split(sep).join("/"), bytes: Buffer.byteLength(content) };
  }

  async readFile(runId: string, file: string) {
    try {
      return await readFile(this.resolveFile(runId, file), "utf8");
    } catch {
      return undefined;
    }
  }

  async listFiles(runId: string): Promise<string[]> {
    const base = this.runDir(runId);
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else out.push(relative(base, p).split(sep).join("/"));
      }
    };
    await walk(base);
    return out.sort();
  }

  private safeJoin(base: string, rel: string): string {
    const b = resolve(base);
    const full = resolve(b, rel);
    if (full !== b && !full.startsWith(b + sep)) throw new Error(`Path escapes the vault: ${rel}`);
    return full;
  }
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, "-").replace(/^\.+/, "") || "default";
}
