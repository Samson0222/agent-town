import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "./app";

/**
 * Localhost only. Never bind this to a public interface: it can start runs
 * that spend subscription credit once real runtimes are registered (M2).
 */
const HOST = "127.0.0.1";
const PORT = Number(process.env.AGENT_TOWN_PORT ?? 4317);
const DATA = resolve(process.env.AGENT_TOWN_DATA ?? resolve(import.meta.dirname, "../../../data"));

// OpenCode runtime: off unless AGENT_TOWN_OPENCODE_URL is set (e.g. http://127.0.0.1:4096).
// It uses your OpenCode subscription, so it is never switched on automatically.
const opencodeUrl = process.env.AGENT_TOWN_OPENCODE_URL;
if (opencodeUrl && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(opencodeUrl)) {
  console.error("AGENT_TOWN_OPENCODE_URL must point at localhost (e.g. http://127.0.0.1:4096) — OpenCode not registered.");
}
const opencode =
  opencodeUrl && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(opencodeUrl)
    ? { baseUrl: opencodeUrl, password: process.env.OPENCODE_SERVER_PASSWORD, directory: resolve(process.env.AGENT_TOWN_WORKDIR ?? process.cwd()) }
    : undefined;

const app = createApp({
  dbFile: resolve(DATA, "agent-town.db"),
  vaultDir: resolve(DATA, "vault"),
  mockStepMs: Number(process.env.AGENT_TOWN_MOCK_STEP_MS ?? 350),
  opencode,
});

createServer((req, res) => void app.handle(req, res)).listen(PORT, HOST, () => {
  console.log(`Agent Town server on http://${HOST}:${PORT} (data: ${DATA})`);
  console.log(`Runtimes: ${app.adapters.manifests().map((m) => m.id).join(", ")}`);
});
