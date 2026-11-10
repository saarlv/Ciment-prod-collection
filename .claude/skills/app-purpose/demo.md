# Demo build

A sub-guide of the `app-purpose` skill. Read it when the app purpose is **demo**.

A demo exists to make one person say "that's exactly our process, working." It is judged in a
twenty-minute meeting: the story is shown end to end, on data that looks like theirs, with the
agents visibly doing the work, and it can be run again from the start for the next meeting. Build
for that, fast, and stop there.

## Must-haves (the rest of this guide explains each)

1. **Nothing reaches a real person.** No email, text or call goes to anyone in the customer's data,
   even when the user asks for real sends or the data is "their real export". When the user wants
   real sends, every recipient is the presenter's own address or number, entered on the demo control
   page; the reset points every recipient field at it. Say so in the plan; never plan sends to the
   customer's contacts.
2. **A demo control page** (`/demo`): Reset demo data (deletes and re-inserts the baseline; not
   `seedData`), one "Simulate" button per inbound event in script order, and the written script.
   The app shows its baseline data before the first reset too.
3. **The script first**: 3–6 moments; build only what they show, on data that looks like theirs.
4. **Every simulated record is labeled** "Simulated" in the UI.
5. **In the plan**: the purpose is the first Decisions bullet; Pages & UI lists the control page and
   the script; Data states the baseline the reset restores; Build order ends with "reset → run the
   whole script → reset".
6. **Evals**: one golden per script moment the agent handles plus one adversarial golden.

## What a demo has to have

1. **The story, end to end.** Write the demo script before anything else: the 3–6 moments the
   customer watches, in order ("an order email arrives → the Order desk agent files it → one line
   needs approval → the rep approves → the confirmation goes out"). Every moment the script shows
   is built for real: real tables, real actions, real agents with real instructions. Anything the
   script never shows is not built.
2. **Data that looks like theirs.** Use their sample files (the `user-files/` they sent) for the
   records, IDs, product names and language. Without files, invent a believable set in their
   vocabulary (their SKU shape, their customer types, their currency), never "Customer 1" and
   "Product A". Enough rows to look real (dozens, not thousands), and the rows that make each
   script moment happen: the order with the unknown SKU, the invoice that is short-paid.
3. **A demo control page.** Every demo gets one: its own page mini-app (e.g. `/demo`, label
   "Demo control") in `artifacts/app.json`, kept to the people who run the demo with a role when
   the app has roles. It holds:
   - **Reset demo data**: one button, confirmed with a dialog, that puts every table the story
     touches back to its starting rows. It calls a `ResetDemoData` app action that deletes the
     rows of each table (children before parents) and inserts the baseline again. `seedData` is
     not a reset: it is inserted only once, when the table is first created, and never again on a
     later sync. Keep the baseline rows in one place the reset action reads (the action itself, or
     a `DemoBaseline` table), so editing the story means editing one list.
   - **One button per simulated event** in the script, in script order: "Simulate: order email
     from Acme", "Simulate: supplier replies late". Each runs an app action that creates what the
     real channel would have created (the inbound message row, the email record) and hands it to
     the agent the way the real trigger would, through a `SendAgentMessage` node or the workflow
     the real event would fire. Use the customer's real wording from their samples for the
     simulated content.
   - A short **script** on the page: the moments in order, which button starts each, and what to
     show on screen while the agent works.
4. **Simulation, labeled.** Inbound traffic (email, WhatsApp, calls, supplier portals, ERP
   events) is simulated from the control page; no real mailbox, number or integration is
   connected unless the user asks for it. Outbound sends (the agent's reply email, the PO to the
   supplier) are recorded in a table and shown in the app as "sent" instead of reaching a real
   person: a demo must never email a real customer. Mark every simulated record in the UI (a
   "Simulated" badge) so nobody mistakes the demo for a live connection.
5. **The agents doing real work.** The main agents are real agents with focused instructions and
   the tools the script uses. Their reasoning on screen is the demo, so give each one its
   work board and item deep dive (`agentic-apps`) and its **Explains** (what it shows about a
   decision).

## What a demo leaves out, on purpose

- Edge-case branches the script does not show, settings pages, admin screens, multi-tenancy,
  bulk import, roles beyond the one that hides the control page.
- Configuration screens: thresholds and rules may be constants in the agent's instructions or the
  action, named and grouped so they are easy to find. Say in `memories/STORY.md` which values are
  hard-coded, because the move to production starts there.
- Real integrations (see 4), unless one is the point of the demo ("show it reading our real
  inbox"); then build that one the production way.

Never cut corners that break the meeting: every button on a page the script visits works, every
screen has data after a reset, nothing in the UI says "TODO", "mock" or "coming soon". A
simulated event is a feature of the demo, not a placeholder.

## Evals in a demo

Each agent the script shows gets a small eval set that keeps the script working when someone
edits the agent later:

- one golden per script moment the agent handles, built from the same sample the control page
  simulates, marked "(their sample)" or "(invented)" as the `agent-builder` skill requires;
- at least one adversarial golden from the agent's hard limit (the over-limit order goes to a
  person), because that is the moment customers ask about;
- metrics only for what the customer named as a great result, plus staying inside the hard
  limits.

Say in the plan that a production build would grow this into a full eval suite.

## In the plan

- **Understanding**: the app purpose, the meeting it is for, and who will run it.
- **Decisions**: first bullet the app purpose; then what is simulated and what is real.
- **Pages & UI**: the demo control page with its buttons, and the script as its numbered moments.
- **Agents & workflows**: each agent as usual (the `plan` skill's `agents/agents.md`); its
  **Trigger** names the control-page button that simulates it.
- **Data**: the baseline rows the reset restores, as counts per table and the special rows each
  script moment needs.
- **Build order**: data and the reset action first, then the agents, then the simulation buttons,
  then the screens; the last step is running the whole script once after a reset.

## Before you finish

Run the script yourself: reset, then each simulated event in order, checking the agent did what
the script says (the data tools, `GetActivityLog`). If a `qa-browser` subagent is available, give
it the script as the flow to cover. Then reset once more, so the app is ready for the meeting.
