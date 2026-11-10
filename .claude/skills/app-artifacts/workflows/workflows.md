# Workflow Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating a workflow.

A workflow runs an app action when a trigger fires (schedule, webhook, etc.). Define each as `artifacts/workflows/<Name>.json` — e.g. `OnNewOrder.json`. The action it triggers must be an app action that already exists or is created in the same pass. Use **ListActions** / **DescribeActions** to get the trigger type id and the action's input shape, and copy `triggerTypeId` verbatim from that output — never write one from memory or put it together from a set and a trigger name. Sync stores a ref that matches no trigger without an error, and the workflow then never runs. Triggers are spread across sets: many products keep theirs in a set of their own, and `triggers` holds only a few. ListActionSets names the triggers in each set; `builtin` is not a set to search. To find a trigger, look for it there or call ListActions with no `actionSetIds`. A trigger missing from that full list isn't available yet — say so instead of guessing its id. Never conclude that from one set.

Before you finish, compare each new workflow's `triggerTypeId` with the one ListActions shows for that trigger, character for character. A workflow that already synced with a wrong one keeps it on edit — rename it (see **Sync** below) to recreate it with the right id.

**Referencing the target action (`actionTypeId`)** — no synced block id needed:

- **Action already in the app** (returned by ListActions with the app set): use its real `actionTypeId` verbatim.
- **Action created in this same pass** (its artifact exists but hasn't synced yet, so it has no id): reference it by the placeholder **`artifact:action:<ActionName>`** or just the bare action name. Sync creates the action first, then resolves the reference to the real block id before binding the workflow — this is the expected convention, not a hack.

A reference that resolves to neither an existing app-action id nor an action created in this pass is rejected.

## JSON schema

```json
{
  "type": "object",
  "required": [
    "name",
    "description",
    "iconName",
    "triggerTypeId",
    "triggerData",
    "actionTypeId",
    "actionInstanceInputs"
  ],
  "properties": {
    "name": { "type": "string", "description": "Workflow name" },
    "description": {
      "type": "string",
      "description": "Include the trigger, the goal, and where output is stored (table/column)"
    },
    "iconName": { "type": "string", "description": "Lucide icon name" },
    "triggerTypeId": {
      "type": "string",
      "description": "Trigger type id from AppDescribe / ListActions"
    },
    "triggerData": {
      "type": "object",
      "description": "Trigger inputs (from the trigger description). Use variables where appropriate."
    },
    "actionTypeId": {
      "type": "string",
      "description": "A no-code app action of THIS app. Use the real id from ListActions (app set) for an already-synced action, or `artifact:action:<Name>` / the bare action name for an action created in this same pass — sync resolves it to the real block id."
    },
    "actionInstanceInputs": {
      "type": "object",
      "description": "Map trigger outputs to the action inputs. Variables from inputs start with \"input.\""
    }
  }
}
```

## Notes

- The triggered `actionTypeId` must belong to the current app — not a system/built-in action.
- `actionInstanceInputs` maps trigger outputs to action inputs with variables (input-sourced ones start with `input.`). Every **required** property of the action must be set, constant or variable, or the run fails.
- The id of the user running the workflow is available as `{{input.context.userId}}`.
- **Asking a workspace member and acting on the answer** (approvals, "ship it?", "which slot?"): see [Notifications people answer](#notifications-people-answer) below.
- **Sync:** a new workflow is created, an existing one (matched by name) is updated, and removing the artifact file deletes it. An edit updates description, icon, `triggerData`, and `actionInstanceInputs` — to change the trigger type or the target action, delete and recreate the workflow. Editing `triggerTypeId` on an existing workflow does nothing (the next sync writes the stored one back into the file); renaming the workflow (its `name` and file) recreates it in one sync.

## Time-based workflows: Scheduler trigger or date trigger

Two triggers run work at a time instead of on an event. Both are built once and serve every user and every row:

- **Scheduler trigger** — the same cron for the whole app ("every night at 2am recalculate totals", "Mondays 9am email the team a summary of open tasks"). At most once per hour. One workflow per job.
- **Date trigger** — the **DataEvent** trigger with `eventType: "date"`, `dateField` (a `date` or `date-time` column of the table) and `offsetMinutes` (negative = before). Use it for a moment that belongs to a row: "email the client 1 day before `dueDate`", "remind the assignee at the task's `remindAt`", "follow up 3 days after `contactedAt`". **One workflow covers every row**: the platform keeps one pending timer per row, moves it when the date changes and drops it when the row is deleted. `filterExpression` is checked again when it fires, so "don't send once the task is done" is a filter (`item.status !== "done"`), not a cancel step. When users pick the time ("let them choose when to be reminded"), add a `date-time` column for it and point the trigger at it — the form only edits the column. Two moments for one row ("2 days before and on the day") are two date trigger workflows. Only future dates fire, up to a year ahead.

Never create one workflow per user or per row: these two already fan out.

Before you build anything time-based — a Scheduler or date trigger, a reminder, a recurring job — read the `runtime-schedules` skill: it decides what you build now and what the running app schedules for itself.

## Notifications people answer

When the answer approves a step in an agent's human loop, the answering workflow runs that step's Approve action (`agentic-apps` step 4), the same one the item's deep dive runs.

Asking a workspace member something and acting on the answer takes two pieces: an app action with a **Send Notification** node (`SendNotification`, in the `notifications` set) that asks, and a workflow on **When a notification is answered** (in the `triggers` set) that runs another app action with the answer. **DescribeActions** both before writing either.

**Who can get it:** only this workspace's admins and members — `sendTo` `people` (`recipients`: emails and/or user ids), `workspace`, or `app` (optionally narrowed by `appRoles` / `appPermission`). Never the app's end users. If the people who must answer aren't workspace members, say so and offer email or WhatsApp instead.

**The node that asks:**

```json
{
  "name": "AskApproval",
  "actionTypeId": "notifications/SendNotification",
  "input": {
    "sendTo": "people",
    "recipients": "{{LoadOrder.approverEmail}}",
    "title": "Approve order {{LoadOrder.number}}?",
    "replyOptions": "{{LoadOrder.choices}}",
    "allowTextReply": true,
    "replyKey": "order-approval",
    "replyContext": "{{input.orderId}}",
    "path": "/orders/{{input.orderId}}"
  }
}
```

- **Quick answers** (`replyOptions`): at most 4, each at most 40 characters, or the step fails. A list from data goes in as the whole value — `"{{LoadOrder.choices}}"` — so it arrives as a list and an answer with a comma in it stays one button. Don't `.join()` it: a joined string is split on new lines, or else on commas and semicolons. Fixed answers can be written one per line. When users enter the answers, cap them at 4 × 40 where they're entered.
- **Allow typed reply** (`allowTextReply`): `true`, or a whole-value `{{…}}` boolean. Each recipient answers **once** — a tapped answer _or_ typed text, never both — so "pick one and add a note" is not one answer.
- **Reply key** (`replyKey`): a fixed name for the question (`order-approval`), set identically in the answer workflow's `triggerData.replyKey`. One key per kind of question, so each answer workflow runs only for its own.
- **Reply context** (`replyContext`): exactly the id of the one record the question is about — `"{{input.orderId}}"`. It comes back as `{{input.replyContext}}` and is how the answer finds its record. Don't build it from timestamps, labels or several values to parse later; when every send needs its own record (a log of sends), insert that row first and send its id.
- **Open page** (`path`): a page of this app for that record — `"/orders/{{input.orderId}}"` — matching a route in `src/routes` (here `src/routes/orders/[orderId].tsx`). Clicking the notification opens that page on the web, from desktop alerts and in the mobile app alike; a path the app doesn't have opens its home page. Leave `openTarget` at its default (this app).
- Node outputs: read each upstream node's `output` in DescribeActions before using its fields — e.g. a table get-one node returns the row's columns directly (`{{LoadOrder.number}}`, no `.item`).

**The answer workflow:**

```json
{
  "name": "OnOrderApprovalAnswered",
  "description": "When an order-approval notification is answered, records the decision, note and who answered on that order (Orders.status, note, answeredBy).",
  "iconName": "message-square-reply",
  "triggerTypeId": "<the id ListActions shows for When a notification is answered>",
  "triggerData": { "replyKey": "order-approval" },
  "actionTypeId": "artifact:action:RecordOrderApproval",
  "actionInstanceInputs": {
    "orderId": "{{input.replyContext}}",
    "answer": "{{input.answer}}",
    "typedText": "{{input.text}}",
    "answeredBy": "{{input.repliedBy.userId}}",
    "answeredAt": "{{input.repliedAt}}"
  }
}
```

- What it receives: `answer` (the tapped answer or the typed text — always set), `value` / `label` (the tapped answer; null for a typed one), `text` (what they typed; null for a tapped one), `replyContext`, `replyKey`, `repliedBy.userId` (a **number** — the workspace user id, not an email), `repliedAt`, `notificationId`. A null arrives as empty, so make inputs fed from `value`, `text` or `replyContext` optional.
- An empty `replyKey` on the trigger runs it for every answer to any of this app's notifications.
- Sent to several people, it runs once per person who answers. If only the first answer should count, have the action skip a record that is no longer pending.

**Testing it:** you can't answer a notification yourself. Once the actions exist on the platform (a later turn, or after `sync_app`), you can run the answering action with **ExecuteAction**, giving it what the trigger would pass, and delete any test row it writes. The real test is the user sending one and answering it (from the bell, a desktop alert or the phone) — tell them how. Answers only run the **live** app's workflows: when `sync_app` is in your tools you are editing a draft, so tell the user answers start working once they make it live. When the user says an answer did nothing, **GetActivityLog** for the answering action; if it never ran, check the workflow's `triggerTypeId` (against ListActions) and its `replyKey` (against the asking node's) before anything else.
