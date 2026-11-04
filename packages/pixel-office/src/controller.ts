/**
 * Agent Town's controller around the pixel-agents office engine.
 *
 * The engine (upstream, unchanged) owns seats, pathfinding, animation and drawing.
 * This controller is the boundary: it receives Agent Town's projected agent
 * states (from reduceRunState) and translates them into engine calls, using
 * pixel-agents' own behaviour rules:
 *
 *   thinking / working   → active: sits at its own desk, PC on, typing (or reading for read tools)
 *   waiting-for-human    → active + "…" bubble that stays until resolved (stays seated)
 *   done                 → inactive + ✓ bubble that fades; then strolls and rests at its desk
 *   idle / failed        → inactive: strolls the office, rests at its desk now and then
 *   meeting (meetWith)   → both walk to the lounge sofa and sit together until the meeting ends,
 *                          then return to their own desks
 *   done (transition)    → a short double hop
 *
 * Characters are never removed while their agent is on the team, so the office
 * always shows everyone. Strolling happens only while an agent is NOT working.
 */
import { startGameLoop } from "../upstream/webview-ui/src/office/engine/gameLoop";
import { OfficeState } from "../upstream/webview-ui/src/office/engine/officeState";
import { renderFrame, type SelectionRenderState } from "../upstream/webview-ui/src/office/engine/renderer";
import { setProviderCapabilities } from "../upstream/webview-ui/src/office/toolUtils";
import { TILE_SIZE, TileType } from "../upstream/webview-ui/src/office/types";
import { loadOfficeAssets } from "./loader";
import { ensureWorkSeats, workSeatIds } from "./desks";

export type OfficeAgentStatus = "idle" | "thinking" | "working" | "waiting-for-human" | "done" | "failed";

export interface OfficeAgent {
  id: string;
  name: string;
  status: OfficeAgentStatus;
  /** Tool in use (drives typing vs reading animation). */
  tool?: string;
  /** Which office character to use (0-based); otherwise picked from the id. */
  look?: number;
  /** Teammate this agent is meeting with (both get the same pair; see officeMeetings in core). */
  meetWith?: string;
}

const HOP_MS = 700;
const HOP_PX = 5;

export interface LabelPosition {
  id: string;
  /** CSS pixels relative to the canvas, at the top of the character's head. */
  x: number;
  y: number;
  seated: boolean;
}

// Tools that should look like reading rather than typing.
setProviderCapabilities({ readingTools: ["Read", "Grep", "Glob", "WebFetch", "WebSearch", "read", "search"], subagentToolNames: [] });

function isReadingTool(tool?: string): string | null {
  if (!tool) return null;
  return /read|search|grep|glob|fetch|web/i.test(tool) ? "Read" : "Write";
}

