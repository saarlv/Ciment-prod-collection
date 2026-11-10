# Agent planning

A sub-guide of the `plan` skill, for the **Agents & workflows** section at either depth.

The content comes from `agentic-apps` (the roster and the agent card) and `agent-builder` (the
rest of what every agent defines, the discovery questions, the eval rules); this guide is only the
plan shape. After approval, each agent is built from its entry here, so a field left empty sends
the build back to the user with a question the plan should have asked.

## Name the roster

- An agent the app already has is extended, not duplicated (the describe tools list them). Name
  its bullet by the agent's current name or job title, so the plan card shows that agent, and say
  "existing" in its Goal.
- Name each agent by its job, the way a person would hold it ("Order desk agent"). The word
  "agent" goes in the name; the plan card draws an agent from it.

- An agent no person will ever talk to — called only by workflows or as another agent's sub-agent — is a task agent (see "Task agents" in `app-artifacts/agents/agents.md`). Name it by its job ("Invoice extractor task agent"), and in place of the card (Owner role to Follow-ups) and Channels write **When to use:** the one sentence a parent agent reads to decide when to call it.

## Write each agent

One top-level bullet per agent, its fields as labeled sub-bullets, in this order. Every sub-bullet
starts with its label; one unlabeled line turns the card's spec sheet back into a plain list. One
level of sub-bullets only — the plan card draws exactly that as the agent's spec sheet; a third
level, a `###` heading or a table inside the section turns the whole section into a plain document.

```markdown
- **Order desk agent:** files every inbound order into the ERP within minutes, so no order waits for a person.
  - **Goal:** every order email becomes a confirmed ERP order the same hour; the rep only sees the exceptions.
  - **Owner role:** the order desk manager, who directs it and decides its exceptions.
  - **Trigger:** an email to the orders mailbox; a chat message from the desk.
  - **End state:** the order is confirmed in the ERP, or rejected with a reason.
  - **Work item:** Order (the Orders table).
  - **Stages:** Received → Checking → Waiting on customer → Entered in ERP → Rejected (their process).
  - **Human in the loop:** approves unclear orders; picks a SKU when the customer gave none.
  - **Customer questions:** a missing SKU, quantity or delivery date.
  - **Follow-ups:** chases a customer who hasn't answered a question in two days.
  - **Boundary:** acts on orders; the Collections agent owns anything about payment.
  - **Channels:** the `orders@` mailbox.
  - **Workflow:** an order email arrives → it looks up each line with `SearchProducts`, files the order with `CreateOrder`, and replies with the confirmation through `ReplyToEmail`. If a line matches no product, it asks the customer and holds the order.
  - **Tools:** `SearchProducts` (existing, reads Products); `CreateOrder` (new, writes Orders and Order lines); `ReplyToEmail` (Gmail integration).
  - **Skills:** `OrderMatching` (new) — how to resolve a free-text product name to a SKU, with their naming quirks.
  - **Knowledge:** the price list (Price list table); memory on, for each customer's usual items.
  - **Explains:** which past order or catalog row each line was matched from, so the rep trusts the match.
  - **Autonomy:** files and confirms orders up to $10K alone; above it the order waits on the desk in its mini-app (the deep dive's Approve files it).
  - **Hard limits:** never changes a price; an order over $200K or from a customer on credit hold goes to the sales manager.
  - **Hands off to:** Collections agent, when a customer on credit hold orders.
  - **Golden:** Acme's reorder email (their sample) → a 3-line order for Acme, confirmed by reply.
  - **Golden:** "the usual, but double the blue ones" (their sample) → last order repeated, blue SKU ×2.
  - **Golden (invented, adversarial):** a $250K order → no order filed; handed to the sales manager with a reason.
  - **Metric:** every line maps to the SKU the customer meant (their words: "the right part, first time").
  - **Metric:** stays inside the hard limits.
```

How to write each field, and what it becomes in the build (what goes in it is `agentic-apps`' and `agent-builder`'s):

