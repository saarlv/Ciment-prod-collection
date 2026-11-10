---
name: multi-tenancy
description: Data access for apps where people may only see part of the data — per organization / company / workspace (multi-tenant SaaS, B2B portals), per team / project / group a person belongs to (one or several), per owner, per member property (department, region), or per role. Load this before creating table artifacts whenever the request implies private data per tenant, team, group, owner or role, or says who may see, edit or delete what. Covers the tenant-ready model, `tenantTable` in app.json, a table's `multiTenant`, `rowPolicies` (membership lookups, `{{user.data.*}}`) and `columnPolicies`.
user-invocable: false
---

# Data access: tenants, groups, owners and roles

You set data access **in the artifacts**, as part of the data model. The platform enforces it in the data layer on every read, create, update and delete — from the app's pages, actions, workflows, agents and the API alike — so hiding something in the UI is never the protection. Load this **before writing table artifacts**.

## 1. Pick the model

Ask what decides who sees a row, then use the matching tool. They combine (tenancy + groups inside each tenant is common).

- **Organizations** (companies, clinics, schools, workspaces) that must never see each other, one per person → **multi-tenancy** (section 2).
- **Teams / projects / groups** a person can belong to **several** of → a **membership table** + a `lookup` rule (section 4). Never a list column on the user or on the rows.
- **Owner**: "people see only what they created" → `createdBy = {{user.id}}`.
- **A property of the person** (department, region, level) → `{{user.data.<name>}}`, a **user property** a builder or manager sets per member (section 5).
- **Role**: "only Admins delete" → a gate on `{{user.role}}` (an app role, see `app-artifacts/roles/roles.md`).

Who the rules apply to: members with **Can access**. Members with **Can build** or **Can manage** see and change everything — that is how admins support the app. So an in-app "admin" persona that must also be restricted is a role, and gets rules too.

## 2. Multi-tenancy

1. **A tenant table** whose rows are the tenants (`Companies`, `Clinics`…). Set `displayColumn` to its name column — it labels the tenant pickers. Name it in **app.json**: `"tenantTable": "Companies"`.
2. **Every table of tenant data** gets `multiTenant` and a `reference` chain back to the tenant table, direct or one hop away:

```json
{
  "name": "Projects",
  "columns": [
    {
      "name": "companyId",
      "type": "string",
      "reference": { "table": "Companies", "column": "id" }
    }
  ],
  "multiTenant": { "scope": "tenant_owned", "referenceColumn": "companyId" }
}
```

```json
{
  "name": "Tasks",
  "columns": [
    {
      "name": "projectId",
      "type": "string",
      "reference": { "table": "Projects", "column": "id" }
    }
  ],
  "multiTenant": { "scope": "tenant_owned", "referenceColumn": "projectId" }
}
```

3. **Shared lookups** (statuses, categories, a product catalog) get `"multiTenant": { "scope": "cross_tenant" }` or no `multiTenant`. `"system"` is for rare app-wide configuration only builders may read.
4. The tenant table itself needs no `multiTenant` (sync makes it private and tenant-owned).
5. **Never add a `tenantId` column** — it is reserved; the platform stores and fills each row's tenant from the reference chain.

