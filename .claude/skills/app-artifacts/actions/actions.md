# Action Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating/updating/deleting an action.

Define backend logic as JSON files under `artifacts/actions/<Name>.json` — one file per action, e.g. `ProcessOrder.json`. Both `type: "dag"` (visual workflow) and `type: "code"` (Lambda TypeScript) are supported. On sync these become real action blocks. The name is globally unique and is not suffixed with "Action". After writing or changing action artifacts, run **`pnpm gen:types`**.

## Discovery — do this before writing any action

Call **ListActionSets** to discover the available action sets, then **ListActions** with the set ids you need (or omit to list all) to see what already exists. Action and schema shapes are not guessable.

- **DAG action (`type: "dag"`):** also call **DescribeActions** for every built-in action type you will use as a node — `actionTypeId` values and node input schemas come only from those describes.
- **Code action (`type: "code"`):** first confirm via ListActions that no built-in integration or DAG of built-ins can do the job. Load the **`integrations`** skill when the action needs OAuth or secrets. Also call **DescribeActions** for every built-in action type you will invoke from the code.

## Integrations

- Many built-in actions belong to integration action sets (Gmail, Slack, Google Calendar, Stripe, …). Pass that integration's `actionSetIds` to **ListActions** to discover its actions.
- If the user didn't name a specific integration, use the built-in/app actions that already fulfill the need rather than introducing a new integration.
- **Ambiguous service → ask first.** "Email" could be Gmail or Outlook; "calendar" could be Google or Outlook. Ask the user to pick before building around one.
- Load the **`integrations`** skill before creating integration-backed or code actions that need OAuth or secrets.
- LinkedIn profile/company/picture/URL lookups do **not** require the LinkedIn integration.

## Choosing action type: DAG strongly preferred over code

Evaluate top-to-bottom; stop at the first match:

