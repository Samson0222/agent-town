"use client";
import { useEffect, useRef } from "react";
import type { AgentState, AgentTownEvent, RunStatus } from "@agent-town/core";

/**
 * Pixel office on a <canvas>. Desks come from the team in the current run.
 * What each agent shows is a pure function of its last status event; the
 * animation loop only animates *that* status (e.g. typing while "working"),
 * and freezes when the run is not running. Handoff envelopes fly only when
 * a real `message` event arrives.
 */

const COLS = 10;
const ROWS = 6;
const CELL = 64;
const W = COLS * CELL;
const H = ROWS * CELL;
const HANDOFF_MS = 1400;

export function deskOf(agent: AgentState, index: number): { x: number; y: number } {
  if (agent.desk) return { x: clamp(agent.desk.x, 0, COLS - 1), y: clamp(agent.desk.y, 0, ROWS - 2) };
  return { x: 1 + (index % 4) * 2, y: 1 + Math.floor(index / 4) * 2 };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function Office(props: {
  agents: AgentState[];
  events: AgentTownEvent[];
  runStatus: RunStatus;
  selectedAgent?: string | null;
  onSelectAgent?: (id: string | null) => void;
  live: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const flights = useRef<Array<{ from: string; to: string; start: number; kind: string }>>([]);
  const seenSeq = useRef<number>(-1);

  // Turn newly arrived message events into envelope flights.
  useEffect(() => {
    const evs = props.events;
    if (seenSeq.current < 0) {
      seenSeq.current = evs.at(-1)?.seq ?? 0; // don't replay history as animation on first load
      return;
    }
    if (!props.live) {
      seenSeq.current = evs.at(-1)?.seq ?? 0;
      return;
    }
    const now = performance.now();
    for (const ev of evs) {
      if (ev.seq <= seenSeq.current) continue;
      if (ev.type === "message" && ev.from && ev.to && ev.from !== ev.to) {
        flights.current.push({ from: ev.from, to: ev.to, start: now, kind: ev.kind });
      }
    }
    seenSeq.current = evs.at(-1)?.seq ?? seenSeq.current;
  }, [props.events, props.live]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    let frozenT = 0;

    const draw = (t: number) => {
      const { agents, runStatus, selectedAgent } = propsRef.current;
      const animating = runStatus === "running";
      if (animating) frozenT = t;
      const time = animating ? t : frozenT;
      drawFloor(ctx);
      const positions = new Map<string, { x: number; y: number }>();
      agents.forEach((a, i) => {
        const d = deskOf(a, i);
        positions.set(a.id, d);
        drawDesk(ctx, d.x, d.y, a, time, animating);
      });
      agents.forEach((a, i) => drawAgent(ctx, deskOf(a, i), a, time, animating, a.id === selectedAgent));

      // handoff envelopes
      flights.current = flights.current.filter((f) => t - f.start < HANDOFF_MS);
      for (const f of flights.current) {
        const p = positions.get(f.from);
        const q = positions.get(f.to);
        if (!p || !q) continue;
        const k = (t - f.start) / HANDOFF_MS;
        const x = (p.x + 0.5 + (q.x - p.x) * k) * CELL;
        const y = (p.y + 0.6 + (q.y - p.y) * k) * CELL - Math.sin(k * Math.PI) * 40;
        drawEnvelope(ctx, x, y, f.kind === "feedback" ? "#dc2626" : "#f59e0b");
      }

      if (runStatus === "paused") banner(ctx, "PAUSED", "#d97706");
      else if (runStatus === "stopped") banner(ctx, "STOPPED", "#6b7280");
      else if (runStatus === "failed") banner(ctx, "FAILED", "#dc2626");
      else if (runStatus === "completed") banner(ctx, "DONE", "#16a34a");
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const hit = props.agents.findIndex((a, i) => {
      const d = deskOf(a, i);
      return x >= d.x * CELL - 8 && x <= (d.x + 1) * CELL + 8 && y >= d.y * CELL - 30 && y <= (d.y + 2) * CELL;
    });
    props.onSelectAgent?.(hit >= 0 ? props.agents[hit]!.id : null);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      className="block w-full cursor-pointer rounded-md"
      style={{ aspectRatio: `${W} / ${H}`, imageRendering: "pixelated" }}
      aria-label="Office floor: click an agent to see their task, log and output"
    />
  );
}

// ---------------------------------------------------------------------------

function drawFloor(ctx: CanvasRenderingContext2D) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#d9c7a7" : "#e3d3b6";
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  // back wall
  ctx.fillStyle = "#8d6e63";
  ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = "#a1887f";
  for (let x = 0; x < W; x += 32) ctx.fillRect(x + 2, 4, 26, 12);
  // window + plant decorations
  ctx.fillStyle = "#9ad0ec";
  ctx.fillRect(W - 110, 3, 80, 16);
  ctx.fillStyle = "#4caf50";
  ctx.fillRect(10, H - 30, 14, 14);
  ctx.fillStyle = "#795548";
  ctx.fillRect(12, H - 18, 10, 12);
}

function drawDesk(ctx: CanvasRenderingContext2D, cx: number, cy: number, a: AgentState, t: number, animating: boolean) {
  const x = cx * CELL;
  const y = cy * CELL + 26;
  // desk
  ctx.fillStyle = "#6d4c41";
  ctx.fillRect(x - 4, y + 18, CELL + 8, 16);
  ctx.fillStyle = "#5d4037";
  ctx.fillRect(x - 4, y + 34, 6, 12);
  ctx.fillRect(x + CELL - 2, y + 34, 6, 12);
  // monitor
  ctx.fillStyle = "#263238";
  ctx.fillRect(x + 18, y - 6, 28, 22);
  ctx.fillRect(x + 29, y + 16, 6, 4);
  const on = a.status === "working" || a.status === "thinking";
  ctx.fillStyle = a.status === "failed" ? "#7f1d1d" : on ? "#64b5f6" : a.status === "done" ? "#a5d6a7" : "#37474f";
  ctx.fillRect(x + 20, y - 4, 24, 18);
  if (a.status === "working") {
    ctx.fillStyle = "#e3f2fd";
    const lines = animating ? Math.floor(t / 180) % 5 : 3;
    for (let i = 0; i < lines; i++) ctx.fillRect(x + 22, y - 2 + i * 3, 8 + ((i * 7) % 12), 2);
  }
}

function drawAgent(ctx: CanvasRenderingContext2D, d: { x: number; y: number }, a: AgentState, t: number, animating: boolean, selected: boolean) {
  const x = d.x * CELL + 20;
  const baseY = d.y * CELL + 26 + 38;
  const working = a.status === "working" && animating;
  const bob = working ? (Math.floor(t / 150) % 2) * 2 : 0;
  const gray = a.status === "failed";
  const body = gray ? "#9e9e9e" : a.color;

  if (selected) {
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x * CELL - 6, d.y * CELL + 2, CELL + 12, CELL + 58);
  }
  // chair
  ctx.fillStyle = "#455a64";
  ctx.fillRect(x - 2, baseY + 6, 28, 10);
  // body
  ctx.fillStyle = body;
  ctx.fillRect(x + 4, baseY - 8 + bob, 16, 16);
  // head
  ctx.fillStyle = gray ? "#bdbdbd" : "#f1c27d";
  ctx.fillRect(x + 6, baseY - 22 + bob, 12, 12);
  // hair / sprite variant
  ctx.fillStyle = "#3e2723";
  switch (a.sprite) {
    case "hat":
      ctx.fillStyle = body;
      ctx.fillRect(x + 4, baseY - 26 + bob, 16, 5);
      break;
    case "bun":
      ctx.fillRect(x + 6, baseY - 24 + bob, 12, 4);
      ctx.fillRect(x + 9, baseY - 28 + bob, 6, 4);
      break;
    case "bald":
      break;
    case "cap":
      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(x + 5, baseY - 24 + bob, 14, 4);
      ctx.fillRect(x + 17, baseY - 22 + bob, 5, 2);
      break;
    default:
      ctx.fillRect(x + 6, baseY - 24 + bob, 12, 4);
  }
  // arms (typing)
  ctx.fillStyle = body;
  const armUp = working && Math.floor(t / 120) % 2 === 0;
  ctx.fillRect(x, baseY - 6 + (armUp ? -2 : 0), 4, 8);
  ctx.fillRect(x + 20, baseY - 6 + (armUp ? 0 : -2), 4, 8);

  // name label
  ctx.font = "bold 10px ui-monospace, monospace";
  ctx.textAlign = "center";
  const label = a.name.length > 10 ? a.name.slice(0, 9) + "…" : a.name;
  const lw = ctx.measureText(label).width + 8;
  ctx.fillStyle = "rgba(0,0,0,.65)";
  ctx.fillRect(x + 12 - lw / 2, baseY + 18, lw, 13);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 12, baseY + 28);

  // status indicator
  const bx = x + 12;
  const by = baseY - 52; // above the monitor
  switch (a.status) {
    case "thinking": {
      const n = animating ? (Math.floor(t / 300) % 3) + 1 : 3;
      bubble(ctx, bx, by, ".".repeat(n).padEnd(3, " "), "#ffffff", "#374151");
      break;
    }
    case "waiting-for-human":
      bubble(ctx, bx, by - (animating ? Math.abs(Math.sin(t / 250)) * 4 : 0), "Waiting for you!", "#fde68a", "#92400e");
      break;
    case "done":
      bubble(ctx, bx, by, "✓", "#bbf7d0", "#166534");
      break;
    case "failed":
      bubble(ctx, bx, by, "✗ failed", "#fecaca", "#991b1b");
      break;
    case "working":
      if (a.message && /review/i.test(a.message)) bubble(ctx, bx, by, "reviewing", "#e9d5ff", "#6b21a8");
      break;
  }
}

function bubble(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, bg: string, fg: string) {
  ctx.font = "bold 10px ui-monospace, monospace";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = bg;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 1;
  ctx.fillRect(cx - w / 2, cy - 12, w, 15);
  ctx.strokeRect(cx - w / 2 + 0.5, cy - 11.5, w - 1, 14);
  ctx.fillRect(cx - 2, cy + 3, 4, 3);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.fillText(text, cx, cy - 1);
}

function drawEnvelope(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 8, y - 6, 16, 12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 8, y - 6, 16, 12);
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 6);
  ctx.lineTo(x, y + 1);
  ctx.lineTo(x + 8, y - 6);
  ctx.stroke();
}

function banner(ctx: CanvasRenderingContext2D, text: string, color: string) {
  ctx.font = "bold 12px ui-monospace, monospace";
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = color;
  ctx.fillRect(W - w - 8, H - 26, w, 18);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(text, W - w / 2 - 8, H - 13);
}