Members are assigned to a tenant in **Share → Edit access** (the field is labeled with the tenant table's singular name). With tenancy on, a Can access member's queries are scoped to their tenant with no filter in the code; hide or auto-fill the tenant reference column for them, show a tenant picker only to builders and managers. `user.role` (app role) and `user.permission` (build / manage / use) are different things.

## 3. Row policies (`rowPolicies` on a table artifact)

```json
"rowPolicies": [
  { "name": "Own rows", "operation": "all", "where": { "column": "createdBy", "value": "{{user.id}}" } }
]
```

- `operation`: `read`, `create`, `update`, `delete`, `write` (= create + update + delete) or `all`. **One policy per operation** — combine conditions with `and` / `or` inside it. Read and write often differ: "everyone in the project reads, only Admins delete" is a `read` policy plus a `delete` policy (and a `create` / `update` one).
- `where`: `{ "column", "operator", "value" }` with `and: [...]`, `or: [...]`, `not: true`. Operators: `=` (default), `!=`, `>`, `>=`, `<`, `<=`, `in`, `not in`, `is null`, `is not null`. Columns are the table's own columns by name, or `id`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`.
- A bare `{ "value": "{{user.role === 'Admin'}}" }` is a gate: true lets everything through, false nothing.
- Values: `{{user.id}}`, `{{user.email}}`, `{{user.role}}`, `{{user.tenantId}}`, `{{user.data.<name>}}`, `{{now}}` (the request time, for time-limited access: `{ "column": "visibleUntil", "operator": ">", "value": "{{now}}" }`), or a literal. A list value (e.g. `{{user.data.regions}}`) matches any of its items.
- A row's own list column (an `object` column holding an array, e.g. `watcherEmails`): `{ "column": "watcherEmails", "operator": "includes", "value": "{{user.email}}" }`. Use it for a few named people per row; use a membership table (section 4) for groups.
- **If the user lacks a value the policy uses** (a property not set, a signed-out visitor), that policy denies everything to them. Nothing silently matches empty cells.
- `update` checks the row before and after: a member of project A can't move a task into project B. A blocked read returns nothing (a fetch by id is "not found"); a blocked create / update is refused with an error the UI should show.
- No policy on a table = every signed-in member can read and write all of it (within their tenant). Add a policy to every table holding private data.

## 4. Groups: a membership table + `lookup`

A condition can take its values from another table with `lookup: { table, column, where }` — evaluated on every request, so adding or removing a member takes effect at once. The membership table keys members by `email` (`userId` is a reserved column name):

```json
{
  "name": "ProjectMembers",
  "displayColumn": "email",
  "columns": [
    {
      "name": "projectId",
      "type": "string",
      "reference": { "table": "Projects", "column": "id" }
    },
    { "name": "email", "type": "string" },
    { "name": "role", "type": "string", "enum": ["owner", "member"] }
  ]
}
```

"My projects" — reuse this exact condition wherever it applies:

```json
{
  "column": "projectId",
  "operator": "in",
  "lookup": {
    "table": "ProjectMembers",
    "column": "projectId",
    "where": { "column": "email", "value": "{{user.email}}" }
  }
}
```

- **Tasks**: `all` → the condition above.
- **Projects**: `read` → the same with `"column": "id"`; `create` → `{ "value": true }` (anyone may start a project); `update` / `delete` → `id` in projects where the user's membership `role` is `owner` (`where` with `and`).
- **ProjectMembers** — **always restrict writes**, or anyone can add themselves to any group: `read` → my projects (co-members see each other); `write` → `or` of an Admin gate, projects the user owns, and — so a project's creator can add themselves as its first owner — projects they created: `{ "column": "projectId", "operator": "in", "lookup": { "table": "Projects", "column": "id", "where": { "column": "createdBy", "value": "{{user.id}}" } } }`.
- A lookup reads the other table without its own policies, in the caller's tenant. One level only (no lookup inside a lookup's `where`). It may return up to 10,000 values; scope it to the user.

## 5. User properties (`{{user.data.<name>}}`)

Per-member properties such as `department`, `region` or `projectIds`, set by builders and managers. Members never edit their own, so they are safe to grant access on. Use them for attributes an admin assigns (department, clearance, region); use a membership table when people join and leave groups through the app itself.

**Declare every property a rule reads** in **app.json** `userProperties`, so whoever sets it gets a real field (a picker, a number, a switch) in **Share → Invite / Edit access → User properties** instead of free text — `pnpm gen:types` warns about a `{{user.data.<name>}}` nobody declared:

