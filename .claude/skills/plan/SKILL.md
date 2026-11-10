---
name: plan
description: How to plan before building, in the agent-decided planning flow — start the plan record, find out everything you can yourself, ask the rest in numbered rounds with a recommended answer each, fill the fixed-order BUILDER_PLAN.md template, present it with a change summary, and revise it by editing in place so earlier changes survive. Load it the moment you decide to plan (you called start_plan, the user started a new plan, or asked for a plan). For a new product or a customer/business solution, read its solution guide (`solution/solution.md`) for the discovery depth; when the plan has agents or automations, load `agentic-apps` and `agent-builder` and read the agent guide (`agents/agents.md`) for how to write each agent into the plan.
user-invocable: false
---

# Planning

You decided to plan instead of building straight away. The plan is a document the user reviews,
revises and accepts; nothing you change in the app ships while it is open. This skill is the
method. The platform instructions name the tools (`start_plan`, `present_plan`, `approve_plan`,
`discard_plan`, `ask_user_question`).

## Guides in this skill

This file is the method every plan follows. Focused guides live in sub-folders of this skill; read
the ones the request needs, at the step that names them.

| Guide                  | Read it when                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `solution/solution.md` | The plan has `depth: "discovery"`: a new product, or a solution for a customer or business.                                  |
| `agents/agents.md`     | The plan has an agent or an automation, at either depth: how to write each one into the plan, after loading `agent-builder`. |

## 1. Start

- Call `start_plan` once, with `depth: "discovery"` for a new product or a customer/business
  solution (discovery material in the message, "this is for a client", "plan what this company
  needs"), else `depth: "plan"`. It writes the BUILDER_PLAN.md template; you edit that file.
- Discovery depth: read `solution/solution.md` in this skill now and follow its interview before
  you design. It adds the Opportunity map and Customer & scope sections at the top of the template.
- Every plan: read `.claude/skills/app-purpose/SKILL.md` and the guide for the app's purpose (`demo.md` or
  `production.md`) in full before your first round. Take the purpose from `memories/STORY.md`, or
  decide it from the request (ask it in your first round only when the request leaves it unclear).
  The guide's must-haves are sections and rules this plan has to contain.

## 2. Find out before you ask

Never ask the user something you can find out. In this order:

- Attachments are under `user-files/`. Read them. For spreadsheets, exports or long documents,
  write a short script in `/vercel/sandbox/scratch` (never inside the workspace) and run it:
  row counts, distinct values, date ranges, column names, the shape of the data.
- The app itself: the describe tools, the routes under `src/routes/`, the artifacts, the data
  tools for live records. Say in the plan what already exists and what the plan reuses.
- The platform skills (`app-artifacts`, `pages-and-routing`, `agent-builder`, and the rest):
  consult them for how a thing is built here, not the user.

## 3. Ask in rounds

When the plan has agents, load `agentic-apps` (how many agents, and the agent card each one
needs) and `agent-builder` before your first round, at either depth: the card's fields you cannot
state yourself (the stages above all) and `agent-builder`'s discovery questions (the user's real
examples with their right outcome, what a great result looks like, what the agent must never do and
who takes over) ride in these rounds. Then read `agents/agents.md` in this skill for how to write
the agents into the plan.

Map the decisions as a tree: each answer unblocks the questions that hang off it. Ask the
whole current frontier in one `ask_user_question` call, numbered, in the order that most
changes the design. For every question:

- give 2–4 concrete options with a one-line description each;
- put your recommended option FIRST and label it "(Recommended)";
- word the question so accepting the recommendation is the easy path.

About three rounds for a plan and six for discovery is usually enough; you decide. Discovery has
a floor: never present a discovery plan before the rounds its guide requires (the pains round, the
Opportunity-map confirmation round, then the workflow rounds), unless the user says to skip the
questions. Past that floor, stop asking when the remaining unknowns do not change what you would build — they go to Open questions,
each tagged with who answers it. "I don't know" ends that thread, not the interview.

## 4. Write the plan

Edit BUILDER_PLAN.md in place. Keep the fixed sections in their order; delete one only if it is
truly empty (Agents & workflows in an app with no agents). When a change needs a section the
template lacks — What stays the same, Migration, Risks — add it after Open questions, never
between the fixed ones, so revision diffs still line up. Replace the title line.

- **Understanding** — three labeled paragraphs: `**You said:**` the goal, who it is for,
  constraints and success criteria, in the user's own words where they gave them;
  `**I assumed:**` what you filled in yourself; `**Success:**` what done looks like. This is the
  part the user corrects first; make it easy to correct.
- **Decisions** — one bullet per decision, with the alternative you rejected and why. For a new
  app or solution, the first bullet is the app purpose (`app-purpose` skill).
- **Data** — every table, view, relationship and status the build creates or changes: a
  `| Table | Fields |` table with one row per table (a field's options or statuses in
  parentheses after it), a `| View | Shows |` table for the views, and the relationships in the
  erDiagram. Notes such as access rules go as prose under the tables.
