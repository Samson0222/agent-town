"use client";
import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { api, errorText, formatUsd, type RuntimeInfo } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { useUsage } from "@/components/UsageView";

/** What's connected: each runtime, whether it answers, its models and what it has cost. */
export default function RuntimesPage() {
  const [runtimes, setRuntimes] = useState<RuntimeInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { usage } = useUsage();
  useEffect(() => {
    api<RuntimeInfo[]>("/api/runtimes").then(setRuntimes).catch((e) => setError(errorText(e)));
  }, []);
  const hasOpenCode = runtimes?.some((r) => r.id === "opencode");
  return (
    <div>
      <PageHeader title="Runtimes" />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(runtimes ?? []).map((r) => {
          const spent = usage?.byRuntime.find((u) => u.key === r.id);
          return (
            <section key={r.id} className="panel p-5">
              <div className="mb-2 flex items-center gap-2">
                <Cpu size={18} style={{ color: "var(--accent)" }} />
                <span className="font-semibold">{r.name}</span>
                <span className="chip ml-auto" style={{ color: r.models.length ? "var(--ok)" : "var(--warn)", background: r.models.length ? "var(--ok-soft)" : "var(--warn-soft)" }}>
                  <span className="chip-dot" /> {r.models.length ? "Online" : "Not answering"}
                </span>
              </div>
              <p className="muted mb-3 text-sm">{r.spendsCredit ? "Spends credit" : "Free practice runs"}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {r.models.slice(0, 12).map((m) => (
                  <span key={m.id} className="chip font-mono" style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}>
                    {m.id}
                  </span>
                ))}
              </div>
              <div className="muted text-xs">Last 30 days: {formatUsd(spent?.usd ?? 0)} · {(spent?.steps ?? 0).toLocaleString()} steps</div>
            </section>
          );
        })}
        {runtimes && !hasOpenCode && (
          <section className="panel p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Cpu size={18} className="muted" /> OpenCode
              <span className="chip ml-auto" style={{ background: "var(--bg-soft)", color: "var(--muted)" }}>
                Not connected
              </span>
            </div>
            <ol className="muted list-decimal space-y-1 pl-5 text-sm">
              <li>Run <code>opencode serve --hostname 127.0.0.1</code> with OPENCODE_SERVER_PASSWORD set.</li>
              <li>Set AGENT_TOWN_OPENCODE_URL (and the password) before <code>npm run dev</code>.</li>
              <li>Real runs spend credit, so the first one needs your OK.</li>
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
