import { createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";

/**
 * Cloudflare Access login check for the tunnel-only API port (see docs/hosting.md).
 *
 * Cloudflare Access puts a signed JWT in the `Cf-Access-Jwt-Assertion` header of every
 * request it lets through. We verify it ourselves (signature, issuer, audience, expiry),
 * so a misconfigured Cloudflare application can't open the app on its own.
 */

export type Role = "owner" | "operator" | "viewer";
export const ROLES: Role[] = ["owner", "operator", "viewer"];

export interface AccessConfig {
  /** e.g. "devsam.cloudflareaccess.com" (your Zero Trust team domain). */
  teamDomain: string;
  /** The Access application's audience (AUD) tag. */
  audience: string;
  /** Override for tests; defaults to fetching https://<teamDomain>/cdn-cgi/access/certs. */
  fetchKeys?: () => Promise<JsonWebKey[]>;
  now?: () => number;
}

export class AuthError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

const KEY_TTL_MS = 10 * 60 * 1000;

export class AccessVerifier {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;

  constructor(private cfg: AccessConfig) {
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(cfg.teamDomain)) throw new Error("teamDomain must look like <team>.cloudflareaccess.com");
    if (!cfg.audience) throw new Error("audience (AUD tag) is required");
  }

  private async loadKeys(force = false) {
    const now = Date.now();
    if (!force && this.keys.size && now - this.fetchedAt < KEY_TTL_MS) return;
    const jwks = this.cfg.fetchKeys
      ? await this.cfg.fetchKeys()
      : (((await (await fetch(`https://${this.cfg.teamDomain}/cdn-cgi/access/certs`)).json()) as { keys?: JsonWebKey[] }).keys ?? []);
    const next = new Map<string, KeyObject>();
    for (const jwk of jwks) {
      if (jwk.kty !== "RSA" || typeof jwk.kid !== "string") continue;
      next.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
    }
    this.keys = next;
    this.fetchedAt = now;
  }

  /**
   * Returns the verified, lower-cased email. Throws AuthError otherwise.
   * With `allowService`, a Cloudflare service-token login (no email) is accepted too and
   * returned as "service:<client id>" (used only for outside agents' reports).
   */
  async verify(token: string | undefined, opts: { allowService?: boolean } = {}): Promise<string> {
    if (!token) throw new AuthError("Not signed in");
    const parts = token.split(".");
    if (parts.length !== 3) throw new AuthError("Malformed login token");
    const [h, p, sig] = parts as [string, string, string];
    let header: { alg?: string; kid?: string };
    let payload: { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string; common_name?: string };
    try {
      header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
      payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    } catch {
      throw new AuthError("Malformed login token");
    }
    if (header.alg !== "RS256" || !header.kid) throw new AuthError("Unsupported login token");
    await this.loadKeys();
    let key = this.keys.get(header.kid);
    if (!key) {
      await this.loadKeys(true); // keys rotate: refetch once
      key = this.keys.get(header.kid);
    }
    if (!key) throw new AuthError("Unknown signing key");
    if (!verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(sig, "base64url"))) throw new AuthError("Bad signature");
    const now = Math.floor((this.cfg.now?.() ?? Date.now()) / 1000);
    if (payload.iss !== `https://${this.cfg.teamDomain}`) throw new AuthError("Wrong issuer");
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(this.cfg.audience)) throw new AuthError("Wrong audience");
    if (typeof payload.exp !== "number" || payload.exp < now - 30) throw new AuthError("Login expired");
    if (typeof payload.nbf === "number" && payload.nbf > now + 30) throw new AuthError("Login not valid yet");
    if (opts.allowService && !payload.email && typeof payload.common_name === "string" && payload.common_name) return `service:${payload.common_name}`;
    if (!payload.email || !/^[^@\s]+@[^@\s]+$/.test(payload.email)) throw new AuthError("No email in login");
    return payload.email.toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// What each role may do (docs/hosting.md → Roles)

/**
 * view  – read anything
 * edit  – create/edit agents, skills, teams, workflows
 * run   – start / pause / resume / stop / steer runs, answer write approvals
 * owner – people, invites, budgets, send/spend approvals
 */
export type Permission = "view" | "edit" | "run" | "owner";

const GRANTS: Record<Role, Permission[]> = {
  owner: ["view", "edit", "run", "owner"],
  operator: ["view", "edit", "run"],
  viewer: ["view"],
};

export function can(role: Role, need: Permission): boolean {
  return GRANTS[role].includes(need);
}

// ---------------------------------------------------------------------------
// Simple fixed-window rate limiter (per key)

export class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(private limit: number, private windowMs: number, private now: () => number = Date.now) {}

  allow(key: string): boolean {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t - h.start >= this.windowMs) {
      this.hits.set(key, { start: t, n: 1 });
      if (this.hits.size > 10_000) this.hits.clear();
      return true;
    }
    h.n++;
    return h.n <= this.limit;
  }
}