1. **CRUD / data / notifications / integrations** (GetItems, InsertItems, UpdateItems, DeleteItems, SendEmail, Slack, HTTP, …) → **DAG** with built-in action nodes. This is the default for the vast majority of actions.
2. **LLM / agent / reasoning / "AI that uses tools" / context-dependent decisions** → **DAG**, never a code action: a **SendAgentMessage** node (preferred) or an **AgentCall** node — see [Agent calls](#agent-calls-ai--reasoning-sendagentmessage-vs-agentcall) below.
3. **Custom external API with no built-in integration** → **code** action — last resort only, after confirming via ListActions that no DAG can do the job.

Never create a code action for CRUD, LLM/agent calls, emails/notifications, or anything a DAG of built-ins can do.

## DAG action JSON schema (`type: "dag"`)

```json
{
  "type": "object",
  "required": [
    "name",
    "type",
    "description",
    "iconName",
    "inputSchema",
    "output",
    "exposedToUI",
    "actionNodes",
    "edges"
  ],
  "properties": {
    "name": { "type": "string", "description": "Unique action name" },
    "type": { "const": "dag" },
    "description": { "type": "string" },
    "iconName": {
      "type": "string",
      "description": "Lucide icon name (e.g. send, mail, database)"
    },
    "exposedToUI": {
      "type": "boolean",
      "description": "true only if the UI must call this action"
    },
    "inputSchema": {
      "type": "object",
      "description": "JSON Schema for action input. EVERY {{input.X}} used in any node must be declared here. Use required/default as needed."
    },
    "output": {
      "type": "string",
      "description": "Name of the node whose result is the action output"
    },
    "execution": {
      "type": ["object", "null"],
      "description": "Optional settings for a DAG action (not code actions) — see Execution settings below. Omit for defaults; null clears; {} means \"has settings, all defaults\".",
      "properties": {
        "retry": {
          "type": "object",
          "properties": {
            "attempts": {
              "type": "number",
              "description": "Tries per step, 1–10. Default 1 (3 when mode is durable)."
            }
          }
        },
        "onFailure": {
          "enum": ["pause", "fail"],
          "description": "When a step still fails after its tries: pause the run for a resume (up to 24 hours), or fail it at once. Default \"fail\" (\"pause\" when mode is durable)."
        },
        "mode": {
          "const": "durable",
          "description": "Long-running — see Long-running actions below. Omit for normal actions."
        },
        "maxDuration": {
          "type": "string",
          "default": "6h",
          "description": "Total run budget, \"1h\"–\"72h\". Only with mode \"durable\"."
        }
      }
    },
    "actionNodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "actionTypeId", "input"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Node name — must be globally unique in the app (do not reuse other action, node, or system action names)"
          },
          "actionTypeId": {
            "type": "string",
            "description": "From ListActions/DescribeActions. To call another app action created in this same pass (not yet synced, so no id), reference it by `artifact:action:<Name>` or the bare action name — sync resolves it to the real block id."
          },
          "input": {
            "type": "object",
            "description": "Node input; use {{input.X}} or {{PreviousNodeName.field}} variables"
          },
          "forEach": {
            "type": "object",
            "required": ["items"],
            "properties": {
              "items": {
                "type": "string",
                "description": "Array variable to iterate, e.g. {{input.orders}}"
              },
              "itemVariable": { "type": "string", "default": "item" },
              "indexVariable": { "type": "string", "default": "index" },
              "onError": {
                "enum": ["fail", "continue"],
                "default": "fail",
                "description": "When an iteration fails: fail the node or continue"
              },
              "concurrency": {
                "type": ["number", "string"],
                "default": 1,
                "description": "Items run in parallel (1–50): a number, or a variable such as {{input.concurrency}} resolved per run. Long-running actions only; ignored otherwise."
              }
            }
          },
          "retry": {
            "type": "object",
            "description": "Override the tries for this node (applies when the action has `execution`); { \"attempts\": 1 } disables retries for non-idempotent steps.",
            "properties": { "attempts": { "type": "number" } }
          }
        }
      }
    },
    "conditionNodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "conditionExpression"],
        "properties": {
          "name": { "type": "string" },
          "conditionExpression": {
            "type": "string",
            "description": "Expression WITHOUT {{}}, e.g. input.amount > 100 (boolean) or input.status (switch)"
          }
        }
      }
    },
    "mergeNodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "waitMode": { "enum": ["all", "first"], "default": "all" },
          "inputMapping": {
            "type": "object",
            "description": "{ field: \"{{NodeA.result}}\" }"
          }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "source", "target"],
        "properties": {
          "name": { "type": "string" },
          "source": { "type": "string", "description": "Source node name" },
          "target": { "type": "string", "description": "Target node name" },
          "label": {
            "type": "string",
            "description": "Required for edges from condition nodes: true/false or a switch value"
          }
        }
      }
    }
  }
}
```

### Graph entry points

There is no start or end node. Nodes with no incoming edges are the entry points; multiple entry nodes run in parallel automatically. Never invent pseudo-nodes like `__start__`/`__end__` in edges — every edge `source`/`target` must be the name of a declared node (action, condition, or merge), or the sync rejects the whole action.

**Run order comes only from `edges`** — the order of `actionNodes` in the array means nothing. A node that reads `{{X.*}}` needs a chain of edges from `X` to it; with none, it starts at the same moment as `X` and reads an empty value. So a multi-node DAG always has edges, one per step that hands output to the next:

```json
{
  "actionNodes": [
    {
      "name": "LoadOrder",
      "actionTypeId": "<from DescribeActions>",
      "input": { "orderId": "{{input.orderId}}" }
    },
    {
      "name": "RenderPdf",
      "actionTypeId": "<from DescribeActions>",
      "input": { "html": "{{LoadOrder.html}}" }
    },
    {
      "name": "SaveUrl",
      "actionTypeId": "<from DescribeActions>",
      "input": { "orderId": "{{input.orderId}}", "url": "{{RenderPdf.url}}" }
    }
  ],
  "edges": [
    { "name": "load-to-render", "source": "LoadOrder", "target": "RenderPdf" },
    { "name": "render-to-save", "source": "RenderPdf", "target": "SaveUrl" }
  ],
  "output": "SaveUrl"
}
```

## Execution settings

Every DAG action can carry an `execution` object (code actions can't). `retry.attempts` (1–10) is the tries per step: default 1, or 3 on a long-running action. `onFailure` is `"fail"` (default; the run fails at once) or `"pause"` (default on a long-running action). A node's own `retry` overrides the tries for that step on any action that has `execution` — set `"execution": {}` (or any setting) on the action when you give a node its own `retry`. `null` clears the settings; `{}` means "has settings, all defaults". A sub-action called as a step runs under the **calling** run's settings (its tries, `onFailure` and time limit); the sub-action's own `execution` is ignored when it runs as a step (a long-running one can only be a step of a long-running action — see **Async only** below).

- **Retries:** with more than 1 try (exponential backoff) a step may run more than once — make steps idempotent (upsert or check-before-write on the item's natural key). For a step that must not repeat (sending an email, charging a card) set `"retry": { "attempts": 1 }` on that node. Every step of every run gets `context.idempotencyKey` in a code action: the same value on every attempt of one step or loop item, including after a retry — store it with the side effect (or pass it to an API's idempotency header) and skip work already done.
- **`onFailure: "pause"`** (any action): a step that still fails after its tries — or a loop that stops (`CREDITS_EXHAUSTED` too) — waits up to 24 hours for a **resume** instead of failing. Resume re-runs only what failed and carries on; everything that already succeeded stays done. With no resume within 24 hours the run fails. `"pause"` does not apply when something waits synchronously on the run's result (a code action's `invokeAction` / `invoke_action`, or the platform's synchronous run endpoint): a failing step then fails the run at once. `useExecuteAction` (both `executeFunction` and `executeBackgroundRunFunction`) and `invokeActionAsync` start background runs and are not affected (with `"pause"`, an `executeFunction` call keeps waiting while the run waits for a resume; `executeBackgroundRunFunction` returns at once). On a normal action the run can then last up to 24.5 hours in total (wall clock, waiting included) while each step keeps its normal time limit. A normal loop pauses per item: the failed item waits, resume re-runs only that item, and the loop still returns every item's output in order. While waiting, the run's status lists what waits in `awaitingRetry` (`useActionRun` exposes `canResume`; `resume()` continues the same run). When users should be able to retry failed items, use `"pause"`, keep the default loop `onError`, and give the UI a **Resume** button wired to `useActionRun`'s `resume`, shown while `canResume`, rather than `"continue"` plus a code action that starts a new run with the failed items.
- **`onFailure: "fail"`:** a step that still fails after its tries fails the run at once (`LOOP_ITEM_FAILED` for a loop). Use it when nobody will resume — a scheduled job that simply runs again next time, or a run whose caller only checks the final status. Per loop, `onError` still chooses between stopping on a failed item and continuing past it.
- **Run control for every run started in the background** (`useExecuteAction`'s `executeBackgroundRunFunction` / `useActionRun`, or a code action's `invokeActionAsync`): status (`status`, `awaitingRetry`, `paused`, `pausable`), `pause()`, `resume()`, `cancel()`. `pause()` stops starting new steps and loop items until a resume; what is running finishes, and nothing fails or uses up tries. Never build a pause from a "pause requested" column that a step checks and throws on — that marks items failed and burns their tries. `cancel()` stops starting new items; steps already running finish (≤ 15 min); a cancelled or ended run can't be resumed. A run started with a synchronous call (something waits on its result) can't be paused (`RUN_NOT_PAUSABLE`); a run started before this update can't be controlled (`RUN_NOT_CONTROLLABLE`).
- **UI hooks do the control themselves** — never write a code action just to start, check, pause, resume or cancel a run; write one only when that step also needs server-side logic. See the **blocks-client** skill, `actions-and-files.md`.

## Long-running actions

A normal action run is capped at 30 minutes. For work that runs longer — an estimated total runtime over ~25 minutes — set `"execution": { "mode": "durable", "maxDuration": "6h" }` on the DAG action (`maxDuration` only with `mode: "durable"`). Estimate it as items × time per item: 50 emails take seconds; 2,000 LLM calls at ~10 s each take ~5.5 hours.

**Use long-running mode only when the work genuinely can't fit a normal run** (an estimated total runtime over ~25 minutes). Running loop items in parallel is only available here, but it is a way to fit long work, not a reason on its own: a loop that finishes within 30 minutes one item at a time stays in a normal action. Running in the background is not a reason either: any action can be started in the background — from the UI with `executeBackgroundRunFunction`, from a code action with `invokeActionAsync`, or by a scheduled workflow — and gets status, pause, resume and cancel without being long-running. Never for an action the UI or another action calls and waits on, or one whose per-item results feed the next node: long-running actions are async-only, their loops return a summary instead of the items' outputs, and each run takes one of the account's 5 long-running slots. When unsure, use a normal action — pausing on failure and tries are available there too.

- **Limits:** `maxDuration` `"1h"`–`"72h"`; each step (one node, or one loop item) still runs ≤ 15 minutes — split per-item work so a single item fits. At most 5 long-running runs active per account (`DURABLE_RUN_LIMIT`).
- **Loops:** put the per-item work on a `forEach` node and set `forEach.concurrency` (1–50) to run items in parallel. When the parallelism is chosen per run (a UI worker-count picker, a per-customer limit), set `"concurrency": "{{input.concurrency}}"` and pass the number in the action's input — one action, never one copy per width. `onError: "continue"` finishes the loop and reports the failed items; `"fail"` (default) stops starting new items and, with `onFailure: "pause"`, parks the run for a resume.
- **A long-running loop returns a summary, not the items' outputs:** the next node gets `{ total, succeeded, failed, failedItems: [{ index, error }] }` (at most 100 listed). Have each item **write its result to a table** (an InsertItems/UpdateItems node in a sub-action, or the code action itself) and read the table afterwards — never chain `{{Loop[3].x}}` after a long-running loop. Loops in normal actions still return every item's output.
- **Async only:** a long-running action cannot be invoked synchronously — a sync call, or using it as a node inside a normal action, fails with `DURABLE_REQUIRES_ASYNC`. Start it from the UI with `useExecuteAction`'s `executeBackgroundRunFunction` and follow it with `useActionRun`, from a workflow trigger, or from a code action with `client.invokeActionAsync` (see the **backend-code-actions** agent).

## Code action JSON schema (`type: "code"`)

```json
{
  "type": "object",
  "required": [
    "name",
    "type",
    "description",
    "iconName",
    "inputSchema",
    "outputSchema",
    "secrets",
    "exposedToUI"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique action name (same as the artifact filename without .json)"
    },
    "type": { "const": "code" },
    "description": {
      "type": "string",
      "description": "What the action does. Include trigger/context and where output is stored (e.g. table/column) when relevant."
    },
    "iconName": {
      "type": "string",
      "description": "Lucide icon name (e.g. code, globe, send). Must exist in the Lucide set."
    },
    "exposedToUI": {
      "type": "boolean",
      "description": "true only if the UI calls this action; false for backend/workflow-only actions"
    },
    "inputSchema": {
      "type": "object",
      "description": "JSON Schema for action input. Declare every field the invoke function reads. Use required/default as needed."
    },
    "outputSchema": {
      "type": "object",
      "description": "JSON Schema describing the action output (shape returned from invoke)"
    },
    "secrets": {
      "type": "array",
      "description": "App secret names available to the action at runtime via context.secrets. Use [] when none.",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Secret name (e.g. MY_API_KEY). Must exist in app secrets or integrations."
          }
        }
      }
    },
    "browsingTask": {
      "type": "boolean",
      "description": "Optional. Set true when the action browses/scrapes web pages. Runtime provides Playwright + Browserbase (and optionally Stagehand) via the third invoke argument."
    },
    "memoryMb": {
      "type": "number",
      "description": "Optional. Lambda memory in MB. Defaults to 512. Raise (e.g. 2048) for memory-heavy work such as spreadsheet parsing or large files. Clamped to 128–10240."
    }
  }
}
```

### Example code action artifact

`artifacts/actions/FetchPageTitle.json`:

```json
{
  "name": "FetchPageTitle",
  "type": "code",
  "description": "Fetches a page title from a URL passed in input.url",
  "iconName": "globe",
  "exposedToUI": false,
  "inputSchema": {
    "type": "object",
    "required": ["url"],
    "properties": {
      "url": { "type": "string", "description": "Page URL to fetch" }
    }
  },
  "outputSchema": {
    "type": "object",
    "required": ["title"],
    "properties": {
      "title": { "type": "string" }
    }
  },
  "secrets": [],
  "browsingTask": true
}
```

### After creating the artifact

1. Run **`pnpm gen:types`**.
2. Implement **`code-actions/<ActionName>/code.ts`** (delegate to **backend-code-actions**). That agent bundle-validates with **`pnpm bundle:action <Name>`** until it passes, and can unit-test offline with **`pnpm test:action <Name>`** (mocked `BlocksClient`, no deploy).
3. Deploy is automatic when the app syncs after your turn — there is no deploy step for you to run.

## Variables (DAG node inputs & condition expressions)

- Always double braces: `{{ ... }}`. Inside must be a single valid JS expression (no statements/assignments). Valid: `{{input.name}}`, `{{GetOrders.orders}}`, `{{input.amount > 100}}`, `{{new Date().toISOString()}}`. Forbidden: `const`/`let`/`var`, IIFEs, multi-statement, assignment, undefined globals. Do not escape braces (`{{{{...}}}}`).
- Sources: `input.*` (declared in inputSchema) and `UpstreamNodeName.*` (output of a node upstream of this one through `edges`, by literal node name — see [Graph entry points](#graph-entry-points)). Don't mix them up.
- Reference an upstream node's fields exactly as its `output` in **DescribeActions** shows them — don't assume a wrapper. A table get-one node returns the row's columns directly (`{{LoadOrder.status}}`, not `LoadOrder.item.status`); get-all, insert and update nodes return `{{X.items}}`. (`{{input.item}}` is a data trigger's row, in workflow inputs only.)
- A value that is exactly one `{{…}}` keeps its type — a list stays a list, a boolean a boolean (`"replyOptions": "{{LoadPoll.options}}"`, `"allowTextReply": "{{LoadPoll.allowNotes}}"`). Text around it, or a `.join()`, turns it into a string.
- Condition expressions use no braces: `input.amount > 100`, `input.status`.
- Every required property of a node's action type must be set (constant or variable).

### One expression, not a function body

Immediately-invoked function expressions and user-defined arrow functions are not supported and fail at runtime with: `User-defined arrow functions (IIFE) are not supported`. You cannot declare locals (`const`/`let`), write `return`, or chain statements to compute a value. Array-method callbacks like `.map(p => p.id)` are fine — the ban is on wrapping a whole computation in a function to get statements plus a `return`.

For logic that complex, in order of preference:

1. **Break it into DAG nodes** — each step (filter, join, aggregate) as its own action node referencing the previous node's output.
2. **Compose one expression** — chain `.filter(...).map(...).reduce(...)` and use ternaries instead of `if`/`return`.
3. **Use a code action** (`type: "code"`) — last resort, where real multi-statement TS lives in `code-actions/<Name>/code.ts`.

## Actions and the UI

The UI code already has direct data operations (insert/update/delete/query) for every table, so don't create actions whose only purpose is CRUD from the UI, nor actions for user operations and role changes (handled in the UI/platform). The exception is a step a person takes on an agent's work item that waits on them (approve, reject, take over, cancel): always an app action, because it clears the wait too (`agentic-apps` step 4). Create actions for genuine backend logic: integrations, notifications, AI/agent calls, multi-step orchestration, scheduled/triggered work, or anything the UI cannot do directly.

The UI can call only **app** actions (those in this app) — system/built-in actions are not callable from the frontend and will fail — so any backend capability the UI needs must exist as an app action (DAG or code). Set `exposedToUI: true` only for actions the UI calls; backend/workflow-only actions stay `false`.

Every workflow and code action an agent can call as a tool carries `toolEffect` (`"read-only"`, `"mutation"` or `"destructive"`). Read the `agent-tool-approval` skill for which to set, and set it whenever you create or edit an action; keep an existing one.

## Agent calls (AI / reasoning): SendAgentMessage vs AgentCall

Two DAG nodes add AI to an action:

- **SendAgentMessage (preferred).** Sends a message to a **named agent already defined in the app** (an artifact under `artifacts/agents/`, see the **`agents`** skill), automatically loading all of its configuration — instructions, tools, memory, knowledge, skills, harness. Always prefer an agent + SendAgentMessage over a bare LLM call unless the task is certainly very simple; the same agent is reusable from multiple actions and from an agent-chat. **Create the agent artifact first**, then reference it from the node — SendAgentMessage resolves the agent by name, so until it exists the node has nothing to call.
  - **Showing a SendAgentMessage answer as a chat component.** Only when the user asks for it (e.g. "show the report as a card"): create the chat component first (see the **chat-components** agent; tell it the component displays a SendAgentMessage answer, so its `input` is an object schema of the whole answer), then set the node input `chatComponentBlockId` to the component's name. Its `input` props schema becomes the node's output schema, so leave `structuredOutputJsonSchema` unset. The answer then renders with that component when the thread is opened in the app's agent chat. The component must not be a `userInterrupt` component.
- **AgentCall (simple LLM call).** A single `AgentCall` node inside a DAG action, for a one-off LLM call with no reusable persona, tools, or memory.

Both nodes:

- **Provide everything the agent needs**: all required `tools` (action type ids) and a comprehensive prompt with full context and a clear goal. An agent expected to write to a table fails without a table-write tool, and a backend-triggered call with no tool to store or send its result loses that result — nothing reads the textual output. (With SendAgentMessage, the agent's own configured tools also apply.)
- **Files** go in the node input's `files` array (e.g. `"files": [{ "url": "{{input.fileUrl}}" }]`). Passed any other way the model never sees them and the action fails.
- **Performance:** an AI call can take up to ~1 minute, so never run one on page load. Prefer plain UI JS (or simple data ops) for calculations and CRUD. For slow or expensive AI work, run it from a background trigger (Scheduler/DataEvent workflow) and persist results to a table; let the user refresh, or refresh based on result age.

To let the running app schedule one of its actions (per user, per record, or from a settings form), read the `runtime-schedules` skill: it covers ScheduleAction, UpdateSchedule, CancelSchedule and ListSchedules.

## Document / PDF generation

When the app generates document PDFs (quotes, invoices, receipts, statements) that users preview, download, or email, **load the `document-generation` skill** — it covers the DAG pattern, WeasyPrint constraints, logo handling, and anti-patterns.

## Files handling

Internal file URLs are not accessible outside the system. When a file URL is sent to the outside world (email body, upload to a drive, PDF logo/image, etc.), generate a signed URL first (GenerateFileSignedUrl) and use that instead of the internal URL.

## Update & delete

- **Update:** write the artifact with the **same name** as an existing action → updated in place (editAction/editCodeAction), not duplicated. **Keep the file's existing `usageDescription`** — the frontend agent owns that field (it records where users trigger the action), and rewriting the artifact without it drops the text.
- **Removing or renaming a node in a DAG:** the graph is only valid when every edge's `source` **and** `target`, and `output`, name a node still in `actionNodes`/`conditionNodes`/`mergeNodes`. So in the same edit: drop every edge that **enters or leaves** the removed node (filtering only the edges it is the `source` of leaves the edge into it, or the one from it onward, dangling), add the edge that reconnects its predecessor to its successor, and repoint `output` if it named the node. A renamed node's edges and `{{OldName.*}}` references move to the new name. Then read back the node names and every edge's `source → target` to confirm. A dangling reference makes the platform refuse the **whole** action: none of the edit syncs, and the next turn starts from the old graph. If `sync_app` is in your tool list, it returns that refusal as an error naming the edge — fix it and sync again; never end a turn with a dangling reference.
- **Delete:** remove the artifact file from `artifacts/actions/` to delete the action on sync.

After any action change, run **`pnpm gen:types`**.