- **Pages & UI** — the first bullet is the **Design brief**: the app's interface identity, as a
  branding studio presents it to a client before anything is built. Delete it when the change
  touches no UI or keeps an existing app's look (`memories/DESIGN.md`). After it, the
  routes as the template's hint says: an agent's mini-app is one bullet, its work board and item
  deep dive, and its work items are on no other page for the same people (`agentic-apps`).
  - A real brand's values are read from its website. Run
    `node .claude/skills/plan/brand-scan.mjs <site>`; when it ends with `blocked`, call
    `read_brand` with the site instead. From either, the ground is the main surface, the accent
    the logo's colours or the read's `accents` (a brand with neither keeps its ink as the
    accent), and a Google Fonts family stands in for each brand face.
  - With no brand of its own, the app is the brand: its name (as the user calls it, else the
    plan's title) goes in the Brand row, Logo is left out, and you design its palette, type,
    shape, voice and feel for this app and its users, from what 3–5 leaders in the category
    share and the one norm you break. Left to habit, sibling apps come out looking alike, so list
    three options for each open choice (ground, accent hue, type pairing) and take the ones
    `start_plan`'s result picks.
  - A Palette role says how the identity uses the colour (ground, ink, the one accent), never a
    status: the build derives those.
  - Reread the brief with another company's name: if it would fit them, it describes a category,
    not this client, so rewrite it. The brand is the client's own, and the brief speaks of it
    that way.
  - Ask about the look at most once, inside an existing round, for what research cannot settle:
    the website when the request names a company without one, the logo file, brand colours
    and fonts when the site can't be read.

- **Agents & workflows** — only with agents or automations (for anything time-based, say whether it is built now or scheduled by the running app — see the `runtime-schedules` skill): one bullet per agent, then one per automation.
  Each agent bullet carries its agent card (`agentic-apps`) and its other fields as labeled
  sub-bullets. The exact shape and the field list are in `agents/agents.md`; an agent written
  without it is built on guesses.
- **Build order** — a short numbered list of what ships first.
- **Open questions** — only what the user could not answer, tagged with who answers it.

Length is not thoroughness: the decisions, the data model and the build order, not a
restatement of the request and not a preview of the code. Tables where the content is tabular.

The plan card draws each section as cards and lists; one level of sub-bullets under an item is
drawn inside its card, so use sub-bullets where a decision, page, step or agent needs detail.
Labeled sub-bullets (`**Tools:** …`) are drawn as the card's spec rows. A `###` heading, a table
inside a list section or a third level of bullets turns the whole section into a plain document;
in Agents & workflows that loses the agent cards, so keep its shape.

### Diagrams

A diagram earns its place where the content is a shape — entities and their links, a flow
with branches, a hand-off between people and agents — and a table or bullets would make the
reader rebuild it in their head. Write each one as a fenced `mermaid` block; the plan card draws it.

| Section            | Diagram                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Data               | `erDiagram` of the tables and their relationships, beside the field table                                                         |
| Agents & workflows | `flowchart` of each automation's trigger, steps and exceptions; `sequenceDiagram` when people and agents hand work back and forth |
| Pages & UI         | `flowchart` of how the user moves between pages, when there are three or more                                                     |
| Opportunity map    | the customer's process today, then the process with agents: two short `flowchart LR` diagrams (discovery)                         |

- One idea per diagram, about 15 nodes at most; split a bigger one by area.
- Shape it for a page about 700px wide: `flowchart LR` for a chain of up to five steps,
  `flowchart TD` for anything longer or branching. Today vs with agents is two diagrams, each a
  short `flowchart LR`, not two subgraphs in one.
- Quote every label that has spaces or punctuation: `A["Quick add (title)"]`, `B{"Due today?"}`.
- Plain structure only: nodes, edges, edge labels, subgraphs. The card styles them.
- A diagram sits beside the table or bullets that carry the detail; it shows the shape, the
  text keeps the facts.

`present_plan` parses every diagram and refuses the plan when one will not render, naming the
diagram and the line. Fix it and present again; a diagram that still will not parse becomes a table.

## 5. Present

Call `present_plan` with a `change_summary`. On the first revision it is "Initial plan." On
later ones it lists what changed since the previous revision, and it MUST name everything you
removed. The result ends your turn: reply with one line pointing to the plan card, and stop.
Do not build.

## 6. Revise

The user comes back with Accept, a change request, or a question.

- A change request arrives with the current plan already in BUILDER_PLAN.md and in your
  context as "Open plan". Apply the request as EDITS to that file. Never regenerate the plan
  from memory; never drop content they did not ask you to drop. If a change conflicts with an
  earlier decision, say so in the change summary and keep the user's latest instruction.
- **"Generic", "bland", "do better" about the look asks for a different idea:** one or two big
  changes to the Design brief (its direction, type or colour story), the same length, and the
  change summary says why.
- A question gets an answer. Do not present a new revision unless something changed.
- "ok, build it" / "approved" in their message: call `approve_plan` with the latest revision
  number, then build it in this turn. Never approve on your own judgment.
- "forget the plan" / "just do X instead": call `discard_plan`, then do X. Never discard on
  your own judgment.

## 7. After approval

Build the approved revision as written. Where the build has to deviate, say so in your reply.
Memories you wrote under `memories/` during planning were kept; use them.
