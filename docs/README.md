# Agent Town docs

Where we record plans, progress, and discussion points.

| File | What it's for |
|---|---|
| [progress-tracker.md](progress-tracker.md) | **Start here when you resume.** Current phase, done / in progress / next, open questions, session notes. |
| [brief-v0.3.md](brief-v0.3.md) | The product brief (v0.3) this build follows. Read-only reference. |
| [plan.md](plan.md) | Milestone plan with a per-item checklist mapped to the brief. |
| [architecture.md](architecture.md) | How the system is built: layers, contracts, event model, engine semantics, architecture decisions. |
| [workflow-schema-v1.md](workflow-schema-v1.md) | Reference for the workflow JSON (v1), the single source of truth for a workflow. |
| [milestone-0-opencode.md](milestone-0-opencode.md) | How to run the OpenCode verification on your machine and what to send back. |
| [hosting.md](hosting.md) | Design of public, login-only access (Cloudflare Tunnel + Access, roles). |
| [hosting-setup.md](hosting-setup.md) | Step-by-step Windows setup for agents.devsam.my. |
| [ux-proposal.md](ux-proposal.md) | Proposed navigation and grouping after Multica (for discussion). |
| [reference-review.md](reference-review.md) | What we reuse from each reference project in the brief, licenses, and recommendations. |
| [discussion.md](discussion.md) | Decision log and open discussion points, newest first. |

Conventions:
- Update `progress-tracker.md` whenever the phase, the active feature, or the implementation state changes.
- Add a dated entry to `discussion.md` for every decision taken in conversation.
- Architecture decisions that change the data model or a contract go in `architecture.md` → *Decisions*.
