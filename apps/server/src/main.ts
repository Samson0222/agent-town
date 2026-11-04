import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "./app";
import { AccessVerifier } from "./auth";

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

// Hosted access (docs/hosting.md): off unless all four are set. The tunnel port also binds to
// 127.0.0.1 — only cloudflared on this PC connects to it, and every request needs a valid
// Cloudflare Access login for an invited person.
const hosted = {
  teamDomain: process.env.AGENT_TOWN_ACCESS_TEAM, // e.g. devsam.cloudflareaccess.com
  audience: process.env.AGENT_TOWN_ACCESS_AUD, // the Access application's AUD tag
  ownerEmail: process.env.AGENT_TOWN_OWNER_EMAIL?.trim().toLowerCase(),
  publicOrigin: process.env.AGENT_TOWN_PUBLIC_ORIGIN?.replace(/\/+$/, ""), // e.g. https://agents.devsam.my
};
const TUNNEL_PORT = Number(process.env.AGENT_TOWN_TUNNEL_PORT ?? 4318);
const hostedSet = Object.values(hosted).filter(Boolean).length;
if (hostedSet > 0 && hostedSet < 4) {
  console.error("Hosted access needs AGENT_TOWN_ACCESS_TEAM, AGENT_TOWN_ACCESS_AUD, AGENT_TOWN_OWNER_EMAIL and AGENT_TOWN_PUBLIC_ORIGIN — hosted access stays off.");
}
if (hosted.publicOrigin && !/^https:\/\/[a-z0-9.-]+$/i.test(hosted.publicOrigin)) {
  console.error("AGENT_TOWN_PUBLIC_ORIGIN must be an https origin like https://agents.devsam.my — hosted access stays off.");
}
const access =
  hostedSet === 4 && /^https:\/\/[a-z0-9.-]+$/i.test(hosted.publicOrigin!)
    ? {
        verifier: new AccessVerifier({ teamDomain: hosted.teamDomain!, audience: hosted.audience! }),
        ownerEmail: hosted.ownerEmail!,
        publicOrigin: hosted.publicOrigin!,
      }
    : undefined;

const app = createApp({
  dbFile: resolve(DATA, "agent-town.db"),
  vaultDir: resolve(DATA, "vault"),
  mockStepMs: Number(process.env.AGENT_TOWN_MOCK_STEP_MS ?? 350),
  opencode,
  access,
});

createServer((req, res) => void app.handle(req, res)).listen(PORT, HOST, () => {
  console.log(`Agent Town server on http://${HOST}:${PORT} (data: ${DATA})`);
  console.log(`Runtimes: ${app.adapters.manifests().map((m) => m.id).join(", ")}`);
});

if (access) {
  createServer((req, res) => void app.handleTunnel(req, res)).listen(TUNNEL_PORT, HOST, () => {
    console.log(`Hosted access: tunnel port http://${HOST}:${TUNNEL_PORT} for ${access.publicOrigin} (owner ${access.ownerEmail})`);
  });
}
