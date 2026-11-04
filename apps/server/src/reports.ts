import { createHash, randomBytes } from "node:crypto";
import type { Reporter } from "./store";

/**
 * Outside agents reporting into the office (idea from @btcup99's office post; our code).
 * A bot sends `POST /api/report` with `Authorization: Bearer atb_…` and
 * `{ "status": "coding", "summary": "Fetching ETF flows", "with": "<other bot id>" }`.
 *
 * Privacy: reports are for task types only (no accounts, messages, amounts or
 * unpublished plans). Summaries are cleaned and cut to 80 characters.
 */

export const REPORT_STATUSES = ["coding", "terminal", "browsing", "reading", "thinking", "needs-you", "error", "idle", "done"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const SUMMARY_MAX = 80;
export const REPORT_MAX_BYTES = 4096;
/** No report for this long → shown as idle. */
export const STALE_MS = 30 * 60 * 1000;

export function newToken(): { token: string; hash: string } {
  const token = `atb_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Strip control and formatting characters, collapse whitespace, cut to 80 characters. */
export function cleanSummary(s: unknown): string {
  if (typeof s !== "string") return "";
  const flat = s
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, " ")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...flat].slice(0, SUMMARY_MAX).join("");
}

export interface ParsedReport {
  status: ReportStatus;
  summary: string;
  with?: string;
}

export function parseReport(body: unknown): ParsedReport {
  const b = (body ?? {}) as { status?: unknown; summary?: unknown; with?: unknown };
  if (typeof b.status !== "string" || !(REPORT_STATUSES as readonly string[]).includes(b.status)) {
    throw new Error(`status must be one of: ${REPORT_STATUSES.join(", ")}`);
  }
  const withId = typeof b.with === "string" && /^[a-z0-9-]{1,60}$/.test(b.with) ? b.with : undefined;
  return { status: b.status as ReportStatus, summary: cleanSummary(b.summary), with: withId };
}

/** How the office shows a report: an agent status plus a tool hint (so 2D and 3D pick the right look). */
export function officeLook(status: ReportStatus): { status: "idle" | "thinking" | "working" | "waiting-for-human" | "done" | "failed"; tool?: string } {
  switch (status) {
    case "coding":
      return { status: "working", tool: "write" };
    case "terminal":
      return { status: "working", tool: "shell" };
    case "browsing":
      return { status: "working", tool: "web" };
    case "reading":
      return { status: "working", tool: "read" };
    case "thinking":
      return { status: "thinking" };
    case "needs-you":
      return { status: "waiting-for-human" };
    case "error":
      return { status: "failed" };
    case "done":
      return { status: "done" };
    default:
      return { status: "idle" };
  }
}

/** What the office gets for an outside agent (never the token). Stale reports read as idle. */
export function presence(r: Reporter, now = Date.now()) {
  const fresh = r.reportedAt && now - Date.parse(r.reportedAt) < STALE_MS;
  const status = (fresh ? r.status : "idle") as ReportStatus;
  return {
    id: r.id,
    teamId: r.teamId,
    name: r.name,
    color: r.color,
    sprite: r.sprite,
    report: status,
    summary: fresh ? r.summary : undefined,
    with: fresh ? r.with : undefined,
    reportedAt: r.reportedAt,
    ...officeLook(status),
  };
}
