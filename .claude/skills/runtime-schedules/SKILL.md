---
name: runtime-schedules
description: Anything time-based in an app — reminders, follow-ups, recurring jobs, digests, "every Monday", "in 3 days", "before the due date", "remind me". Load this BEFORE you add a Scheduler or date trigger workflow, a ScheduleAction / UpdateSchedule / CancelSchedule / ListSchedules node, or an agent's `allowSelfScheduling`. It picks between a Scheduler trigger, a date trigger on a row's date, a runtime schedule, and an agent's own reminders.
user-invocable: false
---

# Scheduling: which mechanism

There are four. Most time-based needs fit the first two, which you build now and which then cover every user and every row by themselves; the last two are created by the running app. Go down this list and **take the first that fits**:

1. **The same cadence for the whole app, known now** → a **Scheduler trigger workflow** (cron).
   "Every night at 2am recalculate totals", "Mondays 9am email the team a summary of open tasks". One workflow per job.

2. **A moment that belongs to a row: a `date` / `date-time` column, or a fixed offset from one** → a **DataEvent date trigger workflow** on that table (`eventType: "date"`, `dateField`, `offsetMinutes`).
   "Email the client 1 day before `dueDate`", "remind the assignee at the task's `remindAt`". One workflow covers every row: it follows date edits and deletes by itself, and its `filterExpression` (checked again at fire time) handles "not once it's done". When users pick the time, **add a `date-time` column** and use this trigger. Details: "Time-based workflows" in `app-artifacts/workflows/workflows.md`.

3. **A recurring cadence someone picks while the app runs, or a moment that is not a date on a row** → **runtime schedules**: an app action with a **ScheduleAction** node (+ **UpdateSchedule** / **CancelSchedule**), plus what calls it (a button, a settings form, or a workflow on another trigger).
   "Let each user choose their weekly digest day and time", "an admin sets the report time in settings", "while this subscription is active, check it every Monday", a one-off run more than a year ahead. Store the returned `scheduleId` so the app can move or cancel it, and wire **every** path that changes or ends it (edit, complete, delete) to UpdateSchedule / CancelSchedule — nothing does that for you here.

4. **An agent following up in its own conversation** → `"allowSelfScheduling": true` on the agent (below). Nothing else.
   "Remind me tomorrow", "check in with me every Monday", "ping me in two hours if I haven't replied" — said **to the agent**.

Rules that follow from it:

- **Prefer a date trigger over ScheduleAction whenever the time is, or can be, a date on a row.** The trigger follows the column and the row for free; ScheduleAction makes you store a `scheduleId` and wire every edit, completion and delete by hand, and counts against the 500-per-app limit — one schedule per row does not scale.
- **Don't use ScheduleAction for a fixed app-wide cadence.** Nothing would create the schedule at runtime; that is a Scheduler trigger workflow.
- **Don't create a workflow per user or per record.** A Scheduler or date trigger workflow already serves every user and every row; a recurring cadence that differs per user is a runtime schedule.
- **Never create a runtime schedule at build time.** You build what lets the running app (its users, its triggers, its agents) create them. Don't run ScheduleAction with ExecuteAction to set one up: schedules made while testing a draft run against that draft and are deleted when the draft is published or discarded.
- Scheduler triggers and runtime schedules run at most **once per hour**.

## The app schedules its own actions (ScheduleAction)

The schedule nodes are catalog actions in the `utils` set, used as nodes inside an app action (DAG). **DescribeActions** them before use:

- **ScheduleAction** — run one of this app's actions later: once at `runAt` (ISO-8601 date-time with an offset) **or** repeatedly on a 5-field `cron` (+ optional IANA `timezone`, `endAt`). Takes the `actionBlockId` of the app action to run and its `input`. Returns `scheduleId` and `nextRunAt` — store `scheduleId` where the app keeps what it scheduled (e.g. a `digestScheduleId` column on the user's preferences row) so it can change or cancel it later.
- **UpdateSchedule** — reschedule, rename, pause/resume (`paused`) or change the `input`, by `scheduleId`; omitted fields keep their value. A one-time schedule stays one-time (a new `runAt`) and a recurring one stays recurring (a new `cron`); to switch, cancel it and schedule a new one.
- **CancelSchedule** — stop it for good, by `scheduleId` (e.g. when the user turns the digest off or the subscription ends).
- **ListSchedules** — the app's active and paused schedules, optionally for one `actionBlockId`.

These are **runtime operations**: they create no blocks, workflows or triggers, and the scheduled action must already exist as an app action. Each fire runs the action as the user who scheduled it and costs credits like any run; the limit is 500 active schedules per app. Builders see and cancel them in the app's **Settings → Schedules**.

## The agent schedules its own follow-ups (`allowSelfScheduling`)

Set `"allowSelfScheduling": true` in the agent file (`app-artifacts/agents/agents.md`) when the agent should follow up **later on its own**. The agent then gets runtime tools to schedule a one-time reminder or a recurring check-in (at most hourly), list them and cancel them. When one fires, the agent is messaged back — by default **in the same conversation** (the in-app chat thread of a signed-in user, or the WhatsApp/email thread it was talking on), or, when the agent chose it for a standalone recurring job, in a **new conversation** each time — and replies there like any other turn; an in-app user also gets an inbox notification. The agent picks the mode itself when it sets the reminder; there is nothing to configure. The limit is 20 active reminders per conversation.

The flag is the whole setup: don't add a Scheduler trigger, a workflow or a tool to emulate it. Off by default; it is also editable on the agent page, so omitting the key keeps the stored value.
