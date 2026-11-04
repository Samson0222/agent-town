# UX proposal: grouping and navigation (after Multica)

> **Update 2026-11-04:** the user wants **workspaces** and a **main agent** as the way in. That direction is described first. The Multica grouping below still applies *inside* a workspace.

## v2 direction: workspaces and a main agent (from the user's Socialix screenshots, design only)

### Decisions so far (user, 2026-11-04)
| Topic | Decision |
|---|---|
| Running plans | **Run plan** button, plus an **auto-run** switch that works only within the cost cap |
| Teams inside a workspace | **Several squads per workspace**, as in Multica (see below) |
| Main agent | **One per workspace**: built in, renamable, with its own model and runtime. It can't be deleted and sits above the squads. |
| Workflows | **Keep the name "Workflows"** (user's choice). They become saved plans the main agent can reuse (see below). |
| Office styles | **Later.** For now the creation step offers the existing 2D office and 3D town. |
| Hosted access | **Invite per workspace**, with a role per workspace. The owner sees everything. |

### Squads inside a workspace
- **Roster:** a workspace has a roster of agents from the shared library. **Squads** are named groups inside it, each with a **lead**, e.g. "Content squad: lead Creator, plus Copy editor", "Research squad".
- **Who the main agent can assign:** a plan step goes to either **one agent** or **a squad**. When a squad gets a step, its lead splits it among the squad's members. Underneath, this is a small plan of its own, run the same way, so the engine doesn't change.
- **In the office,** each squad gets its own desk cluster.
- **Build in two stages:**
  1. squads as groups the main agent can see and route to (it names agents, guided by the squads)
  2. squad leads planning their own part (nested plans)

### Workflows as saved plans
- **Save:** any finished plan can be saved as a workflow.
- **Reuse:** the main agent checks the workflows first ("use *Weekly report*"), and you can start one directly.
- **Edit:** a workflow opens in the step list, with the graph editor as an advanced option.
- **Later:** workflows are what Schedules will run.
- **Menu:** keep it under Work rather than Settings, because it's something you use, not a configuration.

### From the latest screenshots
- **Tasks tab:** a history of plans (#32 running, #31 done). Each shows a progress bar, its steps with agent and "after step 1 · revised", an expandable **main agent's report**, and **Cancel plan**.
- **Sub-agent History tab:** "Main agent assigned: …" with status and time.
- **Computer tab:** the agent's own browser or desktop. Ours starts as the live tool log. A real browser or desktop comes with the agent-desktop / browser connector, which follows the approval rules already planned (reference-review §8).

### The flow
1. **Workspaces** (the screenshots call them campaigns) replace the Start page. The first screen is the list of workspaces plus **New workspace**.
2. **New workspace** has three steps:
   1. name and goal
   2. **office style** (preview cards: 2D pixel office, 3D pixel town, more later)
   3. **team**: pick a template or build one from the Agents list
3. Inside a workspace, the sidebar has a **workspace switcher** at the top, then that workspace's menu:

   ```
   [Workspace ▾  Coffee launch]
   Overview        ← goal, team, recent results, spend, what needs you
   AI Agent        ← the main screen (below)
   Runs            ← past plans and runs
   Workflows       ← saved plans you can reuse
   Usage
   Settings        ← office style, team, defaults, people (when hosted)
   ```

   Shared resources (Agents library, Skills, Runtimes) stay global, in a small section or in Settings.

### The "AI Agent" screen (where users start)
Three columns:
- **left:** a strip of the team's avatars, with the main agent first
- **middle:** the selected agent's panel
- **right:** the live office

For the **main agent**, the panel has tabs:
- **Chat:** you say what you need in plain words. It replies with a plan ("Creator Agent writes 2 posts; Scheduler Agent schedules them after step 1"), the defaults it assumed, and what happens next. A bar above the input shows "Team is working on: … 1/2 done".
- **Tasks:** the current plan as steps, each with its agent, status (Running / Scheduled / Done) and "after step N". Pause or cancel the plan.
- **Computer:** live tool activity and logs, from our existing technical log.
- **Settings:** its instructions, model and runtime.

For a **sub-agent**:
- **Chat:** ask it questions. "Request work" sends the request through the main agent.
- **History:** what it was assigned and what it delivered.
- **Settings.**

### How the main agent fits our engine (no new engine)
1. **Plan:** the main agent is an ordinary agent with a runtime and model, plus a *planner* skill and instructions. Its answer must include a **plan** in a fixed format: steps with who / what / after which step / needs approval. We validate it, and steps can only name agents in the workspace's team.
2. **Turn the plan into a workflow:** it becomes a step-list workflow, using the `buildGraphFromSteps` we already have. Everything downstream is unchanged: events, office, approvals, cost caps, replay.
3. **Combine:** the last step always belongs to the main agent. It merges the sub-agents' outputs (our merge/synthesis node) and writes the answer back into the chat.
4. **Decide:** after the results, the main agent may propose a follow-up plan, for example "the draft failed review; redo step 2 with this note". That is a new plan in the same chat thread, each one a run.
5. **Run or ask first:** you see the plan and click **Run plan**. A workspace setting "run plans automatically" can skip the click, but only within its cost cap. Send and spend steps always ask.
6. **Free to try:** on the practice runtime the main agent produces a simple, predictable plan, so the whole flow can be tried without spending anything.
7. **Save:** a good plan can be saved as a **Workflow** and reused with one click.

### Data changes
- **Workspace** = today's **Team**, grown up: name, goal, office style, members, vault, defaults, the main agent, chat threads, runs, outside agents. Existing teams become workspaces automatically.
- **Chat threads** are stored like everything else: messages plus links to the runs they started.
- The agent library and skills stay shared between workspaces.


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
