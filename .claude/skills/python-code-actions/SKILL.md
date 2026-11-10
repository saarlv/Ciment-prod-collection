---
name: python-code-actions
description: Writing a code action in Python instead of TypeScript — when Python is the right choice, and the full Python authoring contract (invoke signature, the BlocksClient Python API, requirements.txt, shared and private modules, the validation gate). Load this skill BEFORE writing or converting any code action you are considering implementing in Python, and before choosing a language for an action whose job is data/scientific work or needs a Python-only library.
user-invocable: false
---

# Python Code Actions

Code actions run on AWS Lambda in **either** TypeScript or Python. Both languages get the same
platform client, the same secrets, the same input/output schemas, and the same deploy pipeline. The
runtime is `python3.12`.

**Which language an action uses is decided by the file you write** — nothing else declares it:

| You write                                          | The action deploys as |
| -------------------------------------------------- | --------------------- |
| `code-actions/<Name>/code.ts` + `settings.json`    | TypeScript (Node 22)  |
| `code-actions/<Name>/code.py` + `requirements.txt` | Python 3.12           |

No artifact field, no orchestrator instruction, and no settings flag sets the language. It is your
call as the implementer, and the file on disk _is_ the declaration.

## Choose TypeScript unless Python earns it

**TypeScript is the default.** Reach for Python only when the work genuinely wants the Python
ecosystem:

| Situation                                                                                               | Language                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Anything already covered by an npm client, plain REST, or straightforward data shuffling                | **TypeScript**                                                                                         |
| Numeric / scientific / statistical work that would mean hand-rolling in JS (`pandas`, `numpy`, `scipy`) | **Python**                                                                                             |
| The only good SDK for the service is a Python one (no maintained npm equivalent)                        | **Python**                                                                                             |
| Parsing or generating formats where the mature library is Python-only                                   | **Python**                                                                                             |
| A browsing task (`browsingTask: true` in requirements.json)                                             | **TypeScript** — the browser runtime is JavaScript-only; a Python browsing action is refused at deploy |
| The action shares helper modules with existing TypeScript actions                                       | **TypeScript** — a shared module is only importable from actions in its own language                   |

Do not translate a working TypeScript action to Python (or back) unless asked. Rewriting the language
of an action that already works is churn, and it forces a redeploy on a new runtime.

**One language per action.** An action folder holds `code.ts` _or_ `code.py`, never both — if both
exist, the platform treats the action as TypeScript and your Python is ignored. When you convert an
action, **delete the other language's files**: `rm code-actions/<Name>/code.ts code-actions/<Name>/settings.json`.

## The action folder

```
code-actions/<ActionName>/
  code.py            # entry point — must define invoke
  requirements.txt   # pip dependencies (omit or leave empty when there are none)
  helpers.py         # optional private modules, bundled with this action only
```

## The invoke contract

```python
def invoke(payload, context):
    return {"ok": True}
```

- `payload` — a dict matching the action's `inputSchema` from `code-actions/requirements.json`.
- `context` — a dict with `appId`, `token`, `accountId`, `userId`, `appVersion`,
  `mainWorkflowId`, and `secrets`.
- Return a **JSON-serializable dict** matching `outputSchema`. Return values are serialized as the
  action's result; a `datetime`, `Decimal`, or custom object will not serialize — convert first.
- `async def invoke(payload, context)` is supported; the runtime awaits it.
- Raising is fine — the runtime returns `{"success": False, "error": ..., "stack": ...}` and the
  workflow step fails with that message. Raise a clear exception rather than returning a vague error
  dict.
- Whatever the run prints (`print()`, stdout, stderr) shows on its activity log entry — the last
  ~32 KB of it — and **GetActivityLogEntry** returns it as `logs`. Print what you would need to
  debug a failure (which step it reached, ids, counts), never a secret.
- There is **no writable filesystem** and no ambient database handle. Everything platform-side goes
  through `BlocksClient`.

## The Python BlocksClient

