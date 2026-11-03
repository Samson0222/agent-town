"use client";
import type { ReactNode } from "react";
import type { AgentStatus, RunStatus } from "@agent-town/core";

/** Small shared UI pieces: status chips, avatars, empty states, page headers. */

const RUN_STATUS: Record<string, { label: string; fg: string; bg: string; live?: boolean }> = {
  pending: { label: "Starting", fg: "var(--muted)", bg: "var(--bg-soft)" },
  running: { label: "Running", fg: "var(--info)", bg: "var(--info-soft)", live: true },
  paused: { label: "Paused", fg: "var(--warn)", bg: "var(--warn-soft)" },
  completed: { label: "Completed", fg: "var(--ok)", bg: "var(--ok-soft)" },
  failed: { label: "Failed", fg: "var(--bad)", bg: "var(--bad-soft)" },
  stopped: { label: "Stopped", fg: "var(--muted)", bg: "var(--bg-soft)" },
};

export function RunStatusChip({ status }: { status: RunStatus | string }) {
  const s = RUN_STATUS[status] ?? RUN_STATUS.pending!;
  return (
    <span className="chip" style={{ color: s.fg, background: s.bg }}>
      <span className={`chip-dot ${s.live ? "pulse" : ""}`} />
      {s.label}
    </span>
  );
}

export const AGENT_STATUS: Record<AgentStatus, { label: string; fg: string; bg: string; live?: boolean }> = {
  idle: { label: "Idle", fg: "var(--muted)", bg: "var(--bg-soft)" },
  thinking: { label: "Thinking", fg: "#7c3aed", bg: "var(--accent-soft)", live: true },
  working: { label: "Working", fg: "var(--info)", bg: "var(--info-soft)", live: true },
  "waiting-for-human": { label: "Needs you", fg: "var(--warn)", bg: "var(--warn-soft)", live: true },
  done: { label: "Done", fg: "var(--ok)", bg: "var(--ok-soft)" },
  failed: { label: "Failed", fg: "var(--bad)", bg: "var(--bad-soft)" },
};

export function AgentStatusChip({ status }: { status: AgentStatus }) {
  const s = AGENT_STATUS[status];
  return (
    <span className="chip" style={{ color: s.fg, background: s.bg }}>
      <span className={`chip-dot ${s.live ? "pulse" : ""}`} />
      {s.label}
    </span>
  );
}

/** Office character index from an agent's sprite setting ("char-3" → 3), if it picks one. */
export function characterIndex(sprite?: string): number | undefined {
  const m = /^char-(\d+)$/.exec(sprite ?? "");
  return m ? Number(m[1]) : undefined;
}

/** The pixel-office character (front-facing, first frame), drawn from the office sprite sheet. */
export function PixelCharacter({ index, scale = 2 }: { index: number; scale?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{
        width: 16 * scale,
        height: 32 * scale,
        backgroundImage: `url(/pixel-office/assets/characters/char_${index}.png)`,
        backgroundSize: `${112 * scale}px ${96 * scale}px`,
        backgroundPosition: "0 0",
        imageRendering: "pixelated",
      }}
    />
  );
}

export function Avatar({ name, color, size = 36, ring, sprite }: { name: string; color: string; size?: number; ring?: string; sprite?: string }) {
  const ch = characterIndex(sprite);
  if (ch !== undefined) {
    return (
      <span
        className="inline-flex shrink-0 items-start justify-center overflow-hidden rounded-full"
        style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${shade(color, -0.25)})`, boxShadow: ring ? `0 0 0 2px var(--panel), 0 0 0 4px ${ring}` : undefined }}
        title={name}
      >
        {/* head and shoulders: the sprite's top half, nudged down a little */}
        <span style={{ marginTop: size * 0.1 }}>
          <PixelCharacter index={ch} scale={size / 22} />
        </span>
      </span>
    );
  }
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${color}, ${shade(color, -0.25)})`,
        boxShadow: ring ? `0 0 0 2px var(--panel), 0 0 0 4px ${ring}` : undefined,
      }}
      title={name}
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      {children && <div className="muted max-w-sm text-sm">{children}</div>}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
