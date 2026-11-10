# Solution planning (discovery depth)

A sub-guide of the `plan` skill. Use it when the plan has `depth: "discovery"`: a new product, or
a solution for a customer or business — the tells are customer material in the message (a
discovery-call summary, a requirements document, templates, "this is a real customer engagement")
or a request to plan or design what a company needs, even when the words "solution" or "plan" are
absent. A plan for such a request written without this guide will be missing sections the build
depends on.

Turn a customer's real back-office work into a plan another agent can build. The plan has three outputs, in dependency order:

1. **Workflows to automate** — the to-be agent flows, derived from what the customer does manually today
2. **Data structure** — the tables, views, and relationships those flows read and write
3. **UI** — the pages, agent mini-apps (each with its own pages), layout, and agent-chats the customer interacts with

You produce these by first running a discovery interview. A plan invented without the customer's actual workflows is the single most common way these builds go wrong — the point is to automate _their_ process, not a generic one.

## Platform context

blocks.diy builds custom operational agents for operations-heavy businesses worldwide that run on an ERP or similar system of record — manufacturers, distributors, retailers, field-service and multi-location operators, and the finance and service teams around them. The agents sit on top of the customer's ERP (e.g. SAP, NetSuite, Microsoft Dynamics, Oracle, Priority, or any system of record) and core systems, and run real workflows end to end.

The jobs are usually among these proven ones — examples to recognize the customer's work by, one agent per job (`agentic-apps`), not a cage:

- **Order intake** — order-taking across channels, order entry into the ERP; **Quotes** — quoting and follow-up (two jobs, two agents, even when one rep does both)
- **Collections Agent** — invoice-to-cash follow-up, payment matching, short-pays
- **Growth Opportunity Agent** — cross-sell / upsell and new-channel outreach
- **Support Agent** — customer questions and dispute resolution across channels
- **Procurement Agent** — purchase orders from creation to delivery, supplier comms
- **AP Agent** — three-way match, discrepancy routing, supplier disputes

Design the best possible solution for whatever the customer actually does — never gate, qualify, or flag whether the use case is a "good fit." Whatever their shape (large or small, a full ERP or just spreadsheets and inboxes, a core or an adjacent industry), adapt the roster, data model, and integrations to their reality and deliver the strongest plan their work supports.

The unit of the product is an **agent**: a named operator with a role, the tool calls it can make, and explicit hard limits and human-handoff points. A finished app is a small set of agents plus the data and screens around them. Plan in agents, not features.

## What you are planning against

The plan is built by another agent out of a fixed set of artifacts. Write the plan in that vocabulary so it is directly buildable:

| Plan element                                            | Becomes                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A record type the agents read/write                     | a table artifact (`artifacts/tables/`)                                                      |
| A dashboard KPI, join, rollup, or filtered list         | a view artifact (`artifacts/views/`) — never a table                                        |
| A step the agent performs                               | an action (prefer a DAG action; code action last resort)                                    |
| A named operator with instructions, tools, memory       | an agent artifact (`artifacts/agents/`)                                                     |
| A chat surface the customer talks to that agent through | an agent mini-app in `artifacts/app.json` plus one agent-chat artifact per surface          |
| A mailbox that agent answers                            | a `communicationChannels.email` entry on that agent                                         |
| "When X happens, do Y" (schedule or data event)         | a workflow artifact (`artifacts/workflows/`)                                                |
| An agent's work board and item deep dive                | its mini-app's pages over its work-item table and metrics view (`agentic-apps`)             |
| A screen                                                | a route module under `src/routes/` (folder structure = URL)                                 |
| Navigation / the app shell                              | each mini-app's `layout.tsx` (its own nav); `src/root.tsx` for chrome shared by all of them |
| Two or more personas with genuinely different apps      | role artifacts (`artifacts/roles/`) — most apps need none                                   |

Every action is a normal action unless its estimated total runtime is over ~25 minutes (items × time per item); when the plan makes one long-running, it states that estimate under **Decisions** (see `app-artifacts/actions/actions.md`, "Long-running actions").

If the request implies each customer organization sees only its own data, say so in the plan and note that the build needs the tenant-ready model from the `multi-tenancy` skill.

## Workflow

**The customer is whoever the solution is for.** A product idea ("a project tool for freelancers")
gets this same interview: the user speaks for those customers, and their pains, value and
workflows are what you capture. A short request is not a reason for a short interview.

**The rounds are a floor, not a cap.** Before presenting the plan, you must have run, each as its
own `ask_user_question` round:

1. **Pains** — the pains and outcomes, with the high-value opportunities you recommend for their
   line of work (step 1 below).