```python
from blocks import BlocksClient

def invoke(payload, context):
    client = BlocksClient(context)
    ...
```

Methods are **snake_case** (this is the Python client, not a transliteration of the TypeScript one).
The full surface — there is nothing else on it:

| Method                                                                                        | Returns                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `client.query_table(table_name, query)`                                                       | `{"items": [...]}`                           |
| `client.get_item(table_name, item_id)`                                                        | `{"item": {...}}`                            |
| `client.create_item(table_name, item)`                                                        | `{"item": {...}}`                            |
| `client.create_items(table_name, items)`                                                      | `{"items": [...]}`                           |
| `client.update_item(table_name, item_id, item)`                                               | `{"item": {...}}`                            |
| `client.update_items(table_name, items)`                                                      | `{"items": [...]}`                           |
| `client.delete_item(table_name, item_id)`                                                     | `{"itemId": "..."}`                          |
| `client.delete_items(table_name, {"where": …})` (every row: `{"allItems": True}`)             | `{"itemIds": [...]}`                         |
| `client.invoke_action(action_name, input_data)`                                               | that action's output                         |
| `client.invoke_action_async(action_name, input_data)` (background run)                        | `{"workflowId": ...}`                        |
| `client.get_action_run_status(workflow_id)`                                                   | `{"status": ..., "progress": ...}`           |
| `client.cancel_action_run(workflow_id)`                                                       | `{"workflowId": ..., "status": ...}`         |
| `client.pause_action_run(workflow_id)`                                                        | `{"workflowId": ..., "status": ...}`         |
| `client.resume_action_run(workflow_id)` (a paused run's `awaitingRetry`)                      | `{"workflowId": ..., "retried": [...]}`      |
| `client.get_current_user()`                                                                   | `{"user": {...}}`                            |
| `client.generate_file_signed_url(file_url)`                                                   | `{"signedUrl": ..., "expiration": ...}`      |
| `client.get_app_links()` (full URLs into the app — see `getAppLinks` in backend-code-actions) | `{"standaloneUrl": ..., "platformUrl": ...}` |

Rules that are identical to the TypeScript client, and matter just as much here:

- **Table names and action names are the exact, case-sensitive strings from
  `code-actions/requirements.json`**, written as literals: `client.query_table("Tasks", {"from": {"table": "Tasks"}})`.
  Invented names, `snake_case` table names, and opaque constants do not resolve.
- **Durable actions** (`execution.mode: "durable"`) are async-only: `invoke_action` on one raises
  `DURABLE_REQUIRES_ASYNC`; start it with `invoke_action_async` and check `get_action_run_status` later.
  `pause_action_run`, `resume_action_run` and `cancel_action_run` work on any run started with
  `invoke_action_async`; a run started with a synchronous call can't be paused (`RUN_NOT_PAUSABLE`).
- **Every step of every run** gets `context["idempotencyKey"]`, stable across retries of that step.
- **Secrets** come from `context["secrets"]` — e.g. `context["secrets"]["OPENAI_API_KEY"]`. Never
  read them from `os.environ`.
- **File URLs from the database are not fetchable.** Convert first:
  ```python
  signed = client.generate_file_signed_url(payload["fileUrl"])
  response = urllib.request.urlopen(signed["signedUrl"])
  ```
- **Every** failed platform call raises `BlocksApiError` (`from blocks import BlocksApiError`) — a
  non-2xx response and a request that never got one (refused connection, timeout) both. It carries
  `.status` (the HTTP status, or `None` when there was no response) and `.body`. Catching that one
  type is enough; you never need to catch `urllib` errors. Let it propagate unless you have a real
  fallback — the runtime turns it into a failed action with the message attached.

Query bodies (`query_table`, `delete_items`) are dicts of the same JSON the TypeScript client sends,
so their keys stay **camelCase** even in Python — `{"from": …, "join": …, "select": …, "where": …,
"groupBy": […], "orderBy": […], "limit": …}`. They go to the same API; snake_case keys are ignored.

The client is **stdlib-only** (it uses `urllib`), so an action that needs nothing else ships with no
dependencies at all and deploys in seconds. Do **not** add `requests` to `requirements.txt` just to
call the platform.

### Example

```python
from blocks import BlocksClient


def invoke(payload, context):
    client = BlocksClient(context)

    rows = client.query_table("Tasks", {"from": {"table": "Tasks"}})["items"]
    open_tasks = [row for row in rows if row.get("Status") != "Done"]

    client.create_item("Insights", {"Summary": f"{len(open_tasks)} open tasks"})

    generated = client.invoke_action("GenerateText", {"prompt": "Summarize the backlog"})

    return {"openCount": len(open_tasks), "summary": generated.get("text")}
```

## requirements.txt

One plain requirement per line. Comments (`#`) and blank lines are fine; pip flag lines
(`-r other.txt`, `--index-url …`) are not supported and are rejected.

```
requests>=2.32
pandas==2.2.2
```

- **Pin what you depend on.** Confirm a real published version before pinning it — `WebFetch` on
  `https://pypi.org/pypi/<package>/json` returns it. Search the web first if you are not sure which
  package you want.
- Only **wheels** are installed, for **manylinux x86_64 / Python 3.12**. A package that publishes
  only a source distribution fails the deploy with pip's own error. Compiled wheels are fine (this is
  how `pandas`/`numpy` work) — it is source-only packages that don't.
