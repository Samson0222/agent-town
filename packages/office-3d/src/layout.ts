/**
 * Floor plan for the 3D office (pure, no Three.js). Units are metres-ish; y is up.
 *
 *   x →                      corridor
 *   ┌───────────────────────┬──┬────────────────┐  z
 *   │ desk desk desk         │  │   lounge        │  ↓
 *   │  ▢    ▢    ▢  (chairs) │  │  sofa ▭ table   │
 *   │ desk desk desk         │  │   (meetings)    │
 *   │  ▢    ▢    ▢           │  │                 │
 *   └───────────────────────┴──┴────────────────┘
 *
 * Every agent owns a desk; rows are added as the team grows. People walk along
 * the lane behind their row of chairs, then along the corridor (no pathfinding needed).
 */

export interface Point {
  x: number;
  z: number;
}

export interface Seat extends Point {
  /** Direction the person faces: radians, 0 = towards -z (north), π/2 = towards +x (east). */
  facing: number;
  /** z of the walking lane this seat is reached from. */
  laneZ: number;
}

export interface Desk extends Point {
  seat: Seat;
}

export interface OfficePlan {
  desks: Desk[];
  loungeSeats: Seat[];
  coffeeTable: Point;
  /** Spots idle people stroll to. */
  strollSpots: Seat[];
  corridorX: number;
  /** Floor bounds. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const DESKS_PER_ROW = 3;
const DESK_DX = 2.4;
const ROW_DZ = 3.2;
const CHAIR_DZ = 0.8;
const LANE_DZ = 1.6;

export function planOffice(people: number): OfficePlan {
  const rows = Math.max(2, Math.ceil(Math.max(1, people) / DESKS_PER_ROW));
  const desks: Desk[] = [];
  for (let i = 0; i < rows * DESKS_PER_ROW; i++) {
    const col = i % DESKS_PER_ROW;
    const row = Math.floor(i / DESKS_PER_ROW);
    const x = col * DESK_DX;
    const z = row * ROW_DZ;
    // People sit north of their desk facing south, so the camera sees their faces, not chair backs.
    desks.push({ x, z, seat: { x, z: z - CHAIR_DZ, facing: Math.PI, laneZ: z - LANE_DZ } });
  }
  const corridorX = (DESKS_PER_ROW - 1) * DESK_DX + 2;
  const loungeX = corridorX + 3.2;
  const loungeZ = 1.4;
  const coffeeTable = { x: loungeX, z: loungeZ };
  // Sofa seats around the coffee table. Everyone reaches them from the open floor south of
  // the lounge, so walking paths never cut through the sofas or the table.
  const loungeLane = loungeZ + 2.1;
  const loungeSeats: Seat[] = [
    { x: loungeX - 0.7, z: loungeZ + 1.1, facing: 0, laneZ: loungeLane },
    { x: loungeX, z: loungeZ + 1.1, facing: 0, laneZ: loungeLane },
    { x: loungeX + 0.7, z: loungeZ + 1.1, facing: 0, laneZ: loungeLane },
    { x: loungeX - 1.5, z: loungeZ + 0.1, facing: Math.PI / 2, laneZ: loungeLane },
    { x: loungeX - 1.5, z: loungeZ - 0.6, facing: Math.PI / 2, laneZ: loungeLane },
    { x: loungeX + 1.5, z: loungeZ + 0.1, facing: -Math.PI / 2, laneZ: loungeLane },
    { x: loungeX + 1.5, z: loungeZ - 0.6, facing: -Math.PI / 2, laneZ: loungeLane },
  ];
  const maxZ = Math.max((rows - 1) * ROW_DZ + 1.4, loungeLane + 2.2);
  const spot = (x: number, z: number, facing: number): Seat => ({ x, z, facing, laneZ: z });
  const strollSpots: Seat[] = [
    spot(loungeX - 1.2, loungeLane + 0.9, Math.PI),
    spot(loungeX + 1.4, loungeLane + 1.1, Math.PI / 2),
    spot(corridorX + 0.6, -1.0, 0),
    spot(corridorX + 0.4, maxZ - 0.7, Math.PI),
    spot(loungeX + 0.2, loungeLane + 1.4, Math.PI),
  ];
  return { desks, loungeSeats, coffeeTable, strollSpots, corridorX, minX: -1.6, maxX: loungeX + 2.6, minZ: -2.5, maxZ };
}

/**
 * Waypoints from where someone is to a seat or spot: out to their lane, along it to the
 * corridor, along the corridor to the target's lane, then in to the target.
 */
export function route(from: Point & { laneZ: number }, to: Seat, corridorX: number): Point[] {
  const pts: Point[] = [
    { x: from.x, z: from.laneZ },
    { x: corridorX, z: from.laneZ },
    { x: corridorX, z: to.laneZ },
    { x: to.x, z: to.laneZ },
    { x: to.x, z: to.z },
  ];
  const out: Point[] = [];
  let prev: Point = from;
  for (const p of pts) {
    if (Math.hypot(p.x - prev.x, p.z - prev.z) > 0.01) out.push(p);
    prev = p;
  }
  return out;
}
