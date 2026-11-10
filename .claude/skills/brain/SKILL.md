---
name: brain
description: Company data (Brain) — the customer's business data already replicated into the account's warehouse. Load this BEFORE any work that touches company data, the warehouse, Snowflake, data requests (data-requests/), dbt models or saved queries (dbt/), search indexes (dbt/rag/ — RAG, semantic search over documents or table rows with search_brain_documents), or query_table / list_files / get_file — or syncing this app's own tables into Brain — reading what the app has, asking for a new table, making data searchable, briefing the data-engineer, building a page or code action that shows the data. Covers who does what, where the app's data lives, why no credentials are ever needed, build time vs run time, query cost, narrowing an ask, and the preview the customer agrees to first.
user-invocable: false
---

# Brain — company data

The account's company data (its CRM, ERP, and other connected systems) is **already landed in the
account's warehouse**. This skill is how an app finds it, asks for more of it, and reads it at run
time. Every rule here is load-bearing; the failures they prevent are mostly silent — a page that
looks right and never changes, or an app that shows "no data" for ever.

## Who does what

- **In a Build turn the orchestrator hands the request files and dbt models to the
  `data-engineer` sub-agent** — every file under `data-requests/` and `dbt/`, search indexes
  (`dbt/rag/`) included — and writes none of them itself: a _propose_ task previews the ask and
  writes nothing, the orchestrator puts it to the customer, and once they agree an _apply_ task
  writes the files (section 6). Models and search indexes over data the app already has are one
  _model_ task, with no consent.
- **`sync_app` errors about those files go back to the data engineer.** In a draft or branch turn
  `sync_app` reports a request the platform refused as `data request <file>: …`, a dbt file or
  compile problem as `dbt …`, and a search index it refused as `rag dbt/rag/<name>.yml: …`; its
  "Search indexes (dbt/rag)" line names the indexes it accepted. A draft only checks them: they are
  declared at the end of the first live turn after it is promoted or merged, and searchable minutes
  after that. Hand the lines to the data engineer verbatim in a _model_ task, then sync again; never
  edit the files yourself.
- **You have only the Brain access of the person whose turn it is.** Brain gives each person access
  to some connections and tables; `get_brain_data` and the Brain reads list only what they can see.
  A refusal saying they don't have access — from `get_brain_data`, a Brain read, or a `sync_app` line
  about a request, query, search index or app table — means they are not on that connection's or
  table's access list in Brain. It is not a fix for the data engineer: never retry it or work around
  it (no other connection, no copying the data some other way). Tell the customer: "You don't have
  access to X in Brain. Ask a Brain manager to add you." — naming X.
- **Every question to the customer is the orchestrator's**, with ask_user_question, and so is
  everything said to them. A sub-agent cannot ask: where this skill says to ask or tell the
  customer, a sub-agent returns what to ask or tell, and the orchestrator does it.
- **Settle what the app's numbers mean before the data engineer defines them.** When the customer
  asks for numbers (revenue, win rate, active customers), ask in the same round as any other
  question the definitions only they can make and that change the value — gross or net, which
  stage counts as won, who counts as active — and put the answers in the _model_ task. The data
  engineer decides everything else, and returns any definition still open as a question for you
  to ask.
- **The data engineer's own brief carries the engineering**: how a request file is written from a
  preview, how dbt models are written and checked, how a search index is declared, and clean-up.
  Nobody else needs it.
- **Plan and Ask turns have no sub-agent tool**, so there the orchestrator only reads —
  get_brain_data and the workspace files — and writes no request file and no model.
- A coder that builds a page or code action over the data reads it by the names its brief gives;
  sections 3 and 4 are its rules.

## Tools