- Do **not** list the standard library (`json`, `csv`, `datetime`, `urllib`, `re`, `math`, …) — it is
  always available.
- Specifiers must be bare names or PEP 440 (`==`, `>=`, `<=`, `~=`, `!=`). `^1.2` npm-style ranges,
  local paths, and git URLs are not requirements and are rejected.
- Dependencies must unpack to under 250MB. `ortools` + `pandas` + `numpy` fits; adding several large ML stacks does not.

## Shared and private modules

Python actions import their own modules by their **package path in the deployed bundle**, which is
not the same shape as the workspace folder:

| File you write                   | Import you write in `code.py`        | Scope               |
| -------------------------------- | ------------------------------------ | ------------------- |
| `code-actions/<Name>/helpers.py` | `from action.helpers import my_func` | this action only    |
| `code-actions/shared/tax.py`     | `from shared.tax import RATE`        | every Python action |

- Put action-specific logic in a private sibling module; use `code-actions/shared/` only for genuinely
  reusable helpers.
- `code-actions/shared/` is **not** a language boundary: `.py` files there are shipped to Python
  actions and `.ts` files to TypeScript ones. A Python action cannot import `tax.ts`, and a
  TypeScript action cannot import `tax.py` — write the helper in the language of the actions that use
  it (or in both, if both need it).
- Do not edit anything under `code-actions/shared/blocks/` — that is platform scaffold, refreshed
  every turn. `code-actions/shared/blocks/python/` is where the client you are calling lives; read it
  when you need the exact behavior of a method.

## When you finish — validate, do NOT deploy

Deployment happens automatically after the session. Your gate is the same command as for TypeScript:

```bash
pnpm bundle:action <ActionName>
```

For a Python action it checks that every `requirements.txt` entry is a real pip requirement and that
`code.py` parses, then prints exactly which checks ran:

```
✓ Validated GetTaskStats (python — requirements checked; code.py syntax-checked)
```

It does **not** install your dependencies or import your module — a package that exists only in your
head, or a wrong `BlocksClient` method name, will pass this gate and fail at runtime. So before you
call an action done: re-read `code-actions/shared/blocks/python/blocks_client.py` and confirm every
client call you wrote is a method that exists there with the arguments you passed, and confirm every
non-stdlib module you import is listed in `requirements.txt`.

There is no offline test runner for Python actions (`pnpm test:action` is vitest, TypeScript only).

Then end your final response with the line listing which action(s) you implemented or updated, noting
the language — e.g. "Implemented: GetTaskStats (python)".
