# Builder credits and usage credits

Blocks has **two separate allowances**:

- **Builder credits** — spent on messages to Ella (building and changing apps). Charged to the account. When they run out, you can't send Ella more messages; apps keep running.
- **Usage credits** — spent on apps running: AI steps, integrations, emails, workflows, data writes, etc. Charged to the account that owns the app, even when end users trigger it. When they run out, app actions stop until credits renew or the plan is upgraded. A long-running action stops mid-run too, and can be resumed within 24 hours once credits are back (`building/logic-world.md`).

## What one message to Ella costs

- **0.5** builder credit for every completed message.
- **+0.5** if the message changed the app.
- **+1** more if it changed the app's code.
- So one message costs **0.5 to 2** credits.
- Messages that don't change the app — questions and planning — always cost 0.5. In the mobile app's chat, that is every **Ask** and **Plan** message.
- **Stopped and failed messages are free.**
- Message length, model and effort setting don't change the cost.
- Using your own Claude key doesn't exempt messages from builder credits (`building/chat-settings-and-own-key.md`).
- Duplicating some templates may cost builder credits.

## What uses usage credits

- **Priced by what they consume:**
  - AI steps and agents (by model and length)
  - agent eval runs: the agent's answer to every test case and the grading of it, both by model and length. The agent's tools also run for real during an eval and are charged like any other run.
  - image, video and GIF generation
  - AI web search and deep research
  - voice calls and cloud browser time
  - SMS, email and e-signatures
- **Small fixed amounts:**
  - each integration action
  - each workflow run and code step
  - each found contact in people search
  - data writes (per 10 rows inserted, updated or deleted)
- **Free:** viewing pages, logging in and reading data.
- **Scheduled workflows use credits even when nobody is using the app.**
- **Don't estimate exact credit costs for the user.** Costs vary by action and model. To estimate a month, use the app normally for a day, check **Account → Usage**, and multiply.

## When credits renew

- On paid plans, **both allowances renew on the 1st of each calendar month** (UTC), not on the billing date.
- **Unused credits don't roll over.**
- The **Free plan doesn't renew**: its credits are a one-time allowance, possibly with a small daily builder allowance.
- Upgrading mid-month: the new plan's monthly allowance applies immediately, minus what you've already used this month, so the balance goes up by the difference. Credits don't stack on top.

## Getting more credits

- **Upgrade**: a bigger **credit tier** or plan via **avatar menu → Upgrade** on the web (the mobile app only shows credit usage). You can upgrade for an intensive build month and move down later; moving down goes through support and takes effect next cycle.
- **There are no one-off credit packs or top-ups to buy.** Older help pages that mention top-ups are out of date.
- **Share & earn** (avatar menu): each successful referral gives **bonus builder credits**. They don't expire and are used after the monthly allowance runs out.
- Anything else, such as a goodwill grant after a problem, is support's decision. Never promise credits.

## Seeing usage (account admins)

- **Account → Billing**: the current plan, builder and usage meters ("Resets on the 1st of each calendar month"; on paid plans a line under **Usage** says monthly credits reset on the 1st of each calendar month, not on the billing date), bonus credits and **View usage**.
  - On paid plans (not the Free plan or a trial), from the 4th of the month a line under the **Usage credits** meter projects the month at the month's average daily pace so far: "about X of Y used by <last day>", or, when that pace would use them all, a warning with the day usage credits run out and the 1st they reset. It's a straight-line estimate, not a promise; usage that grows or drops changes it. To stretch credits, see "Unexpected usage" below.
