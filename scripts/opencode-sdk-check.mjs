// Milestone 0 helper, run by verify-opencode (--serve) from inside .m0/.
// Talks to a localhost `opencode serve` and prints what it finds, so the adapter
// is built against the REAL API of the installed version.
//
//  - OpenCode 2.x: @opencode/client  → OpenCode.make({ baseUrl, headers })
//    (@opencode/sdk in 2.x is an *in-process* host, not an HTTP client — not what we want)
//  - OpenCode 1.x: @opencode-ai/sdk   → createOpencodeClient({ baseUrl })

const url = process.env.OPENCODE_URL ?? "http://127.0.0.1:4096";
const doPrompt = process.env.M0_PROMPT === "1";
const password = process.env.OPENCODE_SERVER_PASSWORD;
const headers = password ? { Authorization: "Basic " + Buffer.from(`opencode:${password}`).toString("base64") } : {};
const directory = process.env.M0_DIRECTORY ?? process.cwd();

const show = (label, v) => console.log(`${label}: ${JSON.stringify(v, null, 2)?.slice(0, 1500)}`);
const keys = (o) => (o && typeof o === "object" ? Object.keys(o) : []);

async function tryImport(name) {
  try {
    return await import(name);
  } catch {
    return null;
  }
}

async function v2(mod) {
  console.log("sdk package: @opencode/client (OpenCode 2.x HTTP client)");
  const client = mod.OpenCode.make({ baseUrl: url, headers });
  console.log(`client namespaces: ${keys(client).join(", ")}`);
  console.log(`session methods: ${keys(client.session).join(", ")}`);
  if (client.event) console.log(`event methods: ${keys(client.event).join(", ")}`);

  try {
    show("server.info", await client.server.info());
  } catch (e) {
    console.log(`server.info failed: ${e.message}`);
  }
  for (const [ns, fn] of [["model", "list"], ["provider", "list"], ["agent", "list"]]) {
    try {
      const out = await client[ns]?.[fn]?.();
      const list = Array.isArray(out) ? out : out?.data ?? out?.models ?? out?.providers ?? out;
      show(`${ns}.${fn} (first entries)`, Array.isArray(list) ? list.slice(0, 3) : keys(list));
    } catch (e) {
      console.log(`${ns}.${fn} failed: ${e.message}`);
    }
  }

  // Collect live event types for a few seconds while we create (and optionally prompt) a session.
  const seen = new Map();
  const ac = new AbortController();
  let eventsOk = false;
  const sub = (async () => {
    try {
      const stream = await client.event.subscribe({}, { signal: ac.signal });
      eventsOk = true;
      for await (const ev of stream) {
        const t = ev?.type ?? ev?.data?.type ?? "unknown";
        if (!seen.has(t)) seen.set(t, keys(ev?.properties ?? ev?.data ?? ev));
      }
    } catch (e) {
      if (!ac.signal.aborted) console.log(`event.subscribe failed: ${e.message}`);
    }
  })();

  const session = await client.session.create({ title: "agent-town-m0", location: { directory } });
  show("session.create", { id: session?.id, fields: keys(session), cost: session?.cost, tokens: session?.tokens });

  if (doPrompt && session?.id) {
    console.log("sending one tiny prompt (spends a little credit)…");
    await client.session.prompt({ sessionID: session.id, text: "Reply with exactly: AGENT_TOWN_OK" });
    await client.session.wait({ sessionID: session.id });
    try {
      const ctx = await client.session.context({ sessionID: session.id });
      show("session.context (last message fields)", keys(ctx?.at?.(-1)));
      try {
        const info = await client.session.get({ sessionID: session.id });
        show("session cost/tokens after prompt", { cost: info?.cost, tokens: info?.tokens });
      } catch (e) {
        console.log(`session.get failed: ${e.message}`);
      }
      show("last message", ctx?.at?.(-1));
    } catch (e) {
      console.log(`session.context failed: ${e.message}`);
    }
  } else {
    await new Promise((r) => setTimeout(r, 1500));
  }

  ac.abort();
  // Some stream implementations don't end on abort; never let that hang the check.
  await Promise.race([sub, new Promise((r) => setTimeout(r, 2000))]);
  console.log(`event stream connected: ${eventsOk}`);
  show("event types seen (type → payload keys)", Object.fromEntries(seen));

  if (session?.id) {
    try {
      await client.session.remove({ sessionID: session.id });
      console.log("session.remove: ok");
    } catch (e) {
      console.log(`session.remove failed: ${e.message}`);
    }
  }
}

async function v1(mod) {
  console.log("sdk package: @opencode-ai/sdk (OpenCode 1.x)");
  const client = mod.createOpencodeClient({ baseUrl: url, headers });
  console.log(`client namespaces: ${keys(client).join(", ")}`);
  const created = await client.session.create({ body: { title: "agent-town-m0" } });
  const session = created?.data ?? created;
  show("session.create", { id: session?.id, keys: keys(session) });
  if (doPrompt && session?.id) {
    const res = await client.session.prompt({ path: { id: session.id }, body: { parts: [{ type: "text", text: "Reply with exactly: AGENT_TOWN_OK" }] } });
    const data = res?.data ?? res;
    show("prompt info (cost/tokens)", { cost: data?.info?.cost, tokens: data?.info?.tokens });
  }
  if (session?.id) await client.session.delete({ path: { id: session.id } }).catch(() => undefined);
}

try {
  const c2 = await tryImport("@opencode/client");
  if (c2?.OpenCode?.make) await v2(c2);
  else {
    const c1 = await tryImport("@opencode-ai/sdk");
    if (c1?.createOpencodeClient) await v1(c1);
    else throw new Error("Neither @opencode/client (2.x) nor @opencode-ai/sdk (1.x) is installed in .m0/");
  }
  console.log("SDK CHECK: OK");
  process.exit(0); // don't wait on any lingering stream
} catch (e) {
  console.log(`SDK CHECK: FAILED — ${e.message}`);
  if (/401|403|unauthor/i.test(e.message)) console.log("Hint: server auth header format may differ in this version — report this line.");
  process.exitCode = 1;
}