| Tool                                 | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp__harness-tools__get_brain_data` | What the ACCOUNT has: `sources`, `entities`, `columns`, and `preview` — which also hands back the exact request file to write (chosen with `what`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `query_table`                        | The table read: one read-only SQL `SELECT` over synced tables. A platform action, not a harness tool — reached with ExecuteAction at build time and with `client.invokeAction` from a code action at run time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `list_files`                         | Every file in one landed file folder (`folder: "drive_1"`), each with the `path` `get_file` takes. Reached like `query_table`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `get_file`                           | One file by its `path` from `list_files` (`drive_1/q3/report.pdf`), returned as a download link (`url`, valid 15 minutes) to the file itself in its original format. Reached like `query_table`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `list_data_assets`                   | Every table and file folder the account has landed, with the real name each is read by (`RAW.HUBSPOT_1_CONTACTS`, or a folder name) and, where it was described, what a table holds and the metrics it defines. Reached like `query_table`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `describe_data_assets`               | Columns, warehouse types, what each column means where it was described, a saved query's semantic model (its entities, dimensions and metrics, and the app's semantic view to query them through) where it has one, and a few sample rows for tables named as `list_data_assets` gives them. Reached like `query_table`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `search_brain_documents`             | Passages from the account's synced documents (PDF, Word, slides, text) ranked by meaning, any language: `query`, optional `assets` (up to 20 index names, any of them matches; each exactly as an index's `from` names it: `files_google_drive_2`, `raw_gmail_1_messages_details`; omit it to search every index) and `tags` (folder names, lower-cased). It searches this app's indexes by default; `scope: "account"` searches every app's indexes in the account. Each hit has `text` and the `path` to cite; a hit from a table's row also has `table` (the name `query_table` reads it by) and `rowId` (its `id` value; a composite one joins its parts with a pipe), so read the full row with `query_table`. Reached like `query_table`; answers "nothing indexed yet" until an app declares an index — the data engineer declares them |

The prose below names the harness tools by their bare names (get_brain_data, ask_user_question);
call them exactly as your tool list shows them. dbt itself is a CLI in the workspace, run by
the data engineer.

**There is no tool that makes or withdraws a data request.** A request is a file:
`data-requests/<name>.json`. Writing the file `get_brain_data` with what: "preview" hands back IS the
request — the only way a new table comes into being — and deleting the file withdraws it.

## 1. What this app already has — read your workspace first

**What company data this app already has is in your workspace — `data-requests/` and `dbt/`; read
them before anything else.**

- `data-requests/*.json` is one file per table this app asks for (its source, connection, entity,
  columns, schedule and the catalog name it is read by). Each is written exactly as the preview
  returns it; each becomes part of the app when the turn ends (or on `sync_app`), and only then is
  the request sent and its first sync started.
- `dbt/models/sources.yml` lists every table the app can read, with its columns.
- `dbt/models/*.sql` are its saved queries — each one a `DBT` file block on the app — and the
  `.yml` of the same name says what each one and its columns mean.
- `dbt/rag/*.yml` are its search indexes — each one makes a table, a saved query's result or a file
  folder searchable with `search_brain_documents` (declared by the data engineer).
- `dbt/app_tables/*.yml` are its app tables — each one copies a data asset into one of the app's own
  tables and keeps it in sync. Written only from `get_brain_data` `app_table_plan`, together with the
  table's artifact; deleting one stops the sync and keeps the table.
- `dbt/README.md` lists the tables still syncing (asked for, first sync not landed — never ask for
  those again), each with "first sync running since …" or "first sync not started yet", and the read
  name of every query the app has, built or not.

**None of it is in the app describe**, so an empty describe never means the app has no data.

**Never invent a table name.** If the data you need is in none of those files, `get_brain_data`
says whether the account has the source, and writing the file its preview returns is how the app asks
for it — the only way a new table comes into being. The files refresh at the start of each turn; a
table asked for this turn is named in the preview's `aliases` (and in the file written from it), and a
live read names it by the preview's `tables`.

## 2. No connection, no credentials — ever

Company data needs NO connection and NO credentials from you. It is ALREADY landed in the account's
warehouse and `query_table` authenticates itself. So:

- never call request_integration_connections for Snowflake, a warehouse, a database or a data source
  in order to read this data;
- never write warehouse credentials or a connection string into the app;
- never ask the user for a host, account locator, username, password or key to reach it — there is
  nothing for them to give you, and asking implies the platform cannot already do this.

**The one exception: add Brain to the app, when `brain` is offered.** On some accounts `brain` (the
account's company data) is one of the providers that `get_app_integrations` lists. There, the app
must have Brain before it asks for company data. Before the app's first data request, saved query or
search index, the orchestrator calls `get_app_integrations` with `brain` as `SHARED`. If it is not
connected, the orchestrator calls `request_integration_connections` with exactly `brain` and does
nothing else in that turn: the customer approves it on the card (**Use company data**). Only then
does the data engineer get its _apply_ or _model_ task. Ask once per app: once connected it stays.
If the customer cancels it, write no request, model or index, and tell them the app can use company
data only once they approve it. When `brain` isn't offered, skip all of this: nothing needs
connecting.

### When `dbt/` has no table for the data you need

There are exactly two cases and they are not the same.

1. **The account HAS connected that system** (`get_brain_data` with what: "sources" lists it) —
   then the app simply has not asked for it yet, and asking is the way: list its entities, preview
   the ask, agree it with the customer, then write the file the preview returned — in that order,
   each step by its owner (section 6).
2. **The account has NOT connected it** — then stop, name the system, and tell the customer to
   connect it in the Data section; you cannot consent on their behalf and there is nothing you can
   build that substitutes for it.

`get_brain_data` lists only the connections the person whose turn it is can use, so a system missing
from `sources` may also be connected but not shared with them: then they ask a Brain manager to add
them to it, rather than connecting it again.

Either way, do NOT route around it by requesting an integration or building a direct API call to the
source system.

**This app's own tables are always a source.** `get_brain_data` with what: "sources" lists them as
`blocks_app`, connected for you — request them like any other source when you need to join or
aggregate them with other data in SQL or dbt. Only this app's tables; another app's are not offered.
When the customer asks to sync, copy or bring this app's data into Brain, this is how: request its
tables from `blocks_app` (sections 2 and 6). It is not a write into Brain, so never answer that it
cannot be done.

## 3. Build time vs run time

**Reading company data at BUILD time and at RUN time are different jobs, and confusing them ships a
dead page.**

- Calling `query_table` yourself tells YOU the shape, the columns and realistic values — it
  does not give the finished app anything.
- NEVER paste rows you read into the source as a constant, a fixture or seeded state: they are frozen
  the moment you write them, the page looks correct in review, and the customer sees data that never
  changes again.
- For the app to read the data itself, create an app-owned action that calls `query_table`
  and mark it exposed to the UI, then call that action from the page — the same wrapper pattern an
  app uses for any platform action.
- A run-time read names each table by its real name in its `sql` — `RAW.<identifier>` with the
  `identifier` from `dbt/models/sources.yml` (or the `table` that `list_data_assets` returns, or —
  for a table asked for this turn — the preview's `tables`), and a
  query's result by its read name from `dbt/README.md` (`MODELED.…`); never derive, shorten or guess
  one.
- **A saved query's metric is read through its semantic view** when `describe_data_assets` gives the
  table a `semantic.view`: `SELECT * FROM SEMANTIC_VIEW(<view> DIMENSIONS <model>.<dimension>
METRICS <model>.<metric>)` as the `sql`, where `<model>` is the saved query's model name and a ratio
  or derived metric is named alone. Snowflake writes the aggregation and the joins from the
  definition, so every page and agent gets the same number. Without a view, reproduce the metric from
  its `expr` and `filter`.
- A Refresh control just calls it again: each call is a fresh query, so it returns whatever the
  warehouse holds at that moment, and there is nothing to invalidate or poll.

## 4. Query cost

Every one of those calls is real warehouse compute with a time budget, so shape the query rather than
the page:

- aggregate, filter and group in the SQL, and pass a row limit;
- read on mount or on an explicit user action — never on a timer or on every keystroke.

A dashboard that asks for one summary row per card is right; one that pulls a whole table into the
browser to count it in JavaScript is slow, expensive, and will time out on the customers whose data is
worth reading.

## 5. Asking for data

### When the data arrives

Writing a request file sends nothing. The preview hands back the name each table will be read by, so
you can write queries against it in the same turn. The request is sent to the data platform when the
file becomes part of the app — when the turn ends, or on `sync_app` — and the first sync starts then.
So:

- **the first sync always starts when the request is sent, whatever the schedule — a manual schedule
  included.** The schedule only governs the syncs after the first one: manual means no further syncs
  unless someone starts one, not that the first one waits for them. Never tell the customer they must
  start the first sync by hand, or that nothing will run on its own;
- the data arrives after this turn, not during it — never tell the customer it is there yet;
- a query over a table whose first sync has not landed is built on a later live turn, after the data
  is in — nothing rebuilds it when the data lands;
- a request the platform refuses at that point is not kept, so ask only for entities and columns
  `get_brain_data` reported, and each file is written exactly as the preview returned it — never by
  hand.

### Settle the details with the customer before you build anything

A data request asks for tables; it does not answer what the customer actually wants to see. Before the
first request file, ask with ask_user_question — in one round, only what the request leaves
open — things like: which fields to show, what counts as a match (which key, case-insensitive or not,
what to do with duplicates), whether rows that do not match should appear, and any filters or date
range. Then build exactly that. When the data turns out not to fit (the table you asked for lacks the
field), ask again rather than improvising a substitute.

### Ask for less than the whole table when the customer asked for less

The preview takes a `filters` entry per entity, and folds it into the file it returns:

- `columns` for particular columns;
- `rows: { field, lastSeconds }` for a trailing date range — **seconds**, so 86400 is a day and
  129600 the last 36 hours.

Get the column names and the date column from `get_brain_data` with what: "columns" first — never
guess a column name, and prefer the `changeTrackedOn` column it reports for a date range, because
that one is a date by construction.

Two limits worth knowing before you promise anything:

- a date range works only where that call reports `supportsDateRange` true (a source we describe
  ourselves, like an ERP — an off-the-shelf connector has one start date for the whole source and the
  platform refuses a per-table window);
- narrowing is merged across apps by the LOOSEST ask, so another app requesting the same table in
  full means everyone gets it in full.

Say that rather than promising a narrow table you cannot guarantee.

## 6. Preview and consent — never silent, never unilateral

**Asking for company data changes other apps, so it is never silent and never unilateral.** A data
request merges with every other app reading the same source: the strictest schedule wins, so this app
asking hourly can speed up — and cost — someone else's sync. So the order is fixed, and each step
has its owner:

1. **Preview.** `get_brain_data` with what: "preview", with the `cron` and `filters` meant for the
   ask — the preview is the whole ask. In a Build turn this is the data engineer's _propose_ task,
   which writes nothing.
2. **Ask.** The orchestrator puts what it says to the customer with ask_user_question — name the
   system, the connection, the tables, the schedule, and how many other apps share the data. A
   sub-agent, which cannot ask, returns the preview and writes nothing.
3. **Write.** Only once they have agreed are the files in its `files` written, exactly as given —
   path and content. In a Build turn this is the data engineer's _apply_ task.

Ask for the entities the app actually needs and no more: every one is real replication the customer
pays for. How many other apps share the data and whether their schedule changes come only from the
preview: each of its `plans` carries `affectedConsumers` (how many OTHER apps share that sync),
`cron` (the schedule that will apply) and, when this ask tightens a running schedule,
`cronChangedFrom` (what it was). Once the files are written, the orchestrator tells the customer the
aliases, that the request is sent when the turn ends and its first sync starts then (on a manual
schedule too) so the data arrives after that, and that to withdraw the request later they ask in
this app's chat (the app has no button for it).
