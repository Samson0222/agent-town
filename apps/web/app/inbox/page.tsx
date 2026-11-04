"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, CircleCheck, ListChecks, Play, Radio, X } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { useInbox, type InboxItem } from "@/lib/inbox";
import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { wsPath } from "@/lib/workspace";

const ICON = { approval: ListChecks, plan: Play, failed: AlertTriangle, outside: Radio } as const;

/** Only the moments that need a person: approvals, plans to start, failed runs, outside agents asking. */
export default function InboxPage() {
  const { items, reload } = useInbox(3000);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, f: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await f();
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Inbox" />
      {error && <p className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {items && items.length === 0 && (
        <div className="panel">
          <EmptyState icon={<CircleCheck size={22} />} title="Nothing needs you" />
        </div>
      )}
      <ul className="space-y-3">
        {(items ?? []).map((i) => (
          <li key={i.id} className="panel p-4">
            <Item item={i} busy={busy === i.id} act={(f) => act(i.id, f)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Item({ item: i, busy, act }: { item: InboxItem; busy: boolean; act: (f: () => Promise<unknown>) => void }) {
  const Icon = ICON[i.kind];
  const owner = i.category === "send" || i.category === "spend";
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: i.kind === "failed" ? "var(--bad-soft)" : "var(--warn-soft)", color: i.kind === "failed" ? "var(--bad)" : "var(--warn)" }}>
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{i.title}</div>
        <div className="muted text-xs">
          <Link href={wsPath(i.teamId)} className="hover:underline">
            {i.teamName}
          </Link>
          {i.detail ? ` · ${i.detail}` : ""} · {timeAgo(i.at)}
        </div>
        {i.preview && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-xs" style={{ background: "var(--panel-2)" }}>{i.preview}</pre>}
        <div className="mt-3 flex flex-wrap gap-2">
          {i.kind === "approval" && (
            <>
              <button data-needs={owner ? "owner" : "run"} className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => api(`/api/runs/${i.runId}/approve`, { json: { approvalId: i.approvalId, approved: true } }))}>
                <Check size={14} /> Approve
              </button>
              <button data-needs={owner ? "owner" : "run"} className="btn btn-sm" disabled={busy} onClick={() => act(() => api(`/api/runs/${i.runId}/approve`, { json: { approvalId: i.approvalId, approved: false } }))}>
                <X size={14} /> Reject
              </button>
              <Link className="btn btn-sm btn-ghost" href={`/runs/${i.runId}`}>
                Open run
              </Link>
            </>
          )}
          {i.kind === "plan" && (
            <>
              <button data-needs="run" className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => api(`/api/plans/${i.planId}/run`, { method: "POST" }))}>
                <Play size={14} /> Run plan
              </button>
              <Link className="btn btn-sm btn-ghost" href={wsPath(i.teamId, "agent")}>
                Open chat
              </Link>
            </>
          )}
          {i.kind === "failed" && (
            <>
              <Link className="btn btn-sm" href={`/runs/${i.runId}`}>
                Open run
              </Link>
              <button data-needs="run" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(() => api("/api/inbox/dismiss", { json: { id: i.id } }))}>
                Dismiss
              </button>
            </>
          )}
          {i.kind === "outside" && (
            <Link className="btn btn-sm" href={`/office?team=${encodeURIComponent(i.teamId)}`}>
              Open office
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
