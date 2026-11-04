"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

export interface InboxItem {
  id: string;
  kind: "approval" | "plan" | "failed" | "outside";
  teamId: string;
  teamName: string;
  title: string;
  detail?: string;
  runId?: string;
  planId?: string;
  approvalId?: string;
  category?: string;
  preview?: string;
  at: string;
}

/** Everything waiting for a person, across workspaces (polled). */
export function useInbox(everyMs = 4000): { items: InboxItem[] | null; reload: () => void } {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api<InboxItem[]>("/api/inbox").then((x) => alive && setItems(x)).catch(() => alive && setItems((c) => c ?? []));
    void load();
    const t = setInterval(load, everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [everyMs, tick]);
  return { items, reload: () => setTick((n) => n + 1) };
}

export function useInboxCount(): number {
  return useInbox(5000).items?.length ?? 0;
}
