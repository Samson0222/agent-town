"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PixelOffice, type OfficeAgent } from "@agent-town/pixel-office";
import type { Office3DAgent } from "@agent-town/office-3d";
import { ACTIVITY_LABEL, officeActivity, officeMeetings, officeStatus, type AgentStatus, type OfficeActivity, type RunState } from "@agent-town/core";

/**
 * The pixel office (engine + art from pixel-agents, MIT), wrapped for Agent Town.
 *
 * - Everyone on the team is always in the office: each agent owns a desk.
 * - What a character does comes only from its agent's projected status
 *   (reduceRunState); see packages/pixel-office/src/controller.ts for the mapping.
 * - Name tags and status pills are HTML overlays that follow the characters.
 */

export interface OfficePerson {
  id: string;
  name: string;
  color: string;
  status: AgentStatus;
  tool?: string;
  message?: string;
  /** Agent's sprite setting, e.g. "char-2" picks office character 2. */
  sprite?: string;
  /** Teammate this person is meeting with (from officeMeetings). */
  meetWith?: string;
}

const PILL: Record<Exclude<OfficeActivity, "idle">, { bg: string; fg: string }> = {
  thinking: { bg: "#ede9fe", fg: "#6d28d9" },
  coding: { bg: "#dbeafe", fg: "#1d4ed8" },
  terminal: { bg: "#1f2937", fg: "#a7f3d0" },
  browsing: { bg: "#ccfbf1", fg: "#0f766e" },
  reading: { bg: "#e0f2fe", fg: "#0369a1" },
  working: { bg: "#dbeafe", fg: "#1d4ed8" },
  "needs-you": { bg: "#ef4444", fg: "#ffffff" },
  error: { bg: "#fee2e2", fg: "#b91c1c" },
  done: { bg: "#dcfce7", fg: "#15803d" },
};
const MEETING = { bg: "#fef9c3", fg: "#854d0e" };
const CELEBRATE_MS = 3500;

