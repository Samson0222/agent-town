# Hosted access (built; switching it on is your step: [hosting-setup.md](hosting-setup.md))

**Goal:** you and the people you invite can open Agent Town from anywhere at a public `https://` address. Nobody gets past the login. Agent Town, OpenCode and your model logins keep running on your Windows PC.

Decided 2026-11-04 (see discussion.md):
- **Where:** your PC plus a Cloudflare Tunnel
- **Who:** you (owner) plus people you invite, each with a role
- **Login:** Cloudflare Access, checked again by Agent Town itself

## How a request travels

```
 phone / laptop ──https──▶ Cloudflare edge
                           └─ Cloudflare Access: login (email code / Google), allowlist of emails
                               │ only logged-in, allowed people continue; a signed JWT is attached
                               ▼
                         Cloudflare Tunnel  (cloudflared on your PC makes an OUTBOUND connection;
                               │             no router ports are opened)
                               ▼
 your PC ── 127.0.0.1:3000  Next.js (production build)        ┐ both still bind to 127.0.0.1
          └ 127.0.0.1:4318  Agent Town API, "tunnel port":     │
                              JWT required on every request    ┘
            127.0.0.1:4317  Agent Town API, local port (your own browser on the PC; never routed)
            127.0.0.1:4096  OpenCode server (never routed, password protected)
```

Why two API ports: the tunnel connects from the PC itself, so a tunnelled request also arrives from `127.0.0.1`. "It comes from localhost" therefore can't mean "it's the owner". The tunnel only reaches the port that always demands a valid login.

## Layers of protection
1. **Cloudflare Access** (at the edge):
   - only emails on the allowlist can log in
   - unknown visitors never reach the PC
   - free for up to 50 users
2. **Agent Town checks the login again** on every request through the tunnel. It verifies the `Cf-Access-Jwt-Assertion` header:
   - the signature, against the team's public keys
   - the audience tag
   - the expiry

   This keeps the app safe if Cloudflare is ever misconfigured.
3. **Roles stored in Agent Town:**
   - the owner's email comes from configuration
   - everyone else must be invited in the app
   - a valid Cloudflare login that isn't invited gets "Ask the owner to invite you"
4. **Request hygiene:**
   - mutating requests must have the same Origin and a JSON body
   - request bodies are limited to 64 KB (4 KB for reports)
   - per-user rate limits
   - security headers (CSP, no framing)
5. **Audit trail:** every action is recorded as an event with who did it (`actor` email). This covers starting, stopping, approving, editing and inviting.
6. **Never exposed:** the OpenCode server, the local API port, credential files and the vault folder on disk.

## Roles

| | Owner (you) | Operator | Viewer |
|---|---|---|---|
| Watch the office, runs, outputs | ✅ | ✅ | ✅ |
| Create and edit agents, skills, teams, workflows | ✅ | ✅ | — |
| Start, pause, stop runs on the **practice runtime** | ✅ | ✅ | — |
| Start runs on a **real runtime** (spends credit) | ✅ | ✅ within a per-person daily budget set by you | — |
| Answer **write** approvals | ✅ | ✅ | — |
| Answer **send / spend** approvals | ✅ only | — | — |
| Runtimes, connectors, people and invites, budgets | ✅ only | — | — |

The roles live in Agent Town, not in Cloudflare. Cloudflare only decides who may log in.

## What you'll need to do (once)
- **Cloudflare:**
  - a free Cloudflare account and a domain you add to it (any cheap domain works)
  - in Zero Trust: create the Access application for `agents.<your-domain>` and allow your email plus your invitees
- **cloudflared:** install it on Windows and run it as a service.

I'll write a click-by-click guide, and a Node script that prints the exact config for your ports. The tunnel config routes `/api/*` to `127.0.0.1:4318` and everything else to `127.0.0.1:3000`.

## What we build
1. **Production mode:**
   - an `npm run hosted` Node script (Windows-friendly) that builds the web app and starts it plus both API ports
   - a same-origin `/api`, so no CORS is needed through the tunnel
2. **Auth on the tunnel port:**
   - JWT verification (Cloudflare's public keys, cached)
   - a `users` table (email, role, invited by, daily budget)
   - `GET /api/me`
3. **Permissions:**
   - every route checks the role table above
   - the web app hides what you can't do
   - approvals check the role on the server
4. **People page** (owner only): invite by email, change roles, remove people, set budgets.
5. **Actor on events:**
   - an optional `actor` field in the event model (additive, so old runs replay unchanged)
   - the activity feed shows "Approved by Sam"
6. **Tests:**
   - forged, expired and wrong-audience tokens are refused
   - an uninvited email is refused
   - each role can only do what the table allows
   - the local port can't be reached through the tunnel config
7. **Guide:** `docs/hosting-setup.md` with Windows steps and screenshots.

## Rule change
- **Before:** "Localhost only."
- **Now:** "Every port still binds to `127.0.0.1`. The only public way in is the Cloudflare Tunnel, behind Cloudflare Access, with Agent Town checking the login and the role again. OpenCode and the local port are never exposed."

`AGENTS.md` is updated to match. Going live (switching on the tunnel) is still your step to take.

## Risks you should know
- **Availability:** it's only online while your PC is on and awake.
- **Spending:** an invited operator can spend your credit up to the budget you set. Send and spend approvals stay yours.
- **Visibility:** outputs and logs are visible to everyone you invite. Per-team visibility can come later if you need it.
- **No penetration test:** the checks above are code-level, like the post's author says of theirs.