/** Stable small hash so each agent keeps the same look across reloads. */
function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export class PixelOffice {
  private state: OfficeState | null = null;
  private stop: (() => void) | null = null;
  private ids = new Map<string, number>();
  private last = new Map<string, string>();
  private offset = { x: 0, y: 0 };
  private zoom = 2;
  private pan = { x: 0, y: 0 };
  private nextId = 1;
  private pending: OfficeAgent[] = [];
  /** Each agent's own desk seat, and the lounge seat it's using during a meeting. */
  private home = new Map<string, string>();
  private meetingSeat = new Map<string, string>();
  private hops = new Map<number, number>();
  private observer: ResizeObserver | null = null;
  selectedId: string | null = null;
  ready: Promise<void>;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: { base?: string; onFrame?: () => void } = {},
  ) {
    this.ready = this.init();
  }

  private async init() {
    const { layout, characterCount } = await loadOfficeAssets(this.opts.base);
    if (!this.canvas.isConnected) return;
    this.state = new OfficeState(layout ?? undefined);
    this.characterCount = characterCount;
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas);
    this.stop = startGameLoop(this.canvas, {
      update: (dt) => this.state!.update(dt),
      render: (ctx) => {
        const st = this.state!;
        const layoutNow = st.getLayout();
        const sel: SelectionRenderState = {
          selectedAgentId: this.selectedId ? this.ids.get(this.selectedId) ?? null : null,
          hoveredAgentId: null,
          hoveredTile: null,
          seats: st.seats,
          characters: st.characters,
        };
        // Done hop: lift characters for a moment while drawing, then put them back.
        const now = performance.now();
        const lifted: Array<[{ y: number }, number]> = [];
        for (const [nid, start] of this.hops) {
          const t = (now - start) / HOP_MS;
          const ch = st.characters.get(nid);
          if (t >= 1 || !ch) {
            this.hops.delete(nid);
            continue;
          }
          const dy = Math.abs(Math.sin(t * Math.PI * 2)) * HOP_PX;
          ch.y -= dy;
          lifted.push([ch, dy]);
        }
        const { offsetX, offsetY } = renderFrame(
          ctx,
          this.canvas.width,
          this.canvas.height,
          st.tileMap,
          st.furniture,
          st.getCharacters(),
          this.zoom,
          this.pan.x,
          this.pan.y,
          sel,
          undefined,
          layoutNow.tileColors,
          layoutNow.cols,
          layoutNow.rows,
          layoutNow.carpetTiles,
          layoutNow.areas,
          layoutNow.areaTiles,
          false,
          null,
          st.pets,
        );
        for (const [ch, dy] of lifted) ch.y += dy;
        this.offset = { x: offsetX, y: offsetY };
        this.opts.onFrame?.();
      },
    });
    const queued = this.pending;
    this.pending = [];
    this.setAgents(queued);
  }

  private characterCount = 6;

  private resize() {
    if (!this.state) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const layout = this.state.getLayout();
    // Fit the *occupied* part of the layout (layouts often have empty void rows/cols).
    let c0 = layout.cols, c1 = -1, r0 = layout.rows, r1 = -1;
    layout.tiles.forEach((t, i) => {
      if (t === TileType.VOID) return;
      const c = i % layout.cols, r = Math.floor(i / layout.cols);
      c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    });
    if (c1 < 0) { c0 = 0; c1 = layout.cols - 1; r0 = 0; r1 = layout.rows - 1; }
    const top = Math.max(0, r0 - 1); // walls are drawn taller than one tile
    const wTiles = c1 - c0 + 1, hTiles = r1 - top + 1;
    const fit = Math.min(this.canvas.width / (wTiles * TILE_SIZE), this.canvas.height / (hTiles * TILE_SIZE));
    // Whole-number zoom keeps pixel art crisp when there is room (≥2×); otherwise use the
    // largest fractional zoom that fits so big offices don't shrink to 1×.
    this.zoom = fit >= 2 ? Math.floor(fit) : Math.max(0.5, Math.floor(fit * 4) / 4);
    const z = this.zoom, T = TILE_SIZE;
    // renderFrame centres the full grid; pan it so the occupied area is centred instead.
    this.pan = {
      x: Math.floor((this.canvas.width - wTiles * T * z) / 2) - c0 * T * z - Math.floor((this.canvas.width - layout.cols * T * z) / 2),
      y: Math.floor((this.canvas.height - hTiles * T * z) / 2) - top * T * z - Math.floor((this.canvas.height - layout.rows * T * z) / 2),
    };
  }

  /** Push the current agent list + statuses (call on every state change; only diffs are applied). */
  setAgents(agents: OfficeAgent[]) {
    const st = this.state;
    if (!st) {
      this.pending = agents;
      return;
    }
    // Everyone gets a desk: grow the office first if the team outgrew the work seats.
    if (workSeatIds(st.getLayout()).length < agents.length) {
      st.rebuildFromLayout(ensureWorkSeats(st.getLayout(), agents.length));
      for (const [sid, nid] of this.ids) {
        const seatId = st.characters.get(nid)?.seatId;
        if (seatId && !this.meetingSeat.has(sid)) this.home.set(sid, seatId);
      }
      this.resize();
    }
    const present = new Set(agents.map((a) => a.id));
    for (const [sid, nid] of [...this.ids]) {
      if (!present.has(sid)) {
        st.removeAgent(nid);
        this.ids.delete(sid);
        this.last.delete(sid);
        this.home.delete(sid);
        this.meetingSeat.delete(sid);
      }
    }
    for (const a of agents) {
      let nid = this.ids.get(a.id);
      if (nid === undefined) {
        nid = this.nextId++;
        this.ids.set(a.id, nid);
        const h = hash(a.id);
        // Prefer a free seat at a work desk (not the lounge sofa).
        const reserved = new Set(this.home.values());
        const seat = workSeatIds(st.getLayout()).find((sid) => !st.seats.get(sid)?.assigned && !reserved.has(sid));
        // skipSpawnEffect: agents are simply "in the office", not materialising.
        const palette = a.look !== undefined ? a.look % Math.max(1, this.characterCount) : h % Math.max(1, this.characterCount);
        st.addAgent(nid, palette, a.look !== undefined ? 0 : (h >> 3) % 360, seat, true);
        const homeSeat = st.characters.get(nid)?.seatId;
        if (homeSeat) this.home.set(a.id, homeSeat);
      }
      const meeting = this.updateMeeting(a, nid, present);
      const key = `${a.status}|${a.tool ?? ""}|${meeting ? a.meetWith : ""}`;
      if (this.last.get(a.id) === key) continue;
      const prev = this.last.get(a.id)?.split("|")[0];
      this.last.set(a.id, key);
      const working = a.status === "thinking" || a.status === "working";
      const waiting = a.status === "waiting-for-human";
      // In a meeting both people stay seated at the sofa (active), even the one whose work is being reviewed.
      st.setAgentActive(nid, working || waiting || meeting);
      st.setAgentTool(nid, working && a.status === "working" && !meeting ? isReadingTool(a.tool) : null);
      if (meeting) {
        // setAgentActive(false→true) doesn't move anyone; make sure they head for the meeting seat.
        const seatId = this.meetingSeat.get(a.id);
        const ch = st.characters.get(nid);
        if (seatId && ch && ch.seatId === seatId && ch.path.length === 0) st.sendToSeat(nid);
      }
      if (waiting) st.showPermissionBubble(nid);
      else st.clearPermissionBubble(nid);
      if (a.status === "done" && prev && prev !== "done") {
        st.showWaitingBubble(nid);
        this.hops.set(nid, performance.now());
      }
    }
  }

  /**
   * Move an agent to a lounge seat next to its meeting partner, or back to its own
   * desk when the meeting is over. Returns whether the agent is in a meeting now.
   */
  private updateMeeting(a: OfficeAgent, nid: number, present: Set<string>): boolean {
    const st = this.state!;
    const want = !!a.meetWith && present.has(a.meetWith);
    const current = this.meetingSeat.get(a.id);
    if (want && !current) {
      const seat = this.loungeSeatNear(this.meetingSeat.get(a.meetWith!));
      if (!seat) return false; // lounge full: stay at the desk
      st.reassignSeat(nid, seat);
      if (st.characters.get(nid)?.seatId !== seat) return false;
      this.meetingSeat.set(a.id, seat);
      return true;
    }
    if (!want && current) {
      this.meetingSeat.delete(a.id);
      const home = this.home.get(a.id);
      if (home) {
        // Stop first (inactive clears the path), then walk home.
        const working = a.status === "thinking" || a.status === "working" || a.status === "waiting-for-human";
        st.setAgentActive(nid, working);
        st.reassignSeat(nid, home);
      }
      this.last.delete(a.id);
      return false;
    }
    return want;
  }

  /** A free lounge (non-desk) seat, preferring the one closest to `near`. */
  private loungeSeatNear(near?: string): string | null {
    const st = this.state!;
    const work = new Set(workSeatIds(st.getLayout()));
    const anchor = near ? st.seats.get(near) : undefined;
    let best: string | null = null;
    let bestD = Infinity;
    for (const [id, seat] of st.seats) {
      if (work.has(id) || seat.assigned) continue;
      const d = anchor ? Math.abs(seat.seatCol - anchor.seatCol) + Math.abs(seat.seatRow - anchor.seatRow) : seat.seatRow * 100 + seat.seatCol;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  /** Agent id under a click (client coords), if any. */
  agentAt(clientX: number, clientY: number): string | null {
    if (!this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const wx = ((clientX - rect.left) * dpr - this.offset.x) / this.zoom;
    const wy = ((clientY - rect.top) * dpr - this.offset.y) / this.zoom;
    const hit = this.state.getCharacterAt(wx, wy);
    if (hit === null) return null;
    for (const [sid, nid] of this.ids) if (nid === hit) return sid;
    return null;
  }

  /** Where to draw HTML name tags (CSS px). */
  labelPositions(): LabelPosition[] {
    if (!this.state) return [];
    const dpr = window.devicePixelRatio || 1;
    const out: LabelPosition[] = [];
    for (const [sid, nid] of this.ids) {
      const ch = this.state.characters.get(nid);
      if (!ch) continue;
      out.push({
        id: sid,
        x: (this.offset.x + ch.x * this.zoom) / dpr,
        y: (this.offset.y + (ch.y - 30) * this.zoom) / dpr,
        seated: ch.state === "type",
      });
    }
    return out;
  }

  destroy() {
    this.stop?.();
    this.observer?.disconnect();
    this.state = null;
  }
}