export function Office({
  people,
  onAgentClick,
  selectedId,
  height = 704,
  simulated,
  controlsAt = "top-right",
  defaultMode = "2d",
  viewScope,
}: {
  people: OfficePerson[];
  onAgentClick?: (id: string) => void;
  selectedId?: string | null;
  height?: number | string;
  simulated?: boolean;
  /** Where the 2D/3D switch and the "Simulated" chip sit (pages with floating panels use the bottom). */
  controlsAt?: "top-right" | "bottom-center";
  /** The workspace's office style. */
  defaultMode?: "2d" | "3d";
  /** Remember the 2D/3D switch per workspace. */
  viewScope?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const officeRef = useRef<OfficeEngine | null>(null);
  const [mode, setMode] = useViewMode(defaultMode, viewScope);
  const tagsRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  // "Done" shows briefly (with a sparkle) when someone finishes, then the pill goes away.
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());
  const prevStatus = useRef(new Map<string, AgentStatus>());
  useEffect(() => {
    const fresh = people.filter((p) => p.status === "done" && prevStatus.current.has(p.id) && prevStatus.current.get(p.id) !== "done").map((p) => p.id);
    prevStatus.current = new Map(people.map((p) => [p.id, p.status]));
    if (!fresh.length) return;
    setCelebrating((c) => new Set([...c, ...fresh]));
    const t = setTimeout(() => setCelebrating((c) => new Set([...c].filter((id) => !fresh.includes(id)))), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [people]);
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));

  useEffect(() => {
    const canvas = canvasRef.current!;
    let office: OfficeEngine | null = null;
    let cancelled = false;
    const onFrame = () => {
        // Move the HTML name tags with the characters (no React re-render per frame).
        const host = tagsRef.current;
        if (!host) return;
        // Stack tags that would overlap (e.g. two people side by side on the sofa).
        const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
        for (const pos of [...(office?.labelPositions() ?? [])].sort((a, b) => b.y - a.y)) {
          const el = host.querySelector<HTMLElement>(`[data-agent="${CSS.escape(pos.id)}"]`);
          if (!el) continue;
          const w = el.offsetWidth || 60;
          const h = el.offsetHeight || 30;
          let y = pos.y;
          for (let guard = 0; guard < 6; guard++) {
            const hit = placed.find((r) => Math.abs(r.x - pos.x) < (r.w + w) / 2 && y > r.y - r.h && y - h < r.y);
            if (!hit) break;
            y = hit.y - hit.h - 2;
          }
          placed.push({ x: pos.x, y, w, h });
          el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
        }
    };
    const start = (engine: OfficeEngine) => {
      office = engine;
      officeRef.current = engine;
      engine.selectedId = selectedRef.current ?? null;
      engine.setAgents(toOffice(peopleRef.current));
    };
    if (mode === "3d") {
      // Three.js loads only when someone picks 3D.
      void import("@agent-town/office-3d").then(({ Office3D }) => {
        if (cancelled) return;
        if (!Office3D.supported()) return setMode("2d");
        start(new Office3D(canvas, { onFrame }) as unknown as OfficeEngine);
      });
    } else start(new PixelOffice(canvas, { onFrame }) as unknown as OfficeEngine);
    return () => {
      cancelled = true;
      office?.destroy();
      officeRef.current = null;
    };
  }, [mode, setMode]);

  useEffect(() => {
    officeRef.current?.setAgents(toOffice(people));
  }, [people]);

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    if (officeRef.current) officeRef.current.selectedId = selectedId ?? null;
  }, [selectedId]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height, background: "radial-gradient(ellipse at center, #2b2f4a 0%, #11131f 120%)" }}>
      <canvas
        key={mode}
        ref={canvasRef}
        className="block h-full w-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
        onClick={(e) => {
          const id = officeRef.current?.agentAt(e.clientX, e.clientY);
          if (id) onAgentClick?.(id);
        }}
        aria-label="Office: click a person to see their task, log and output"
      />
      <div
        className={`absolute z-10 flex items-center gap-2 ${controlsAt === "bottom-center" ? "bottom-4 left-1/2 -translate-x-1/2" : "right-3 top-3"}`}
      >
        {simulated && (
          <span className="pointer-events-none rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(17,19,31,.72)", color: "#fde68a" }}>
            Simulated
          </span>
        )}
        <div className="flex rounded-full p-0.5 text-[11px] font-semibold" style={{ background: "rgba(17,19,31,.72)" }} role="group" aria-label="Office view">
          {(["2d", "3d"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className="rounded-full px-2.5 py-1"
              style={{ background: mode === m ? "#fff" : "transparent", color: mode === m ? "#11131f" : "#cbd5e1" }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div ref={tagsRef} className="pointer-events-none absolute inset-0">
        {people.map((p) => {
          const act = officeActivity(p.status, p.tool);
          const idleMeeting = p.meetWith && (act === "idle" || act === "done");
          const show = idleMeeting || (act !== "idle" && (act !== "done" || celebrating.has(p.id)));
          const style = idleMeeting ? MEETING : act !== "idle" ? PILL[act] : null;
          const text = idleMeeting ? `With ${names[p.meetWith!] ?? "a teammate"}` : act === "done" ? "Done ✓" : ACTIVITY_LABEL[act] + (act === "thinking" ? "…" : "");
          return (
            <div key={p.id} data-agent={p.id} className="absolute left-0 top-0 flex flex-col items-center gap-0.5 whitespace-nowrap" style={{ transform: "translate(-9999px,-9999px)" }}>
              {show && style && (
                <span
                  className={`relative rounded-full px-2 py-0.5 text-[10px] font-bold shadow ${act === "needs-you" ? "office-pulse" : ""}`}
                  style={{ background: style.bg, color: style.fg }}
                  title={p.tool ?? p.message}
                >
                  {text}
                  {act === "done" && celebrating.has(p.id) && <span className="office-sparkle" aria-hidden />}
                </span>
              )}
              <span
                className="flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-semibold text-white shadow"
                style={{ background: "rgba(17,19,31,.78)", outline: selectedId === p.id ? "2px solid #fff" : undefined }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                {p.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** What both office views (2D pixel office, 3D office) accept: the same people, the same rules. */
interface OfficeEngine {
  selectedId: string | null;
  setAgents(agents: Array<OfficeAgent & Office3DAgent>): void;
  agentAt(clientX: number, clientY: number): string | null;
  labelPositions(): Array<{ id: string; x: number; y: number }>;
  destroy(): void;
}

function toOffice(people: OfficePerson[]): Array<OfficeAgent & Office3DAgent> {
  return people.map((p) => {
    const m = /^char-(\d+)$/.exec(p.sprite ?? "");
    return { id: p.id, name: p.name, status: p.status, tool: p.tool, look: m ? Number(m[1]) : undefined, meetWith: p.meetWith, color: p.color };
  });
}

const VIEW_KEY = "agent-town.office-view";

/**
 * 2D or 3D. Starts in the workspace's office style; a switch is remembered per
 * workspace in this browser. Phones start in 2D (lighter).
 */
function useViewMode(defaultMode: "2d" | "3d", scope?: string): ["2d" | "3d", (m: "2d" | "3d") => void] {
  const key = scope ? `${VIEW_KEY}:${scope}` : VIEW_KEY;
  const [mode, setModeState] = useState<"2d" | "3d">("2d");
  useEffect(() => {
    let want = defaultMode;
    try {
      const saved = localStorage.getItem(key);
      if (saved === "2d" || saved === "3d") want = saved;
    } catch {
      /* storage blocked: use the default */
    }
    setModeState(want === "3d" && window.innerWidth >= 640 ? "3d" : "2d");
  }, [key, defaultMode]);
  const setMode = useCallback(
    (m: "2d" | "3d") => {
      setModeState(m);
      try {
        localStorage.setItem(key, m);
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [mode, setMode];
}

/** Office people for a run: statuses, current tool and meetings, all from the projected state. */
export function officePeople(state: RunState): OfficePerson[] {
  const partner = new Map<string, string>();
  for (const [a, b] of officeMeetings(state)) {
    partner.set(a, b);
    partner.set(b, a);
  }
  return state.agentOrder
    .map((id) => state.agents[id])
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({ id: a.id, name: a.name, color: a.color, status: officeStatus(state, a.status), tool: a.currentTool, message: a.message, sprite: a.sprite, meetWith: partner.get(a.id) }));
}
