"use client";
import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { api, errorText, formatUsd } from "@/lib/api";
import { useMe } from "@/lib/me";
import { PageHeader } from "@/components/ui";
import { useDialogs } from "@/components/Dialogs";

interface Person {
  email: string;
  role: "owner" | "operator" | "viewer";
  owner?: boolean;
  dailyBudgetUsd?: number;
  spentTodayUsd?: number;
}

const ROLE_TEXT: Record<Person["role"], string> = {
  owner: "Everything, including send / spend approvals",
  operator: "Build and run, within a daily budget",
  viewer: "Watch only",
};

export default function PeoplePage() {
  const { me } = useMe();
  const { confirm } = useDialogs();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("viewer");
  const [budget, setBudget] = useState("1");
  const [err, setErr] = useState<string | null>(null);

  const load = () => api<Person[]>("/api/people").then(setPeople).catch((e) => setErr(errorText(e)));
  useEffect(() => {
    void load();
  }, []);

  const invite = async () => {
    setErr(null);
    try {
      await api("/api/people", { json: { email, role, dailyBudgetUsd: role === "operator" ? Number(budget) : undefined } });
      setEmail("");
      await load();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const update = async (p: Person, patch: Partial<Person>) => {
    setErr(null);
    try {
      await api(`/api/people/${encodeURIComponent(p.email)}`, { method: "PUT", json: { role: p.role, dailyBudgetUsd: p.dailyBudgetUsd, ...patch } });
      await load();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const remove = async (p: Person) => {
    if (!(await confirm({ title: `Remove ${p.email}?`, message: "They can't use Agent Town any more. Also remove them from the Cloudflare Access policy.", confirmLabel: "Remove", danger: true }))) return;
    await api(`/api/people/${encodeURIComponent(p.email)}`, { method: "DELETE" });
    await load();
  };

  if (me && me.role !== "owner") return <p className="muted">Only the owner manages people.</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="People" subtitle="Who can sign in to your Agent Town from other devices." />

      <section className="panel p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_140px_auto] md:items-end">
          <label className="block">
            <span className="section-title mb-1 block">Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="block">
            <span className="section-title mb-1 block">Role</span>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as "operator" | "viewer")}>
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
            </select>
          </label>
          <label className="block" style={{ visibility: role === "operator" ? "visible" : "hidden" }}>
            <span className="section-title mb-1 block">Daily budget (USD)</span>
            <input className="input" type="number" min="0" step="0.5" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!email.trim()} onClick={invite}>
            <UserPlus size={16} /> Invite
          </button>
        </div>
        <p className="hint mt-3">Also add their email to the Cloudflare Access policy, so they can sign in.</p>
        {err && <p className="mt-2 text-sm" style={{ color: "var(--bad)" }}>{err}</p>}
      </section>

      <section className="panel divide-y" style={{ borderColor: "var(--line)" }}>
        {(people ?? []).map((p) => (
          <div key={p.email} className="flex flex-wrap items-center gap-3 p-4" style={{ borderColor: "var(--line)" }}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.email}</div>
              <div className="muted text-xs">{ROLE_TEXT[p.role]}</div>
            </div>
            {p.owner ? (
              <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                Owner
              </span>
            ) : (
              <>
                <select className="input !h-9 !w-36 text-sm" value={p.role} onChange={(e) => update(p, { role: e.target.value as Person["role"] })}>
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                </select>
                {p.role === "operator" && (
                  <span className="flex items-center gap-1 text-sm">
                    <input
                      className="input !h-9 !w-24 text-sm"
                      type="number"
                      min="0"
                      step="0.5"
                      defaultValue={p.dailyBudgetUsd ?? 0}
                      onBlur={(e) => Number(e.target.value) !== p.dailyBudgetUsd && update(p, { dailyBudgetUsd: Number(e.target.value) })}
                      aria-label="Daily budget (USD)"
                    />
                    <span className="muted text-xs">/ day · {formatUsd(p.spentTodayUsd ?? 0)} used</span>
                  </span>
                )}
                <button className="btn btn-ghost btn-icon" onClick={() => remove(p)} aria-label={`Remove ${p.email}`}>
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        ))}
        {people?.length === 0 && <p className="muted p-4 text-sm">No one invited yet.</p>}
      </section>
    </div>
  );
}
