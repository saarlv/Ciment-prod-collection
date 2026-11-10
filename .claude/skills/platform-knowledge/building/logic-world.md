# Logic world: agents, workflows, triggers, code actions

## The Logic panel

Groups:

- **Agents** (+ **New agent**)
- **Workflows** (+ **New action**)
- **Tools** (+ **New action**)
- **Triggers**
- **Shared**

A new action without a trigger appears under **Tools**. Adding a trigger to it moves it to **Workflows**. Hover a workflow's or tool's row for the arrow at its end; it lists its canvas nodes under it, triggers first, without opening it. Click a node to open its settings, on its canvas (opened first if it isn't the one showing).

Agents inside apps are covered in `app-capabilities/agents-and-channels.md`.

## Workflow canvas

- Header: **Test Run**, **Activity** (run history), **Add node**, and settings.
- **Add node** offers four node types:
  - **Agent**
  - **Action** — app actions, data actions, knowledge base, tools and integrations
  - **Condition** — branch on an expression such as `input.amount > 100`. A branch with nothing connected just ends the run there, without an error.
  - **Merge** — wait for **All inputs** or the **First input**
- A node's "…" menu has **Ask in chat…** and **Settings**. To remove a node, ask Ella.
- Node settings tabs:
  - **General**, **Input**, **Output**. If **General** says it couldn't load the node's settings, **Try again**; if it keeps failing, the workflow itself may need fixing — ask in chat.
  - **Loop** — run once per item, with **On error**: stop the loop or continue to the next item.
  - **Settings** — code actions only: packages, secrets, memory.
- **Connection** on an integration step: **Use the connection from the trigger**, or the app-level connection. If unset, the app-level connection from **Settings → Integrations** is used.
- **Loops count every item as a separate run** (usage credits). Looping inside one code action is cheaper.

## Triggers and schedules

**Add trigger** offers:

- **Triggers** — schedule, webhook, form submit, app action, data event, **When a notification is answered** (someone answered a notification this app sent; see `navigation/notifications.md`)
- **Data triggers** — when a row is inserted, updated or deleted, or at a date column ± an offset
  - Date triggers follow the trigger's current settings: change the date column or offset and rows already waiting move to the new time; delete the trigger and they don't fire.
- **Integration triggers** — e.g. a new Gmail message
- **Meeting Notetaker** [flag: meeting-notetaker], **Incoming Voice Call** and agent chat turn triggers

**Schedules:**

- The **Repeat** options:
  - every minute, every 5/10/15/30 minutes
  - hourly, every 2/3/4/6/12 hours
  - daily, weekdays, weekly, monthly, yearly
  - **Custom**
- Each schedule has its own **Timezone**.
- **Ella can only create schedules that run at most once an hour.** For something more frequent, set it yourself in the trigger's **Repeat** setting.
- **To stop a schedule, delete its trigger:** the workflow's trigger card → "…" → **Delete**. A flag like "inactive" stored in the app's own data doesn't stop the platform schedule.
- Schedules run **from the live version only**.
- Scheduled runs use usage credits even when nobody is using the app.

**Integration triggers:** some services are checked periodically (Gmail roughly every 2 minutes; new Outlook mail arrives within seconds), so "instant" can mean a delay of a few minutes. The trigger runs as the person who owns the connection, by default on the app's shared connection or the workflow owner's own.

- **One per user** [flag: per-user-integration-triggers]: Ella can instead set an integration trigger to listen on each app user's own connection (e.g. "when an email arrives in each user's Gmail"). Builders can switch it themselves too: in **Logic**, open the workflow, click the trigger, and under **Whose account** pick **Each user's own account** (or **One account** to go back). Each user connects their own account in the app; every event then runs the workflow as the user whose account received it. The shared connection isn't listened on for that workflow. Connecting subscribes the user, disconnecting or removing the connection stops it, and reconnecting an expired one resumes it. Live version only, users of the app's own workspace only, up to 500 connected users per workflow, and not every integration supports it.

**Data triggers:** a trigger that writes back to the same table can fire itself again. Data triggers chain at most 5 levels deep.

## Testing and run history

- **Test Run** opens the **Input** tab. It has:
  - a form for the input values
  - **Previous runs**, to reuse an earlier input
  - **Save as default**
  - **Test**
- Results show in the run history and the Activity log, not as a popup.
- **Activity** (run history) has three parts:
  - a filter: **All**, **Success**, **Failed**, **Running**
  - columns: Status, Name, Input, Output, Duration
  - **Rerun** on any entry
  - a **Send message to agent** step's details have **Open chat**, which opens the agent's activity on the chat that step ran in, at the run it added (`app-capabilities/agents-and-channels.md`). Only for runs from now on, and only when the agent keeps the chat.

## Code actions

- Custom code steps, used when no ready-made step fits.
  - Code actions are TypeScript.
  - Python is also available.
- Turn them on per app in **Settings → Features → Code actions**. Account admins can block them in **Account → Allowed integrations**.
- **Limits:**
  - up to **15 minutes** per run
  - 512 MB memory by default (configurable)
  - no writable disk
- **Code actions run with the permissions of the user who triggers them.** There's no "run as admin". Whatever a code action can read for a user, that user could read directly.
- They're usually cheaper and more predictable than AI agent steps for calculations, sorting and data shuffling.

## Secrets (API keys for custom APIs)

- Stored per code action: open the action → **Settings** tab → **Secrets** → **+ Add Secret**. Ella can also show an **Enter secret** card in the chat.
- Values are never shown in chat. Ella never needs them typed into a message.
- A changed secret, or one pointed at a different connection, is used from the action's next run. Nothing needs to be republished.
- If a secret can't be read when the action runs (it was never set, or its connection was deleted or disconnected), the action still runs, just without that secret, so the code sees it as missing. Fix it by setting the secret again or reconnecting the connection.
- Storing custom secrets needs a plan with custom integrations (an Upgrade prompt appears otherwise).

## Webhooks

- Add a **Webhook** trigger to get a URL. The token in the URL is the only secret, and you can regenerate or revoke it.
- **Webhooks are asynchronous.** The caller always gets an immediate "processed" reply, never the workflow's result or custom response headers.
  - To send results out, have the workflow call the other system, e.g. with an HTTP request step or a scheduled code action.
- JSON and form/multipart bodies are accepted. Verification handshakes are supported.
- A webhook trigger can have a **Filter Expression** (like other triggers): the workflow runs only when it is true, e.g. `input.type === "order.created"`. It can also read `headers` and `queryParams`. Filtered-out calls still get a success reply.

## What this tool does

Every workflow and code action has a **General** tab with a **What this tool does** picker: **Read-only** (changes nothing), **Mutation** (creates or changes something without permanently removing anything; updating, or sending an email or message) or **Destructive** (permanently removes something: delete, cancel, revoke). It matters when an agent calls the action as a tool: the agent's **Ask before running** setting uses the label to decide which tools ask first (`app-capabilities/agents-and-channels.md`). An action with no label counts as Destructive. Ella sets it when she builds or edits an action, and keeps one you've already set.

## Retries and pausing on failure

Every action built from steps (not a code action) has two settings in its **General** tab: **Tries per step** (1–10; 1 by default, 3 on a long-running action) and **When a step fails**: **Fail the run** (default) or **Pause until resumed**. Every step also has a **Retries** tab with **Tries** to override the count for just that step; for a step that must not repeat, like sending an email or charging a card, set it to 1. A step may run more than once when it has more than 1 try.

- **Pause until resumed:** a step that still fails after its tries waits up to **24 hours** for a **resume** instead of failing the run. Resuming re-runs just what failed and carries on; what already succeeded is kept, not repeated. Not resumed within 24 hours, the run fails. On a normal action, the run can then last up to 24.5 hours in total (waiting included), while each step keeps its usual time limit.
- **A normal loop pauses per item:** the failed item waits, resuming re-runs only that item, and the loop still passes on every item's result in order. The loop's **On error** reads **Pause until resumed** / **Fail the run** or **Continue to the next item**.
- If another action calls this one and waits for its answer, a failing step fails the run instead of waiting.
- An action used as a step inside another action runs with the **calling** action's settings (its tries, what happens when a step fails, and its time limit); its own settings apply only when it runs on its own.
- **Fail the run** fails the run at once. Use it when nobody will resume (a job that just runs again next time).
- **Pause, resume and cancel from the app:** any run started in the background (a button that starts the action and follows it, or code that starts it without waiting) can be paused, resumed and cancelled; ask in the chat for **Pause**, **Resume** and **Cancel** buttons. **Pause** stops new steps and items from starting; steps already running finish and nothing counts as failed. **Cancel** stops new items; steps already running finish (up to 15 minutes) and their results are dropped, and a cancelled run can't be resumed. A run started by something that waits for its result can't be paused, and a run that started before this was available can't be controlled.

## Long-running actions

Make an action **long-running** only when its work can't finish in a normal run — anything over ~25 minutes, such as a loop over thousands of items. Running in the background, on a schedule, or with pause and resume doesn't need it: every action can do that. To make one long-running, turn on **Long-running** in the action's **General** tab, or ask the chat. Turning it on or off asks you to confirm, because anything that runs the action and waits for its result stops working — it has to start the action in the background. While it's on, **Run for up to** (1–72 hours, 6 by default) appears; **Tries per step** defaults to 3 and **When a step fails** to **Pause until resumed**.

- **Limits:** a run can last up to **72 hours** (6 hours unless set otherwise). Each single step, or each item of a loop, still has to finish within **15 minutes**. An account can have at most **5 long-running runs** going at once; a paused run still takes one place, and its **Run for up to** time keeps counting.
- **Loops can run items in parallel**, up to 50 at a time: **Items at a time** on the loop node's **Loop** tab (only on long-running actions) — a number, or a value from the action's input (such as `{{input.concurrency}}`) so whoever starts the run picks it.
- **A long-running loop passes on a summary**, not each item's result: how many items succeeded and failed, and which ones failed. Each item saves its result to a table instead. (Loops in normal actions pass on every item's result.)
- **They start in the background.** The app or code that starts one gets back a run id right away and checks its status and progress (how many items succeeded, failed or are still running) instead of waiting for the result.
- **Credits:** in a long-running loop, each item counts as usage like any other step. If usage credits run out mid-run, the run waits; top up, then resume it within 24 hours.
- A cancelled or finished run can't be resumed; start a new one.
- Errors you may see: `building/troubleshooting.md` → "Long-running action and run-control errors".

## Other runtime limits

- A workflow run stops after **30 minutes**, unless it's a long-running action (above).
- **Failed steps are not retried by default** (1 try); raise **Tries per step** to retry them. Long-running actions default to 3 tries.
- Outbound HTTP requests time out after 30 seconds by default (120 at most), and private network addresses are blocked.
- Very bursty apps can hit system limits ("Exceeded system limits"). The app is briefly slowed or paused, then recovers.
