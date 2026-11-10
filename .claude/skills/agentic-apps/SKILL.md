---
name: agentic-apps
description: How a Blocks app is built around agents that each own a whole job for people (order intake, quotes, collections, support, growth) — how many agents the app has and what each owns, the agent card you fill before any artifact or UI, what each agent's mini-app shows (a work board and an item deep dive, with human approval at the center), and which screens are interfaces outside any agent. Load it before planning or building any app that has, or should have, an agent that does work for people — from a plan, a solution or a plain description of the customer.
user-invocable: false
---

# Agentic apps — agents that own a job, and their mini-apps

A Blocks app is made of **agents** and **interfaces**. Each agent is in charge of a whole job, like an
employee — not an automation that runs one step. It starts from a trigger, does the work, asks the
customer when something is missing, asks its people to decide when it isn't confident, learns from
their feedback, follows up on its own, and finishes at a clear end state.

## The parts

Only user-facing agents and interfaces are visible. Ignore sub-agents when deciding UI.

| Part                  | What it is                                                                                                                             | Built as                                                                                                                                                                      | Visible?              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **User-facing agent** | Owns one full job. The "face" of that job — the one people go to.                                                                      | An agent artifact + its agent mini-app in `artifacts/app.json` + one agent-chat artifact per surface, in the same turn (`app-artifacts`)                                      | Yes, in the left pane |
| **Agent mini-app**    | That agent's space: built-in chat, threads and feedback, plus the pages you build. Every user-facing agent has exactly one.            | `{ "entryRoute", "agent" }` in `app.json`; the `frontend` agent builds it (`agent-mini-apps` skill) from your brief                                                           | Yes                   |
| **Sub-agent**         | A helper a user-facing agent uses behind the scenes — a step of its job.                                                               | A task agent (`agentKind: "task"`, the agents doc's "Task agents") invoked from an action, a workflow or the agent's `subAgentBlockIds`. No mini-app, no agent-chat, no pages | No                    |
| **Interface**         | UI with no agent of its own: screens several agents share (a CRM), an external portal (customers tracking their orders), manual tools. | A page mini-app `{ "entryRoute", "icon", "label" }` in `app.json`                                                                                                             | Yes                   |

## 1. Decide which agents the app has

Splitting by job to be done is the most important decision you make. The rules, in priority order:

1. **One agent per job to be done.** Jobs: order intake, quotes, collections, growth, support. If one
   person owns two jobs, they still get two agents.
2. **Each agent can work alone.** Any one agent does its full job without the others; the app could
   launch with just that one.
3. **As few agents as possible.** Fewer agents means fewer colleagues to go to. Never split one job
   into steps — no quote drafter plus a quote follow-up agent. Steps inside a job are sub-agents,
   actions or workflows. A different trigger, channel or autonomy level is not a reason to split
   either: the same agent takes an order from the mailbox, answers about it in chat and chases it on
   a schedule.
4. **Split by owner role only when needed.** Each agent has one owner role — the person who works
   with it and directs it. The order-intake agent takes direction from whoever runs orders, not from
   everyone. Only when two different roles each need to direct the same job, split it in two. Rare.

Work that is only forms, fixed rules and people's clicks gets no agent: it is a manual tool, an
interface (step 5).

An agent the app already has keeps its job: extend it, never add a second agent for the same job
(`app-artifacts` → `agents/agents.md`).

## 2. Fill the agent card before any artifact or UI

State these for every agent. The plan's **Agents & workflows** entry carries them when there is a
plan (Job to be done as **Goal:**, Lifecycle stages as **Stages:**); otherwise fill them from the
request, the customer's material and `memories/USECASE.md`, and ask for what you cannot state — one
`ask_user_question` round, a recommended answer first. Stages are the one field never to guess: they are the board's columns and
come from this customer's real process, not from another app.

| Field              | Example (order intake)                                         |
| ------------------ | -------------------------------------------------------------- |
| Job to be done     | Take customer orders and get them into the ERP                 |
| Owner role         | Order desk manager                                             |
| Trigger            | Customer order email arrives                                   |
| End state          | Order created in the ERP                                       |
| Work item          | Order                                                          |
| Lifecycle stages   | Defined per customer, from their real process                  |
| Human in the loop  | Approve unclear orders; pick a SKU when the customer gave none |
| Customer questions | Missing SKU, quantity or delivery date                         |
| Follow-ups         | Chase customers who didn't answer a question                   |

The card decides everything after it: the agent's instructions, tools and evals (`agent-builder`),
its work-item table (step 3), its triggers (a mailbox or a number through its channel skill, a
schedule or data event through a workflow artifact), its follow-ups (a scheduled workflow, or the
agent's own reminders with `allowSelfScheduling` — the `runtime-schedules` skill) and its mini-app
(step 4).

## 3. The data the mini-app needs

The work board and the item deep dive read the agent's **work items** from an app table — one per
work item in the card (Orders, Quotes, Opportunities). Besides its domain columns, that table carries
what the pages show, named for the domain. Give the agent the table's tools and tell it in its
instructions to keep these columns current:

| The column holds                                                                             | Shown                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| The **stage** — a string with an inline enum of the card's stages, in order                  | The board's columns; the deep-dive header                    |
| Whether it **waits on a person** — a boolean, never a stage                                  | Red everywhere; the board's "Needs you" filter and its count |
| The **action** it wants approved ("Approve outreach"); empty when there is none              | The deep dive's Approve                                      |
| The **question** it needs a person to answer when it isn't certain; empty when there is none | The deep dive's prompt, with Ask [agent] beside it           |
| What the agent is **doing and the next step**, one line                                      | The card on the board                                        |
| What the agent **recommends or did**, and **why** in a column of its own                     | The deep dive's banner and its "Why"                         |
| What it **prepared** and waits on — the drafted email, the order lines                       | The deep dive, marked as waiting for the person              |
| The **source** — the original message, email or request (text or a file URL)                 | The deep dive                                                |

The flag, the action and the question are for the owner role. A question for someone outside — the
customer, a requester — is not one of them: the agent sends it (as a draft to approve when the
card's human loop covers outgoing messages), the item waits on that person in a stage of its own
("Waiting on customer"), and a follow-up chases them.

Account context (the customer's previous orders) comes from the tables the app already has. How the
agent got there is a dated timeline: a child table of dated notes the agent adds to as it works —
every work item gets one, since a row a workflow run created carries no conversation to link to.
Counts of the board's own rows (how many need a person) come from the rows it loads; aggregates over
the whole table (value in play, won this month) are a view artifact.

## 4. What is inside the agent mini-app

**Built in — never rebuild these:** the chat with the agent; its threads and workflow runs in the
left pane, created automatically, with runs waiting on a person marked; feedback to the agent.

**The pages you build, linked from the left pane.** These two, for every agent with a work item
(another page only when the job needs it):

1. **Work board** — every item the agent handles and where each one stands. A kanban with a list
   toggle: one column per stage; on each card what the agent is doing and the next step; items that
   need a person stand out. Above it, a card in the agent's voice saying what its job is, and a few
   metrics led by "N need you".
2. **Item deep dive** — everything a person needs to decide on one item: the original message, the
   account context, what the agent did or recommends and why, a button to approve the recommended
   action, an "Ask [agent]" button, and the question the agent needs answered when it isn't certain.
   When the agent acted on its own, this is where a person reviews what it did and corrects it
   through feedback.

**Human approval is the core of these pages.** Items waiting on a person are red everywhere they
appear: the board's "Needs you" filter, column badges, card borders and the deep-dive header.
**Approve** is an app action you write, one per kind of step the card's human loop approves. It:

1. checks the item still waits on that very action, and does nothing otherwise;
2. performs the step from what the agent prepared (sends the stored draft, enters the order lines);
3. advances the stage and clears the wait (the flag, the wanted action and the question).

It is the one approval path: the agent prepares the step and marks the item as waiting, never
performs that step on it, never holds its Approve action as a tool, and is never asked to confirm
the step in chat. It is never the action the agent runs for that step on items it handles alone. A
wait that is a question rather than an approval (a customer replied; pick a SKU) has no Approve: the
person answers through Ask [agent]. Every other step a person takes on an item that waits on them
(reject, take over, cancel) is an app action too, and clears the wait: the page never changes a
waiting item's stage or its wait. An item that waits on nobody is edited and moved like any row (a
to-do task dragged to Done).

The mini-app **opens on the work board**; the new chat is one click away in the left pane. The one
exception: an agent with no work item at all (it only answers questions) has no board and opens on
the new chat — say so in the brief.

Pass all of it to the `frontend` agent in the brief's `MINI-APPS` paragraph for this agent (its
shape is in CLAUDE.md); the frontend builds the pages from it (`agent-mini-apps` skill).

## 5. Interfaces sit outside agents

Some screens belong under no agent. Build each as a page mini-app:

- screens several agents share, like a CRM;
- external portals, like a customer portal for tracking order status;
- manual tools that have no agent at all.

An agent's own work items live on its work board: its people find, add and edit them there, never in
a second list of the same items for the same people (a to-do app with one agent that manages the
tasks is that agent's mini-app alone). A portal or a one-step approver's screen shows outsiders only
their own items or the step they approve. Records the agent only reads and people keep by hand
(customers, a price list) are a manual tool. A sub-agent has no pages: what it produces shows on its
parent agent's board. An app asked for one agent and no screens declares only that agent's mini-app.
Mini-apps link to one another and never share a shell (`app-layout`).

**Who uses a mini-app** is the agent's owner role — everyone signed in unless the request says
otherwise; never invent a role. The owner role is also the agent's `adminRoles` (empty when it is
everyone), so the people who direct it can give it feedback. Someone who only approves one step (a
manager above a limit, a building owner) is not a second owner: they approve on their own small
screen, an interface, and get a notification — never a place in the mini-app's `roles` or in
`adminRoles`. The shell lists every conversation anyone had with the agent, so people who should
see only their own chat (a customer, a tenant) talk to the agent through a plain chat in their
interface instead (`AgentChatSimple` over their own agent-chat artifact).

## 6. Before you finish

A build is good when all of these are true:

- [ ] Every agent owns one full job, from trigger to end state.
- [ ] Every agent can work without the others.
- [ ] The app has as few agents as possible, and no job is split into several agents.
- [ ] Each agent has one owner role; whoever only approves one step has their own screen instead.
- [ ] Each agent mini-app has a work board and an item deep dive, linked from its left pane (none only
      for an agent with no work item).
- [ ] Board stages come from this customer's process, none is named for the owner's wait ("Awaiting
      approval"), and something that actually runs sets each one — an action, a workflow or a
      person's move on the board — the end state included (a line in the agent's instructions is
      not enough when nothing triggers the agent then).
- [ ] Each Approve action checks the item still waits on it and performs the step from what the
      agent prepared.
- [ ] Every follow-up on the card is built — a scheduled workflow or the agent's own reminders — and
      every wait on someone outside (a sent quote, missing documents) has one.
- [ ] A timed stage change (an expiry, a lapsed hold) skips an item while it waits on the owner.
- [ ] Chat, threads and feedback were not rebuilt.
- [ ] Shared, external and manual screens are separate interfaces.

## Worked example: Maya (Growth)

Maya is the reference for a good agent mini-app. Her job is to spot revenue in the existing customer
base and drive it to a won deal: pilots turning into projects, spares bought elsewhere, accounts going
quiet.

| Field              | Maya                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| Job to be done     | Spot revenue in existing customers and drive it to a won deal           |
| Owner role         | Sales team (everyone signed in)                                         |
| Trigger            | A weekly scan of orders and pilots; a chat message from sales           |
| End state          | Deal won                                                                |
| Work item          | Opportunity                                                             |
| Lifecycle stages   | Spotted → Outreach ready → Contacted → Quoting → Won                    |
| Human in the loop  | Approve each outreach before it is sent; decide when a customer replied |
| Customer questions | Whether the pilot is going ahead; who now buys the spares               |
| Follow-ups         | Chase a contacted customer who hasn't replied in a week                 |

Her artifacts: `GrowthAgent` with its mini-app at `/growth` and `GrowthChat`; an `Opportunities`
table (stage enum above, `needsYou` + `neededAction` + `openQuestion`, `agentStatus`,
`recommendation`, `reasoning`, `draftOutreach`, `sourceSummary`); an `OpportunityEvents` child table
for her evidence timeline; an `OpportunityMetrics` view (value in play, contacted this week, won this
month); a `SendApprovedOutreach` action that emails the draft, moves the stage to Contacted and
clears the wait.

Her mini-app: the left pane links **Opportunities (6)** — the count of items that need a person. The
work board opens first: a card in Maya's voice describing her job, four metrics led by "6 need you",
a weekly chart, then the kanban Spotted → Outreach ready → Contacted → Quoting → Won; cards that need
a human have a red border and a chip naming the action ("Approve outreach", "Customer replied"). The
deep dive opens on a "Maya recommends" banner with the action in one sentence, a "Why" expander,
"Approve & send" and "Ask Maya"; under it cards for value, confidence, time in stage and expected
close; then "How Maya found it", a dated evidence timeline; last, the outreach email she drafted,
marked "Waiting for you".
