import { describe, expect, it } from "vitest";
import { Crowd, type CrowdAgent } from "../src/crowd";
import { planOffice } from "../src/layout";

/** Deterministic random numbers so behaviour is repeatable. */
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function run(c: Crowd, seconds: number, from = 0, onTick?: () => void) {
  let t = from;
  for (let i = 0; i < seconds * 20; i++) {
    t += 0.05;
    c.update(0.05, t);
    onTick?.();
  }
  return t;
}

const team = (statuses: Record<string, CrowdAgent["status"]>, meet: Record<string, string> = {}): CrowdAgent[] =>
  Object.entries(statuses).map(([id, status]) => ({ id, status, meetWith: meet[id] }));

describe("3D office floor plan", () => {
  it("has a desk for everyone, never overlapping", () => {
    for (const n of [0, 1, 5, 6, 7, 14]) {
      const plan = planOffice(n);
      expect(plan.desks.length).toBeGreaterThanOrEqual(n);
      const keys = new Set(plan.desks.map((d) => `${d.x},${d.z}`));
      expect(keys.size).toBe(plan.desks.length);
    }
  });
});

describe("3D office crowd", () => {
  it("everyone starts seated at their own desk", () => {
    const c = new Crowd(seeded());
    c.setAgents(team({ a: "idle", b: "idle", c: "idle" }), 0);
    const desks = c.list().map((p) => p.desk);
    expect(new Set(desks).size).toBe(3);
    expect(c.list().every((p) => p.pose === "sit")).toBe(true);
  });

  it("a working agent stays at their desk typing; nobody strolls while working", () => {
    const c = new Crowd(seeded());
    c.setAgents(team({ a: "working", b: "idle" }), 0);
    let aWalked = false;
    let bWalked = false;
    run(c, 60, 0, () => {
      aWalked ||= c.get("a")!.pose === "walk";
      bWalked ||= c.get("b")!.pose === "walk";
    });
    expect(aWalked).toBe(false);
    expect(c.get("a")).toMatchObject({ pose: "sit", typing: true, place: { kind: "desk" } });
    expect(bWalked).toBe(true); // idle people do stroll
  });

  it("someone strolling goes straight back to their desk when work arrives", () => {
    const c = new Crowd(seeded());
    c.setAgents(team({ a: "idle" }), 0);
    let t = run(c, 30);
    c.setAgents(team({ a: "thinking" }), t);
    t = run(c, 30, t);
    const desk = c.plan.desks[c.get("a")!.desk]!.seat;
    expect(c.get("a")).toMatchObject({ pose: "sit", typing: true, x: desk.x, z: desk.z });
  });

  it("a meeting brings both people to neighbouring sofa seats, and they go back afterwards", () => {
    const c = new Crowd(seeded());
    c.setAgents(team({ writer: "idle", reviewer: "idle" }), 0);
    c.setAgents(team({ writer: "done", reviewer: "working" }, { writer: "reviewer", reviewer: "writer" }), 1);
    let t = run(c, 30, 1);
    const w = c.get("writer")!;
    const r = c.get("reviewer")!;
    expect(w.place.kind).toBe("lounge");
    expect(r.place.kind).toBe("lounge");
    expect(w.pose).toBe("sit");
    expect(r.pose).toBe("sit");
    expect(Math.hypot(w.x - r.x, w.z - r.z)).toBeLessThan(1.6);
    // review over: the reviewer gets more work, the writer is idle again
    c.setAgents(team({ writer: "idle", reviewer: "working" }), t);
    t = run(c, 30, t);
    expect(c.get("reviewer")).toMatchObject({ place: { kind: "desk" }, pose: "sit", typing: true });
  });

  it("finishing a step makes a short hop", () => {
    const c = new Crowd(seeded());
    c.setAgents(team({ a: "working" }), 0);
    c.setAgents(team({ a: "done" }), 5);
    expect(c.get("a")!.hopUntil).toBeGreaterThan(5);
  });

  it("grows the office when the team outgrows the desks", () => {
    const c = new Crowd(seeded());
    const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`p${i}`, "idle" as const]));
    c.setAgents(team(many), 0);
    expect(new Set(c.list().map((p) => p.desk)).size).toBe(11);
  });
});
