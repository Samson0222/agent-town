// Milestone 0 helper, run by verify-opencode.sh --serve from the .m0/ folder.
// Talks to a localhost `opencode serve` through the official SDK and prints what it finds,
// so the adapter can be built against the REAL API of the installed version.
// It deliberately tries a few method shapes and reports which exist, instead of assuming.

const url = process.env.OPENCODE_URL ?? "http://127.0.0.1:4096";
const doPrompt = process.env.M0_PROMPT === "1";
const password = process.env.OPENCODE_SERVER_PASSWORD;
const headers = password ? { Authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") } : {};

async function load() {
  for (const name of ["@opencode-ai/sdk", "@opencode/sdk", "@opencode/client"]) {
    try {
      const mod = await import(name);
      return { name, mod };
    } catch {}
  }
  throw new Error("No OpenCode SDK package found in .m0/node_modules");
}

const show = (label, v) => console.log(`${label}: ${JSON.stringify(v, null, 2)?.slice(0, 1500)}`);

try {
  const { name, mod } = await load();
  console.log(`sdk package: ${name}`);
  console.log(`sdk exports: ${Object.keys(mod).join(", ")}`);
  const create = mod.createOpencodeClient ?? mod.createClient ?? mod.default?.createOpencodeClient;
  if (!create) throw new Error("No client factory export found");
  const client = create({ baseUrl: url, headers });
  console.log(`client namespaces: ${Object.keys(client).join(", ")}`);
  if (client.session) console.log(`session methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(client.session)).join(", ")}`);
  if (client.event) console.log(`event methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(client.event)).join(", ")}`);

  try {
    const providers = await client.config?.providers?.();
    const list = providers?.data?.providers ?? providers?.providers ?? [];
    show("providers (ids → model count)", list.map((p) => [p.id, Object.keys(p.models ?? {}).length]));
  } catch (e) {
    console.log(`config.providers failed: ${e.message}`);
  }

  const created = await client.session.create({ body: { title: "agent-town-m0" } });
  const session = created?.data ?? created;
  show("session.create", { id: session?.id, keys: Object.keys(session ?? {}) });

  if (doPrompt && session?.id) {
    console.log("sending one tiny prompt (spends a little credit)…");
    const res = await client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: "text", text: "Reply with exactly: AGENT_TOWN_OK" }] },
    });
    const data = res?.data ?? res;
    show("prompt result keys", Object.keys(data ?? {}));
    show("prompt info (cost/tokens if reported)", { cost: data?.info?.cost, tokens: data?.info?.tokens });
    show("prompt parts types", (data?.parts ?? []).map((p) => p.type));
  }

  if (session?.id) {
    try {
      await client.session.delete({ path: { id: session.id } });
      console.log("session.delete: ok");
    } catch (e) {
      console.log(`session.delete failed: ${e.message}`);
    }
  }
  console.log("SDK CHECK: OK");
} catch (e) {
  console.log(`SDK CHECK: FAILED — ${e.message}`);
  process.exitCode = 1;
}
