import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Vault } from "@agent-town/core";

/** Markdown vault on disk: <root>/runs/<runId>/<file>. Paths can't escape the run folder. */
export class DiskVault implements Vault {
  constructor(readonly root: string) {}

  runDir(runId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error("Invalid run id");
    return resolve(this.root, "runs", runId);
  }

  resolveFile(runId: string, file: string): string {
    const base = this.runDir(runId);
    const full = resolve(base, file);
    if (full !== base && !full.startsWith(base + sep)) throw new Error(`Path escapes the run vault: ${file}`);
    return full;
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
}