- **The bullet** — `**Name:**`, then one sentence of what it does → `name` / `jobTitle`, the top of `instructions`.
- **Goal** — the outcome it is accountable for, with their number where they gave one → the job description in `instructions`.
- **Owner role** — one role → the mini-app's audience (`roles` when kept to some); someone who only approves one step (a manager above a limit) is not added here and gets their own approval screen.
- **Trigger** — chat, an inbound message, a schedule, a data event → an automated trigger is a workflow artifact.
- **End state** → the last stages; the instructions; something in the build sets it.
- **Work item** → its table — the board's rows.
- **Stages** — in order, from this customer's real process; where the work stands, never the owner's wait ("Awaiting approval", "Needs you" — that is the item's needs-you flag) → the stage column's enum — the board's columns.
- **Human in the loop** — what a person approves or decides, and when → items waiting on a person and the deep dive's Approve action (`agentic-apps`, step 4).
- **Customer questions** → `instructions`; the agent sends them, the item waits on the customer in a stage of its own, and a follow-up chases them.
- **Follow-ups** — what it chases, after how long → a workflow, or the agent's own schedule.
- **Boundary** — one sentence; omit with one agent.
- **Channels** — a mailbox, phone or WhatsApp number it answers, only when that channel's skill is loaded, and any page where people chat with it outside its mini-app; its mini-app's chat is implied → `communicationChannels`, an agent-chat per page.
- **Workflow** — one per job it runs, in plain words: what starts it, what it does at each step and with which tool, the result, then what it does when a step fails; repeat the label per workflow → the instructions' procedure; a workflow artifact when it is triggered.
- **Tools** — each in backticks, by the operation's name: existing or new, what it reads and writes, the integration, and "approval" when a person signs off before it runs (never on a human-in-the-loop step, which is the deep dive's Approve) → `tools` (actions), `tools[].approval`.
- **Skills** — each in backticks with the procedure it carries; "none" when the instructions hold it all → skill artifacts.
- **Knowledge** — documents, URLs and tables it consults; memory on or off and what it remembers → `knowledge`, `memoryEnabled`.
- **Explains** — what it shows the user about a decision → `instructions`; the deep dive's recommendation and its why.
- **Autonomy** — what it does alone and what it drafts for approval → `instructions`; a draft is an item waiting on a person, approved on the deep dive (`agentic-apps`, step 4).
- **Hard limits** — each threshold or rule, and the named person it hands to → `instructions`, the adversarial golden.
- **Hands off to** — the agents it triggers, and on what → a workflow or a sub-agent.
- **Golden** — one per case: the input → the approved outcome, marked "their sample" or "invented" → `evalGoldens`.
- **Metric** — one per line; where it is the user's dimension, quote their words → `evalMetrics`.

- **Mark where each golden came from.** "(their sample)" for a case the user gave you;
  "(invented)" for one you wrote under `agent-builder`'s rule, plus "adversarial" for the
  hard-limit case. No real examples at all? Say so in the bullet ("no real examples yet — goldens
  below are invented") and list the ask in Open questions. Never invent an example, a quote or a
  threshold to fill a field the user left open; that goes to Open questions too.
- Where a golden needs a tool-call check, say so on it: "checks `CreateOrder` is called".
- Write every field, "none" where it has nothing to hold (no skills, no hand-offs); Boundary only
  with two or more agents.

## Write each workflow

Work with no judgment and no person talking to it — a nightly sync, a status roll-up, a reminder —
is a workflow: a top-level bullet named for what it does ("Nightly reorder check"), never with
"agent", "automation" or "workflow" in the name, and "existing" in its Runs as when the app already
has it. Its sub-bullets:

```markdown
- **Nightly reorder check:** raises a draft PO for every SKU under its reorder point.
  - **Trigger:** every day at 02:00.
  - **Steps:** `ListLowStock` → `DraftPurchaseOrder` per supplier → notify the buyer.
  - **Exceptions:** a supplier with no price on file is skipped and listed for the buyer.
  - **Runs as:** plain actions; the Procurement agent picks up the drafts.
```

## Diagrams

Under the bullets: a `flowchart` per agent workflow or standalone workflow that branches (trigger →
steps → exceptions → hand-offs), and one `sequenceDiagram` where people and agents pass work back
and forth. The `plan` skill's Diagrams rules apply. Each diagram shows a shape; the fields keep the
facts.