- **Account → Usage**: **Builder credits by app** (the builder credits each app's building and duplication cost) and **Usage credits by app**, expandable per action.
- **Why Billing and Usage can show different builder numbers:** the **Billing** meter (what decides when building stops) counts only what came out of the plan's allowance. **Usage** counts every builder credit spent, so it also includes builder credits paid from **bonus builder credits** (shown separately on Billing as **From referrals**) and the part of the last message that went past the allowance when it ran out. Usage's days also follow the viewer's time zone, while allowances reset on UTC days and months.
- **Account → Usage**, analytics edition [flag: usage-analytics]: replaces the page above when on.
  - Top row: **Usage credits** / **Builder credits** switch (each with its total) and a range picker (**Today**, **Last 7 days**, **Last 30 days**, **This month**, **Last month**, **Last 90 days**, **Last 12 months**, or a custom range of up to a year), plus **Hourly / Daily / Weekly / Monthly** buckets where the range allows. Days and hours are in the viewer's time zone.
  - Headline numbers compared with the previous period of the same length, and the plan's allowance with where this month's pace leads.
  - **Over time** chart (select a bar to zoom into that day, week or month) and **What stands out**: the change, spikes, which app drove it, where usage concentrates, the busiest time. **Show** or **Zoom in** applies that view.
  - **Where credits go**: split by **Apps**, **Workflows**, **Categories**, **Event types**, **Models**, **Members**, **Agents** or **Runs** (builder credits: apps, members, models and event types). Select a row to filter to it and split it further; the filters show as chips under **Showing only**. **Export CSV** downloads the table.
  - **When credits are spent** (weekday × hour) and **Events**: every charged event, newest or **Most credits** first, with **Export CSV**. Selecting an event from a workflow run opens the whole run step by step.
  - The view is in the page address, so a link to it opens the same view for another admin.
- Members can't see billing or usage; an admin has to check.

## Running out

**Builder credits**:

- Ella shows **"You're out of builder credits"** before doing anything.
- Options shown: **Upgrade** (a bigger tier), **All plans**, or **Contact Us**.
- Your apps keep working.

**Usage credits**:

- New app actions and workflows are refused with "Not enough credits", for builders and **for the app's users**.
- The first refusal of each day (UTC) sends every admin and member of the workspace an **Out of usage credits** notification, under the bell on the web and in the mobile app, with a credit-card mark on the app's tile. It also shows in the bell of the app whose action was refused; later refusals that day, in any app, send nothing more. It alerts on desktop and phones as the **Credits** kind in notification settings allows (`navigation/notifications.md`). Someone who muted that app gets nothing that day; with **Bell only** it shows in the bell without an alert.
- An admin's opens **Plans** and says to upgrade. A member's opens the app (nothing, when the refused action ran outside an app) and says actions resume when credits renew or an admin upgrades; on the Free plan it says an account admin has to upgrade the plan.
- It says when credits come back on their own: on the 1st when the monthly allowance ran out, tomorrow when a daily cap did. On the Free plan the credits don't renew, so only an upgrade brings them back. The app's end users get nothing — their buttons just fail.
- **Agents stop taking new messages** too, in the app's chat, on channels (WhatsApp, email) and on schedules. An answer already being written finishes, and a background task the agent started still reports its result. Answering the agent's question or approving its action waits until credits are back; the request stays open.
  - In the chat, a builder of the app sees "This account is out of usage credits, so the agent can't answer. An account admin can upgrade the plan."
  - Everyone else (the app's users and public visitors) sees only "This agent is unavailable right now. Please try again later.", with nothing about billing.
  - A workflow step that messages an agent fails with "Not enough credits".
  - A refused agent message doesn't send the **Out of usage credits** notification on its own; that comes from a refused action or workflow.
- Pages still load and data can still be read, but buttons that run actions fail.
- Nothing is lost; everything resumes when credits renew or after an upgrade.

## Unexpected usage: what to check (support's usual findings)

1. **Frequent schedules running AI steps** (hourly or daily agents). Lower the frequency, or replace AI with code or visual steps.
2. **AI used for arithmetic, sorting or copying data** across a table. Use a code step.
3. **Loops**: every item is a separate run. Loop inside one code step instead.
4. **An agent that can call itself** (its own action listed as one of its tools). It loops.
5. **Deep-research search** used where a quick search would do.
6. **Large data imports**: every 10 rows written counts.

**Account → Usage → Usage credits by app** shows which app and action is responsible. With the analytics edition [flag: usage-analytics], **Where credits go** → **Workflows**, then **Runs**, narrows it to the exact workflow and run, and **Events** → **Most credits** lists the most expensive single steps.
