# UX proposal: grouping and navigation (after Multica)

Status: **proposal for discussion**, nothing built. Reference: multica-ai/multica at `16ce2df` (2026-11-04), design only, no code (see reference-review.md §7).

## How Multica groups things

The left **rail** holds a few **spaces**. Each space opens a **panel** of grouped sections:

| Space | What's in its panel |
|---|---|
| **Inbox** | Only the moments an agent needs a human (a decision, a blocker, a review), with an unread badge. Not every step. |
| **Work** | My agents' work · All issues · Unread · saved Views · Projects |
| **Team** | **Needs attention** (agents that are stuck) · **Working now** (who is busy) · Agents (all / mine) · Squads & members · **Resources**: Skills, Runtimes, Usage |
| **Chat** | Ask the workspace something, or start work without filing anything |
| **Autopilots** | Recurring work on a schedule, started from templates |
| **Settings** | Workspace, members and roles, integrations |

Global actions sit above the spaces: **New issue** and **Search**.

Patterns worth copying:
1. **A few spaces instead of a flat list.** The sidebar answers "what do I want to do?" (see what needs me, follow the work, manage the team), not "which table do I want?".
2. **An inbox for human decisions only**, so you never have to open each run to find out what's waiting for you.
3. **Live sections at the top of the panels** ("Needs attention", "Working now"), so a panel doubles as a status board.
4. **Resources grouped together:** skills, runtimes and usage are things the team *uses*, not places where work happens.
5. **Admin goes in Settings:** members, roles and integrations stay out of the daily navigation.
6. **One create button** for the main object, usable from anywhere.

## Our app today

Sidebar (flat, 8 items): Office · Start · Runs · Agents · Skills · Teams · Workflows · People.

What gets in the way:
- **"What needs me?" has no home.** Approvals live only inside each run's page. With two runs going you have to open each one. Outside agents that report "needs you" only show in the office.
- **Work is split three ways.** Start (launch), Runs (history) and Office (live) are separate items. Workflows (the recipes) is far from them.
- **Team things are scattered:** Agents, Teams, and Outside agents (hidden at the bottom of a team page).
- **Resources are mixed in:** Skills sits next to Agents. There's no page for runtimes, which are set in environment variables and invisible, and none for cost, which we record per step but only show inside a run.
- **People sits with daily items,** though it's an owner setting used rarely.

## Proposed structure

```
 [+ New run]                      ← one button, everywhere (was the Start page)

 Inbox  (3)                       ← approvals from every run, failed runs, outside agents saying "needs you"
 Office                           ← home: the live office (2D / 3D)

 WORK
   Runs                           ← Needs you · Running · Finished
   Workflows                      ← the recipes
   (Schedules)                    ← later: run a workflow on a timer (Multica's Autopilot)

 TEAM
   Agents                         ← Needs attention · Working now · All
   Teams                          ← who works together (Multica's Squads)
   Outside agents                 ← all of them in one list (moved from the team pages)

 RESOURCES
   Skills
   Runtimes                       ← new, read-only: what's connected (Mock, OpenCode…), online or not, models
   Usage                          ← new: cost and tokens per day, agent, workflow and runtime

 Settings                         ← People & roles, Hosted access status, preferences
```

### Page by page
| Today | Proposal | Why |
|---|---|---|
| Start page | **New run** button in the sidebar, opening the same goal-first form as a pop-up. Also opens from a workflow's page and from the Office ("Give them work"). | Starting work is an action, not a place |
| (none) | **Inbox**: one list of everything waiting for you, approve or reject inline, with a count badge in the sidebar | The biggest gap |
| Runs list | Grouped **Needs you / Running / Finished**, with filters by team and workflow | Matches how you scan it |
| Agents list | Live sections at the top: **Needs attention** (failed, waiting) and **Working now**, then all agents | Turns the list into a status board |
| Outside agents on each team page | Their own page under Team, filterable by team (the team page links to it) | Easier to find |
| (none) | **Runtimes**: read-only list of connected runtimes, whether each is online, its models, its spend, and how to connect one (OpenCode steps) | Runtimes are invisible today |
| Cost inside each run | **Usage**: totals per day, agent, workflow and runtime, from the `step_runs` table we already keep | Cost across runs |
| People | **Settings → People**, next to Hosted access (shows whether the tunnel port is on and the public address) | Admin out of the daily menu |

### What we keep that's ours
- **The Office stays the home page.** Multica is a board; we're an office you watch.
- **A run is our unit of work.** No issue tracker or projects. Workflows play the role of Multica's templates and autopilots.
- **Phones:** the same groups appear in the mobile menu, with the Inbox badge visible.

## Suggested order
1. Sidebar groups, the **New run** button, and moving People into Settings. Small change, immediate clarity.
2. **Inbox**, plus grouping on the Runs list.
3. Live sections on the Agents list, and the Outside agents page.
4. **Runtimes** and **Usage** pages.
5. Later: Schedules, and search (Ctrl+K).

## Questions for you
1. **Structure:** keep this grouping as proposed, or keep a flat list?
2. **Start page:** retire it in favour of a **New run** pop-up, or keep it as a page as well?
3. **Inbox:** only things that need you, as in Multica, or also "run finished" and "run failed" notices?
4. **Schedules:** do you want this later, e.g. "every Monday 9am, run the weekly report"? It would start real runs on a timer, so it would follow the same spending rules.
5. **Naming:** keep "Teams", or call them "Squads" like Multica? I'd keep "Teams".