2. **Opportunity map** — the ranked map, shown to the user to confirm or correct (step 1's output).
3. **Workflows** — at least one round on the AS-IS workflows behind the top opportunities
   (step 2), then the open-question rounds of step 3.

Product choices (who uses it, billing model, and so on) ride along in these rounds; they never
replace them. Skip the floor only when the user says to stop asking, and record what you assumed.

### 1. Find the pain and the value

Start with outcomes, not systems. Before capturing any workflow in detail, run a short consultative conversation that lands three things together: **what hurts most, what solving it is worth, and how an AI agent would change it.** This is what earns the customer's trust and gives the build its priorities.

- **Draw out the pain — and don't stop at the first one.** Where does the team lose time, where does revenue leak, where do errors and delays cost them? Push past the first answer — "what else eats the day?", "where do things slip?", "what do you dread at month-end?" — until the list stops growing. The app ships in one build and must cover everything that hurts, so the _full_ set of painful issues is the goal; a pain you never surface becomes a hole in the app.
- **Lead with recommendations, don't just interrogate.** Come in with the high-value opportunities typical for their vertical — use what you know about the industry and the agent roster — and put them in front of the customer to react to: "for a distributor on NetSuite, the usual big wins are auto order-entry, collections follow-up, and PO expediting — which of these bites hardest?" A customer confirms or corrects far faster than they invent, and it shows you understand their world.
- **Translate every pain into value and an agent.** For each pain, say — in the customer's own terms — what an AI agent would change (hours saved, cash collected sooner, errors caught before they ship, a channel finally covered) and which roster agent owns it — or that it needs no agent, when the work is only forms, fixed rules and people's clicks (an interface, `agentic-apps`). Keep "how AI helps" concrete and tied to their real work, never an abstract promise.
- **Converge on a ranked Opportunity map.** Land on a shared, prioritized picture the customer agrees with: the pains that matter most, each with its value and the agent that addresses it — pains of one job share its one agent (`agentic-apps` step 1). Rank by impact × frequency — that ranking directs where the app goes deep, not what gets cut (the build still covers all of it).

Capture the logistics lightly as you go — who they are and what they make / move / sell, what ERP and systems they run on — but let the value conversation lead, not a form.

Produce the **Opportunity map** here, and confirm it with the customer before going deep:

| Pain point | What it costs today | How an AI agent changes it | Value | Agent |
| ---------- | ------------------- | -------------------------- | ----- | ----- |

### 2. Discovery interview — capture the AS-IS workflows

Before your first round, check the `domain-knowledge` skill: if a guide covers this business function, read it and use its rules to see what to cover and its "Ask the customer" lines among your questions.

With the Opportunity map agreed, go deep. Working through the opportunities highest-value first, get the customer to walk you through what a person does today, step by step, before any automation. For every workflow capture:

- **Trigger** — what kicks it off (an order email arrives, stock dips, a supplier replies, month-end)
- **Steps** — the actual sequence the human performs, including the systems they touch and the data they look up
- **Decisions & judgment calls** — where a human decides something, and on what basis (this becomes the agent's reasoning)
- **Exceptions & escalations** — when they break the routine, who they hand off to, and the threshold that triggers it
- **Inputs/outputs** — what data goes in, what record or message comes out
- **Volume & pain** — how often this happens and where it hurts (time, errors, delays). This confirms and sharpens the value ranking on the Opportunity map.
- **What "done well" means** — how they judge a good outcome, in their own words. Ask for it explicitly; it is the bar the agent is later measured against, and it is the thing customers never volunteer.
- **Channels** — where the work happens (portal, email, EDI, WhatsApp, phone, showroom). Operations-heavy customers are almost always multi-channel.
- **Systems & data sources** — every platform the work touches (ERP, CRM, accounting, email, spreadsheets, customer/supplier portals, EDI) and which system is the source of truth for each piece of data. The agent reads from and writes to these, so map them explicitly — including anything living in a spreadsheet or inbox rather than a system.

Push for specifics: real SKUs, real customer names, real thresholds, real numbers. A plan grounded in "orders over $200K go to the sales manager" is buildable; "large orders get reviewed" is not.

**Collect real artifacts, not just descriptions.** Ask the customer for real examples of the work — data exports (orders, products, customers, suppliers as CSV/Excel), sample documents (a real order email, invoice, PO, RFQ, claim), and recordings or transcripts of the actual calls and conversations the agent will handle. These do triple duty: they reveal the customer's real schema and identifier conventions so the data model matches reality, they seed believable demo data, and they give the agent real language and edge cases to pattern-match on. A single real order email teaches more than a paragraph describing orders — so always ask what they can send, and note in the plan which artifacts you have and which you still need.

### 3. Resolve open questions before you design — the gate

Do not design a single agent while load-bearing questions the customer could answer remain unasked. Discovery rarely ends with everything known, but the customer can almost always answer far more than you'd assume — and a real answer makes the plan more accurate than a guess or a placeholder ever will.

- Compile the gaps you've surfaced — the load-bearing unknowns especially: real thresholds, capacities, ID/SKU schemes, who approves what, where each piece of data actually lives, volumes, lead times, channel specifics, integration access.
- Ask in numbered rounds, not one overwhelming dump: the whole current frontier of questions in one `ask_user_question` call, led by the questions whose answers most change the design. Where the answer is a choice, give the options; where it is open-ended, ask in prose in the same round.
- Recommend an answer to every question and put it first, labelled "(Recommended)", with a one-line why — a customer confirms or corrects far faster than they invent from scratch, and a recommended default keeps the plan opinionated and grounded rather than a menu of options.
- Keep going round after round while answers unlock sharper follow-ups; around six rounds is usually enough, and you decide when the customer has answered what they can. "I don't know" is a valid stop for that thread, not a reason to end the interview; move to the next gap.
- Only genuinely unanswerable or deferred questions survive into the plan's "Open questions" section, each tagged with who will answer it.

When the customer has answered everything they can — and only then — move to design.

### 4. Load `agentic-apps` and `agent-builder`, then design the TO-BE workflows

Load **`agentic-apps`** (how many agents, and the agent card each one needs) and **`agent-builder`** before you write any agent section. Every agent you are about to spec is built with them once the plan is approved, and they read that agent's section of the plan instead of re-covering what the plan already answers — so they tell you what each section has to contain. An agent section written without them comes out underspecified and the builder has to come back and ask.

**Design the whole app in one build — there are no phases.** blocks.diy ships the full app in one shot; nothing is deferred to a "later phase." Your job in design is **coverage**: every painful workflow the customer surfaced gets handled, not whittled down to one.

Work with the customer to identify their most painful issues and rank them by volume × pain — that ranking directs where the app's depth and polish go, it does not decide what gets cut. Then design the agents by `agentic-apps` step 1 (one agent per job to be done) and fill each agent's card, with the stages from the customer's AS-IS process. Map each job to the roster role that owns it, adding a new role only when none fits. Don't invent work the customer never flagged as painful. Rare, high-judgment work is usually a human approval inside the agent's job, not an automation.

Design each agent with `agent-builder` (what every agent defines, its evals), then write every
agent and automation in the shape of the `plan` skill's `agents/agents.md`, with goldens and metrics
drawn from the customer's real examples and their "what done well means".

### 5. Design the DATA STRUCTURE

List the tables the agents read and write, and the views the screens need. For each table: its key columns, its identifier convention, and its relationships (a reference column, never a copied value). Ground it in the customer's ERP reality — their SKU scheme, their customer ID range, their order statuses, their channels. Cover:

- **Core records** — orders, line items, products/SKUs, customers, suppliers, POs, RFQs, cases — whichever the in-scope processes touch
- **Status enumerations** — the real lifecycle states a record moves through (e.g. order: auto-filed → stock check → in production → shipped, plus rejected and cancelled — a lifecycle that only tells the happy path is half a lifecycle), since agents act on status transitions and they are the agent's board columns. Each work-item table also carries what the agent's board and deep dive show (`agentic-apps`, step 3).
- **Reference/lookup data** — channels, payment terms, thresholds, lead times
- **Views** — every dashboard number, joined list, and rollup the UI needs, listed as its own view. A screen that shows derived data with no view behind it is a gap in the plan.

Call out where the data lives in the ERP vs. what Blocks stores, and any matching logic (e.g. resolving an inbound order's free-text product name to an internal SKU). The platform already records every agent action in its activity log, so don't design an audit table for that.

### 6. Design the UI

Specify the screens in the terms the build uses:

- **Mini-apps** — the agent mini-apps and the interfaces, in opening order, each screen placed as `agentic-apps` says (an agent's work items on its own board; shared, external and manual screens as interfaces).
- **Routes** — one per screen, named as they will be under `src/routes/` (with target URL, nested inside its mini-app's folder). For each: which entities and views it reads, what the user does there, and what actions its controls call.
- **Layout** — the navigation shape per mini-app (its section `layout.tsx`) and what `src/root.tsx` keeps app-wide.
- **Agent mini-apps** — per agent, in plain words: its work board (the stages from their process in order, what a card shows, the metrics view) and its item deep dive (what a person sees to decide, the approve action) — the `agentic-apps` shape, so nothing is re-decided at build time.
- **Status treatment** — how the UI distinguishes routine / awaiting decision / urgent / done, expressed in the app's semantic theme tokens rather than invented color names.
- **Channels** — which outbound channels each agent uses (WhatsApp, email, phone), since each one needs an integration.
- **Language and direction** — match the customer's market and language, LTR or RTL (e.g. English, Spanish, Arabic- or Hebrew-first with RTL throughout). State it explicitly; it affects every screen.

### 7. Assemble the plan

Before writing, run a coverage sweep: re-read the customer's source material (requirements document, call summary, templates) and check every requirement they stated against your design — each one must map to an agent, workflow, table, or screen, or carry an explicit out-of-scope / later-phase / handled-at-platform-level note. A requirement written in the customer's material is never an open question: open questions are only for what the material does not answer (a missing threshold value, an unspecified SLA).

Fill BUILDER_PLAN.md (started by `start_plan` with `depth: "discovery"`). The discovery sections come first, then the plan template's sections — map your material onto them; anything that still has no home (Migration, Risks, What stays the same) gets its own section after Open questions, never a parallel heading between the fixed ones:

- **Opportunity map** — the ranked pain → value → agent table from step 1; the spine of the plan
- **Customer & scope** — who they are, their ERP / systems, and the full set of agents and painful workflows the app covers
- **Understanding** — the goal in the customer's words, constraints, success criteria; "they said" separated from "I assumed"
- **Decisions** — each with the rejected alternative
- **Data** — tables, views, relationships, statuses, ERP/Blocks split (step 5), in the plan skill's shapes: a `| Table | Fields |` table, a `| View | Shows |` table, the erDiagram, and the ERP/Blocks split and matching logic as prose under them
- **Pages & UI** — mini-apps (entry routes), pages, agent mini-apps (who uses each, its work board's stages and its item deep dive), layout, language (step 6)
- **Agents & workflows** — the named roster in the shape of `agents/agents.md`: per agent its agent card (`agentic-apps`), tools, skills, knowledge, limits and its goldens built from **the sample documents or records it works from**, with metrics from **what a great result looks like**; then the automations. Quote the customer where they gave you their own words; where they didn't, say so and list it as an open question — never invent a quote or a sample to fill the slot.
- **Build order** — one build, no phases (see Principles), in shipping order
- **Open questions** — only what genuinely remains after the step-3 gate, tagged with who answers

Then review with the user: ask which sections need adjusting.

**Demo or production.** At step 1, read `.claude/skills/app-purpose/SKILL.md` and the guide for the purpose (`demo.md` or `production.md`) in full, before your first round: their must-haves are sections and rules this plan has to contain. Decide the purpose from the request when it makes it clear, otherwise as the first question of the first round. A demo keeps this interview but goes deep only on the workflows the demo script shows, and its plan adds the demo control page (reset, simulated events, the script) from `app-purpose`'s `demo.md`. A production plan follows this guide as it is, plus any rules its `production.md` has collected.

### 8. Persist the domain layer to `memories/USECASE.md`

Discovery surfaces two kinds of knowledge, and they belong in different places. The customer-specific decisions stay in the plan and in `memories/STORY.md`. Everything that would hold true for **any** company in this line of work — the lifecycle stages a record moves through, the vocabulary of the trade, the workflows and exceptions that recur across the vertical, the thresholds and compliance rules the industry operates under, the channels it works over — goes into `memories/USECASE.md`, fused with what you already know about that industry. Write it as domain knowledge, not as a record of the interview. It is what lets a later session design against how the business actually works rather than re-reading a transcript.

## Output format

Markdown, scannable by someone reading only headers and bold text. Use a table where the content is naturally tabular (steps, columns, statuses, supplier comparisons), and a mermaid diagram where it is a shape — the process today vs with agents, the data relationships, each agent's flow (the plan skill's **Diagrams** rules). Lead each major section with a one-line conclusion so a busy reader gets the gist fast.

Keep it as short as the work allows. The plan is the decisions, the data model, and the build order — not a restatement of the interview and not a preview of the code. Length is not thoroughness.

## Principles

- **Discovery before design.** If you find yourself designing agents before you understand what the customer does manually, stop and go back to step 2.
- **Cover the pain, in one build — no phases.** Cover every significant pain the customer surfaced, with one agent per job to be done (`agentic-apps`), all in the one app blocks.diy ships. Rank by volume × pain so the app's depth goes where it hurts most — but ranking directs effort, it doesn't defer or drop work. Don't pad the app with work the customer never felt.
- **Write it so it can be built.** Every element should map to a row in the artifact table above. If something in your plan has no artifact it could become, it is either UI copy or it doesn't belong in the plan.
