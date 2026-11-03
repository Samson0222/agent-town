"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Workflow } from "@agent-town/core";
import { api, errorText, formatUsd, type PreflightResult, type RunRow } from "@/lib/api";

const STATUS_COLOR: Record<string, string> = {
  running: "#2563eb",
  paused: "#d97706",
  completed: "#16a34a",
  failed: "#dc2626",
  stopped: "#6b7280",
  pending: "#6b7280",
};

export default function HomePage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [wfId, setWfId] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<Workflow[]>("/api/workflows"), api<RunRow[]>("/api/runs")])
      .then(([w, r]) => {
        setWorkflows(w);
        setRuns(r);
        const first = w.find((x) => x.id === "launch-brief") ?? w[0];
        if (first) setWfId(first.id);
      })
      .catch((e) => setError(`Can't reach the Agent Town server. Is it running? (${errorText(e)})`));
  }, []);

  const wf = workflows.find((w) => w.id === wfId);
  useEffect(() => {
    if (!wf) return;
    setInputs(Object.fromEntries(wf.inputs.map((i) => [i.key, i.default ?? ""])));
    setPreflight(null);
  }, [wf]);

  async function check() {
    if (!wf) return;
    setError(null);
    try {
      setPreflight(await api<PreflightResult>(`/api/workflows/${wf.id}/preflight`, { json: { inputs } }));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function start() {
    if (!wf) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ runId: string }>("/api/runs", { json: { workflowId: wf.id, inputs } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="panel p-4">
        <h1 className="mb-1 text-lg font-semibold">Start a run</h1>
        <p className="muted mb-4 text-sm">Pick a workflow, type a goal, and watch the office work.</p>
        <label className="field">
          Workflow
          <select className="input" value={wfId} onChange={(e) => setWfId(e.target.value)}>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {wf?.description && <p className="muted mb-3 text-xs">{wf.description}</p>}
        {wf?.inputs.map((i) => (
          <label key={i.key} className="field">
            {i.label || i.key}
            {i.required && " *"}
            {i.type === "longtext" ? (
              <textarea className="input" rows={3} value={inputs[i.key] ?? ""} onChange={(e) => setInputs({ ...inputs, [i.key]: e.target.value })} />
            ) : (
              <input className="input" value={inputs[i.key] ?? ""} onChange={(e) => setInputs({ ...inputs, [i.key]: e.target.value })} />
            )}
          </label>
        ))}
        <div className="flex gap-2">
          <button className="btn" onClick={check} disabled={!wf}>
            Check
          </button>
          <button className="btn btn-primary" onClick={start} disabled={!wf || busy}>
            {busy ? "Starting…" : "Start run"}
          </button>
          {wf && (
            <Link className="btn ml-auto" href={`/workflows/${wf.id}`}>
              Edit workflow
            </Link>
          )}
        </div>
        {preflight && (
          <div className="mt-3 text-sm">
            {preflight.ok && <p className="text-green-600">✓ Ready to run.</p>}
            <ul className="mt-1 space-y-1">
              {preflight.issues.map((i, k) => (
                <li key={k} className={i.level === "error" ? "text-red-600" : "text-amber-600"}>
                  {i.level === "error" ? "✗" : "⚠"} {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-semibold">Runs</h2>
        {runs.length === 0 && <p className="muted text-sm">No runs yet.</p>}
        <table className="w-full text-sm">
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-2">
                  <Link className="hover:underline" href={`/runs/${r.id}`}>
                    {r.workflowName}
                  </Link>
                  <div className="muted text-xs">{new Date(r.createdAt).toLocaleString()}</div>
                </td>
                <td>
                  <span className="rounded px-2 py-0.5 text-xs text-white" style={{ background: STATUS_COLOR[r.status] ?? "#6b7280" }}>
                    {r.status}
                  </span>
                </td>
                <td className="muted text-right text-xs">{formatUsd(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
