import { planOffice, route, type OfficePlan, type Point, type Seat } from "./layout";

/**
 * Who is where in the 3D office (pure logic, no Three.js). Same behaviour rules as the
 * 2D pixel office:
 *   thinking / working   → sits at their own desk, typing
 *   waiting-for-human    → sits at their own desk (the "Needs you" tag is drawn by the page)
 *   in a meeting         → both walk to the lounge sofa and sit together
 *   idle / done / failed → strolls, rests at their desk now and then
 *   becoming done        → a short hop
 * Nobody strolls while working, and nobody ever leaves the office.
 */

export type Status = "idle" | "thinking" | "working" | "waiting-for-human" | "done" | "failed";

export interface CrowdAgent {
  id: string;
  status: Status;
  meetWith?: string;
}

export type Pose = "sit" | "stand" | "walk";
type Place = { kind: "desk" } | { kind: "lounge"; seat: number } | { kind: "spot"; spot: number };

export interface Person {
  id: string;
  status: Status;
  desk: number;
  x: number;
  z: number;
  facing: number;
  pose: Pose;
  /** Typing at the keyboard (seated at own desk and working / thinking). */
  typing: boolean;
  /** Time (s) until which the person is hopping. */
  hopUntil: number;
  /** Where they're going (or are). */
  place: Place;
  path: Point[];
  laneZ: number;
  restUntil: number;
  meetWith?: string;
}

const SPEED = 1.9; // units per second
const active = (s: Status) => s === "thinking" || s === "working" || s === "waiting-for-human";

export class Crowd {
  plan: OfficePlan;
  private people = new Map<string, Person>();
  private order: string[] = [];

  constructor(private rand: () => number = Math.random) {
    this.plan = planOffice(0);
  }

  list(): Person[] {
    return this.order.map((id) => this.people.get(id)!);
  }

  get(id: string): Person | undefined {
    return this.people.get(id);
  }

  /** Apply the latest statuses (call on every state change). */
  setAgents(agents: CrowdAgent[], now: number) {
    const ids = new Set(agents.map((a) => a.id));
    for (const id of [...this.order]) {
      if (!ids.has(id)) {
        this.people.delete(id);
        this.order = this.order.filter((x) => x !== id);
      }
    }
    if (this.plan.desks.length < agents.length) this.plan = planOffice(agents.length);
    else if (this.order.length === 0) this.plan = planOffice(agents.length);
    for (const a of agents) {
      let p = this.people.get(a.id);
      if (!p) {
        const used = new Set([...this.people.values()].map((x) => x.desk));
        const desk = this.plan.desks.findIndex((_d, i) => !used.has(i));
        const seat = this.plan.desks[desk]!.seat;
        p = { id: a.id, status: a.status, desk, x: seat.x, z: seat.z, facing: seat.facing, pose: "sit", typing: false, hopUntil: 0, place: { kind: "desk" }, path: [], laneZ: seat.laneZ, restUntil: now + 2 + this.rand() * 6 };
        this.people.set(a.id, p);
        this.order.push(a.id);
      }
      if (a.status === "done" && p.status !== "done") p.hopUntil = now + 0.8;
      const wasMeeting = !!p.meetWith;
      p.status = a.status;
      p.meetWith = a.meetWith && ids.has(a.meetWith) ? a.meetWith : undefined;
      this.decide(p, now, wasMeeting);
    }
  }

  /** Where this person should be given their status; re-routes when that changes. */
  private decide(p: Person, now: number, wasMeeting: boolean) {
    if (p.meetWith) {
      if (p.place.kind !== "lounge") {
        const seat = this.freeLoungeSeat(p.meetWith);
        if (seat >= 0) this.goTo(p, { kind: "lounge", seat });
      }
    } else if (active(p.status)) {
      if (p.place.kind !== "desk") this.goTo(p, { kind: "desk" });
    } else if (wasMeeting && p.place.kind === "lounge") {
      // Meeting over: head back to the desk, then stroll as usual.
      this.goTo(p, { kind: "desk" });
      p.restUntil = now + 3 + this.rand() * 4;
    }
    p.typing = p.place.kind === "desk" && p.path.length === 0 && (p.status === "working" || p.status === "thinking");
  }

  private seatOf(p: Person, place: Place): Seat {
    if (place.kind === "desk") return this.plan.desks[p.desk]!.seat;
    if (place.kind === "lounge") return this.plan.loungeSeats[place.seat]!;
    return this.plan.strollSpots[place.spot]!;
  }

  private freeLoungeSeat(partner: string): number {
    const taken = new Set(this.list().flatMap((x) => (x.place.kind === "lounge" ? [x.place.seat] : [])));
    const mate = this.people.get(partner);
    const near = mate?.place.kind === "lounge" ? this.plan.loungeSeats[mate.place.seat] : undefined;
    let best = -1;
    let bestD = Infinity;
    this.plan.loungeSeats.forEach((s, i) => {
      if (taken.has(i)) return;
      const d = near ? Math.hypot(s.x - near.x, s.z - near.z) : i;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private goTo(p: Person, place: Place) {
    const to = this.seatOf(p, place);
    p.place = place;
    p.path = route({ x: p.x, z: p.z, laneZ: p.path.length ? p.z : p.laneZ }, to, this.plan.corridorX);
    p.laneZ = to.laneZ;
    p.pose = p.path.length ? "walk" : place.kind === "spot" ? "stand" : "sit";
    if (!p.path.length) p.facing = to.facing;
    p.typing = false;
  }

  /** Advance everyone by dt seconds (now = current time in seconds). */
  update(dt: number, now: number) {
    for (const p of this.people.values()) {
      if (p.path.length) {
        let step = SPEED * dt;
        while (step > 0 && p.path.length) {
          const t = p.path[0]!;
          const dx = t.x - p.x;
          const dz = t.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d > 1e-6) p.facing = Math.atan2(dx, -dz);
          if (d <= step) {
            p.x = t.x;
            p.z = t.z;
            p.path.shift();
            step -= d;
          } else {
            p.x += (dx / d) * step;
            p.z += (dz / d) * step;
            step = 0;
          }
        }
        if (!p.path.length) {
          const seat = this.seatOf(p, p.place);
          p.facing = seat.facing;
          p.pose = p.place.kind === "spot" ? "stand" : "sit";
          p.restUntil = now + (p.place.kind === "desk" ? 6 + this.rand() * 8 : 2 + this.rand() * 4);
          p.typing = p.place.kind === "desk" && (p.status === "working" || p.status === "thinking");
        }
        continue;
      }
      // Idle people stroll: rest a while, then go somewhere else (sometimes back to their desk).
      if (!active(p.status) && !p.meetWith && now >= p.restUntil) {
        const spots = this.plan.strollSpots.length;
        const goDesk = p.place.kind !== "desk" && this.rand() < 0.35;
        if (goDesk) this.goTo(p, { kind: "desk" });
        else {
          let spot = Math.floor(this.rand() * spots);
          if (p.place.kind === "spot" && p.place.spot === spot) spot = (spot + 1) % spots;
          this.goTo(p, { kind: "spot", spot });
        }
      }
    }
  }
}
