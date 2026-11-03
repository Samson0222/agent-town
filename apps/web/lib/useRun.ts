"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { reduceRunState, type AgentTownEvent } from "@agent-town/core";
import { API, api, type RunDetail } from "./api";

/**
 * Subscribes to a run's event stream. All view state is `reduceRunState(events)`,
 * optionally cut at `replaySeq` for replay. Nothing else drives the views.
 */
export function useRun(runId: string) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<AgentTownEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaySeq, setReplaySeq] = useState<number | null>(null);
  const lastSeq = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    lastSeq.current = 0;
    setEvents([]);
    api<RunDetail>(`/api/runs/${runId}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setEvents(d.events);
        lastSeq.current = d.events.at(-1)?.seq ?? 0;
        es = new EventSource(`${API}/api/runs/${runId}/stream?after=${lastSeq.current}`);
        es.onopen = () => setConnected(true);
        es.onerror = () => setConnected(false);
        es.onmessage = (m) => {
          const ev = JSON.parse(m.data) as AgentTownEvent;
          if (ev.seq <= lastSeq.current) return;
          lastSeq.current = ev.seq;
          setEvents((prev) => [...prev, ev]);
        };
      })
      .catch((e) => setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [runId]);

  const state = useMemo(() => reduceRunState(events, replaySeq ?? Infinity), [events, replaySeq]);
  const visibleEvents = useMemo(
    () => (replaySeq == null ? events : events.filter((e) => e.seq <= replaySeq)),
    [events, replaySeq],
  );
  return { detail, events, visibleEvents, state, connected, error, replaySeq, setReplaySeq };
}
