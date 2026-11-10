---
name: app-artifacts
description: The complete guide to defining a Blocks app's backend — data model, logic, automations, AI agents, and roles — as JSON "artifact" files under the artifacts/ directory. Load this skill for ANY request that creates, changes, or deletes data tables, actions/logic, views, workflows, roles, agents, agent skills, or agent-chats, and for every new app. Theme/colors/branding are the frontend agent's job — pass brand intent when delegating; theme is not an artifact. Links to per-type schema docs in sub-folders.
user-invocable: false
---

# App Artifacts

A Blocks app's **backend** — data model, logic, AI, roles — is JSON files under **`artifacts/`** at the project root. The **frontend** lives under `src/`.

When the project is built, artifacts sync to the Blocks platform: tables, views, actions (DAG + code), agents, skills, agent-chats, and workflows are created/updated/deleted from these files; roles are create-only (no edit, no delete). So to add or change backend behavior, you edit artifact JSON files — not platform UI.

## Artifacts directory layout

```
artifacts/
  tables/        <Name>.json    data tables (entities, columns, relationships)
  actions/       <Name>.json    backend logic (DAG actions + code actions)
  views/         <Name>.json    read-only derived data (aggregations/joins)
  workflows/     <Name>.json    trigger → action automations
  roles/         <Name>.json    user personas (only for 2+ personas)
  agents/        <Name>.json    reusable AI personas
  agent-chats/   <Name>.json    chat UI surfaces backed by an agent
  skills/        <Name>.json    reusable SKILL.md skills an agent can invoke
  app.json                      app name, description & mini-apps
```

## Per-type schemas

Read the matching doc before creating, updating, or deleting that type — the shapes are not guessable.

| When the request involves…                                                | Read                                        | Writes to                |
| ------------------------------------------------------------------------- | ------------------------------------------- | ------------------------ |
| Data model — tables, columns, relationships, demo data                    | [tables](./tables/tables.md)                | `artifacts/tables/`      |
| Backend logic — CRUD, integrations, AI/agent calls, code                  | [actions](./actions/actions.md)             | `artifacts/actions/`     |
| OAuth / API secrets before integration or code actions                    | load **`integrations`** skill               | (skill only)             |
| Derived data — aggregations, joins, filtered/computed columns             | [views](./views/views.md)                   | `artifacts/views/`       |
| Scheduled / event-driven automation                                       | [workflows](./workflows/workflows.md)       | `artifacts/workflows/`   |
| 2+ distinct user personas with different experiences                      | [roles](./roles/roles.md)                   | `artifacts/roles/`       |
| An AI agent persona (instructions, tools, memory)                         | [agents](./agents/agents.md)                | `artifacts/agents/`      |
| A chat UI surface backed by an agent                                      | [agent-chats](./agent-chats/agent-chats.md) | `artifacts/agent-chats/` |
| A reusable SKILL.md an agent can invoke                                   | [skills](./skills/skills.md)                | `artifacts/skills/`      |
| App name / description / mini-apps (rename, describe, declare the shells) | [app](./app/app.md)                         | `artifacts/app.json`     |

Colors, palette, branding, dark/light mode, and fonts go to the **frontend** agent with brand intent in the brief — it owns the token values in `src/index.css`.

## Working with artifacts

The gate sequence around this work — app name, brand intent, action discovery, `pnpm gen:types`, entity Grep, then delegate — is in `CLAUDE.md`. What is specific to artifacts:

- **Discover actions before writing one.** **ListActionSets** → **ListActions** with the set ids you need → **DescribeActions** for every action type you'll use as a node. Schemas are not guessable and a wrong one fails at sync. Prefer DAG actions; a code action is the last resort. **TablesDescribe** gives the columns of tables that already exist. These three merge your workspace `artifacts/` with what the platform actually has, so something you wrote this turn is listed here before the platform has it — being listed is not proof it can be run (see _Sync before you test_).
- **Run `pnpm gen:types` once, after you have written, updated, or deleted all the artifacts of the change** — not after each file. It regenerates `src/product-types.ts` and validates `artifacts/app.json` against the platform's rules; fix every error it reports, then run it again, before you delegate (_Before you delegate_ describes the output).
- **Code actions** each need `code-actions/<ActionName>/code.ts`, bundle-validated with **`pnpm bundle:action <Name>`**. Deploy to Lambda is automatic when the app syncs — mid-turn if you call `sync_app`, otherwise when the turn ends.
- **Sync before you test.** If `sync_app` is in your tool list, call it after writing or changing artifacts and code actions — it pushes them to this chat's draft/branch version and returns the sync errors. Fix every error and call it again before you **ExecuteAction**, use **DataInsert / DataUpdate / DataDelete**, or browse a flow that uses what you wrote. Until it runs the platform still holds the previous turn's state, and that breaks two different ways: something you **created** this turn is not there, so the call fails; something you **changed** is still there in its old form, so the call **succeeds against the old version** — the stale run looks like a pass, and a wrong result from it will send you debugging code that was never executed. Without the tool, the sync runs when the turn ends and artifacts written this turn cannot be exercised mid-turn.
- **The UI can call only this app's actions** — system/built-in actions are not callable from the frontend. Create an app action for any backend capability the UI needs.
- **Reuse existing agents.** Users name an agent by its persona `title` ("Ron"), not its artifact `name` (`APOpsAgent`). Before creating an agent or wiring an agent-chat, read `artifacts/agents/` and edit the agent whose `title` matches. Personas come from the fixed catalog (`agents/personas.json`), one per agent — a persona already in use means that agent already exists (see [agents](./agents/agents.md)).

## Updating and deleting artifacts

- **Update:** write the artifact JSON with the **same name** — it is updated in place on sync, not duplicated. Tables diff their columns (add/update/remove) and patch metadata; views update query, description, and calculated columns.
- **Delete:** delete its artifact JSON file — sync removes blocks that no longer have a matching artifact file. If you delete a skill, also remove its `name` from any agent's `skills` array.

## Entity naming (tables and views)

Both table and view artifacts produce **`{Name}Entity`** exports in `src/product-types.ts` after `pnpm gen:types`:

- `artifacts/tables/Products.json` with `"name": "Products"` → `ProductsEntity`
- `artifacts/views/LowStockProducts.json` with `"name": "LowStockProducts"` → `LowStockProductsEntity`

`pnpm gen:types` reads only `artifacts/`, so an export exists only for an artifact you have written. Grep `src/product-types.ts` for `export const .*Entity` before naming an entity to the frontend: an entity that isn't in that output produces an import that compiles and then blanks the page at runtime.

**Derived UI data requires a view artifact.** Dashboard KPIs, joined rows, filtered lists, and rollups are views — not tables, and not invented entity names in the frontend prompt.

## Related skills

- `integrations` — OAuth/API secrets: check `artifacts/app.json` (and `GetAppIntegrations` when available), and hand off via App Settings → Integrations if a required provider/secret is missing. Load before integration-backed actions.
- `platform-knowledge` — answer questions about how the Blocks platform/app works (sharing, login, settings, credits/billing, versions, errors, limits). Not for building.
- `multi-tenancy` — multi-tenant apps: tenant table + reference chains, UI enablement steps. Load before table artifacts when each org/company/workspace needs isolated data.
- `public-app` — for public apps (`artifacts/app.json` `isPublic: true`): public landing pages and custom login/signup pages. Private apps use the platform login; don't build one.
- `app-layout`, `shadcn`, `blocks-client`, `charts`, `file-parsing`, `roles-and-authentication` — frontend (`src/`) skills used when building the UI (`shadcn` also covers the brand palette and fonts — the token values in `src/index.css`).