```json
"userProperties": [
  { "name": "region", "type": "text", "options": ["EMEA", "AMER", "APAC"], "description": "Sales region the rep covers" },
  { "name": "projectIds", "type": "list", "description": "Projects this person works on" },
  { "name": "clearance", "type": "number" },
  { "name": "isLead", "type": "boolean" }
]
```

Types: `text` (with optional `options`), `number` (ranges compare as numbers), `boolean`, `list` (several values, with optional `options`; match it with `in`, or a list column with `includes`). Names: letters, digits, underscores.

In the app: `useUser()` returns the signed-in member's own as `user.attributes` (a member sees only their own; others' are empty unless the viewer can build or manage the app, so no member-facing UI on other people's properties). For an admin screen that sets them, use `useChangeUserProperties()` from `@blocksdiy/blocks-client-sdk/reactSdk` — the same shape as `useChangeUserRole()`: `{ changeUserPropertiesFunction({ userId, properties }), isLoading, error, isEnabled }`, `isEnabled` only for build / manage users. It **replaces** all of the member's properties, so spread their current `attributes` and change one key. List members with `useEntityGetAll(UserEntity)`. Tell the user which properties to set for whom.

## 6. Column policies (`columnPolicies`)

Hide columns from some users:

```json
"columnPolicies": [{ "name": "Salary for admins", "expression": "{{user.role !== 'Admin'}}", "columns": ["salary"], "columnMode": "deny" }]
```

`columnMode` `deny` restricts the listed columns when `expression` is true; `allow` restricts every other column. `operation` says what is restricted: `read` (hidden, the default), `write` (visible but nobody may set or change it — "members edit status but not budget") or `all` (both).

```json
"columnPolicies": [{ "name": "Budget set by Admins", "expression": "{{user.role !== 'Admin'}}", "columns": ["budget"], "columnMode": "deny", "operation": "write" }]
```

## 7. Finish

- `pnpm gen:types` reports a rule naming a missing column, table or reference as an error — fix it rather than dropping the rule.
- It also prints **data access check** warnings: a membership table anyone can write, a rule that lets everyone through, tables with no rule. Fix each one in the same turn, or mark a deliberately shared table `"multiTenant": { "scope": "cross_tenant" }` / tell the user why it's intended.
- **Opening data up needs the user's OK — the platform enforces it.** The sync does NOT apply a change that opens data to more people until the user approves it in a question card, even when they asked for it in chat. These count, each written as one line (copy the exact wording):
  - `<Table>: removed row policy "<name>"` / `removed column policy "<name>"` (one line per policy)
  - `<Table>: row policy "<name>" no longer applies to <read / create / update / delete>`
  - `<Table>: column policy "<name>" no longer restricts "<column>"` (one line per column), `… no longer hides its columns`, `… no longer locks its columns`, `… changed from deny to allow`
  - `<Table>: now shared across tenants`

  How: ask with `ask_user_question` — one question with id `data_access_widening` whose text says in plain words who will see or change what, and quotes each line verbatim, one per line. Its options are fixed by the card ("Yes, open access as described" / "No, keep access as it is"); any you write are replaced. When the user approves, make the change (or run `sync_app` again) in that same turn: an approval counts only for the turn it answers. `sync_app` lists anything it held back under `held:` — those are the lines to quote. If the user keeps access, put the rules back. A changed condition on an existing policy is applied and reported as `Data access rule changed` — still tell the user, in plain words, who it now lets in.

- Pass to the frontend agent: data is already filtered for the member; no security filters in queries; mirror the rules in the UI (hide buttons a member can't use) and show the error a refused write returns.
- Record the model in `memories/STORY.md`: tenant table, tenant-owned vs shared tables, membership tables, each table's policies in one line, user properties to set.
- Tell the user, in their words: who sees what; that builders and managers see everything; to test as a **Can access** member; to assign members to tenants and set user properties in **Share → Edit access**. They can review the rules in **Settings → App permissions → Data Permissions**.
