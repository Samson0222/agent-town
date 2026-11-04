"use client";
import { useEffect, useRef } from "react";
import { PixelOffice, type OfficeAgent } from "@agent-town/pixel-office";
import type { AgentStatus } from "@agent-town/core";

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
}

const PILL: Record<AgentStatus, { text: (p: OfficePerson) => string; bg: string; fg: string } | null> = {
  idle: null,
  done: null,
  thinking: { text: () => "Thinking…", bg: "#ede9fe", fg: "#6d28d9" },
  working: { text: (p) => (p.tool ? `Using ${p.tool}` : p.message?.slice(0, 28) || "Working"), bg: "#dbeafe", fg: "#1d4ed8" },
  "waiting-for-human": { text: () => "Waiting for you!", bg: "#fef3c7", fg: "#b45309" },
  failed: { text: () => "Something went wrong", bg: "#fee2e2", fg: "#b91c1c" },
};

export function Office({ people, onAgentClick, selectedId, height = 704 }: { people: OfficePerson[]; onAgentClick?: (id: string) => void; selectedId?: string | null; height?: number | string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const officeRef = useRef<PixelOffice | null>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef(people);
  peopleRef.current = people;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const office = new PixelOffice(canvas, {
      onFrame: () => {
        // Move the HTML name tags with the characters (no React re-render per frame).
        const host = tagsRef.current;
        if (!host) return;
        for (const pos of office.labelPositions()) {
          const el = host.querySelector<HTMLElement>(`[data-agent="${CSS.escape(pos.id)}"]`);
          if (el) el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px) translate(-50%, -100%)`;
        }
      },
    });
    officeRef.current = office;
    office.setAgents(toOffice(peopleRef.current));
    return () => {
      office.destroy();
      officeRef.current = null;
    };
  }, []);

  useEffect(() => {
    officeRef.current?.setAgents(toOffice(people));
  }, [people]);

  useEffect(() => {
    if (officeRef.current) officeRef.current.selectedId = selectedId ?? null;
  }, [selectedId]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height, background: "radial-gradient(ellipse at center, #2b2f4a 0%, #11131f 120%)" }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
        onClick={(e) => {
          const id = officeRef.current?.agentAt(e.clientX, e.clientY);
          if (id) onAgentClick?.(id);
        }}
        aria-label="Office: click a person to see their task, log and output"
      />
      <div ref={tagsRef} className="pointer-events-none absolute inset-0">
        {people.map((p) => {
          const pill = PILL[p.status];
          return (
            <div key={p.id} data-agent={p.id} className="absolute left-0 top-0 flex flex-col items-center gap-0.5 whitespace-nowrap" style={{ transform: "translate(-9999px,-9999px)" }}>
              {pill && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold shadow ${p.status === "waiting-for-human" ? "animate-bounce" : ""}`} style={{ background: pill.bg, color: pill.fg }}>
                  {pill.text(p)}
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

function toOffice(people: OfficePerson[]): OfficeAgent[] {
  return people.map((p) => {
    const m = /^char-(\d+)$/.exec(p.sprite ?? "");
    return { id: p.id, name: p.name, status: p.status, tool: p.tool, look: m ? Number(m[1]) : undefined };
  });
}
