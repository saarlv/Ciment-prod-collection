# Table Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating/updating/deleting a table.

Define the app's data model as JSON files under `artifacts/tables/<Name>.json` — one file per table, e.g. `Tasks.json`, `Orders.json`. On sync these become real table blocks. After writing or changing table artifacts, run **`pnpm gen:types`**.

## JSON schema (one file = one table)

```json
{
  "type": "object",
  "required": ["name", "columns"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Table name (globally unique within the app)"
    },
    "legacyName": {
      "type": "string",
      "readOnly": true,
      "description": "Read-only. Seeded previous title when it differed from name. Do not author or change. Kept for backward compatibility with existing apps; the user may refer to the table by this name as well."
    },
    "description": {
      "type": "string",
      "description": "User-friendly description, short and concise"
    },
    "technicalDescription": {
      "type": "string",
      "description": "Explains intent, meaning, and how the data is used — not just the name"
    },
    "iconName": {
      "type": "string",
      "description": "Lucide icon name (e.g. table, users, package)"
    },
    "displayColumn": {
      "type": "string",
      "description": "Primary human-readable column used as the row label in dropdowns/reference fields (e.g. name, title, email)"
    },
    "uniqueKey": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Column names forming a unique identifier; enables upsert. Each must exist in columns."
    },
    "defaultUpsert": {
      "type": "boolean",
      "description": "When true, inserts update existing rows on unique-key match instead of failing. Requires uniqueKey."
    },
    "seedData": {
      "type": "array",
      "description": "Optional demo/seed rows inserted after the table block is created on sync. Reference columns use placeholder row ids 1, 2, 3, … (first row = 1); sync remaps to real ids.",
      "items": {
        "type": "object",
        "additionalProperties": true
      }
    },
    "permission": {
      "type": "object",
      "properties": {
        "type": { "enum": ["private", "public", "publicRead", "publicWrite"] }
      }
    },
    "columns": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type", "description"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Column name (camelCase)"
          },
          "type": {
            "enum": [
              "string",
              "number",
              "boolean",
              "object",
              "date",
              "time",
              "datetime"
            ]
          },
          "description": {
            "type": "string",
            "description": "Explains intent/meaning/use"
          },
          "enum": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Allowed values for a string column"
          },
          "expression": {
            "type": "string",
            "description": "Computed column JS expression; receives `item` (current row), e.g. item.first + ' ' + item.last. Output-only and never stored (a value written to it is dropped): computed after the query, so it cannot be filtered, sorted, grouped, aggregated or joined on, selected through a join, nor read by a view over this table (CALCULATED_COLUMN_NOT_QUERYABLE)"
          },
          "schema": {
            "type": "object",
            "description": "JSON Schema for an object column (mandatory when type is object)"
          },
          "reference": {
            "type": "object",
            "required": ["table", "column", "relationshipHint"],
            "properties": {
              "table": {
                "type": "string",
                "description": "Referenced table name"
              },
              "column": {
                "type": "string",
                "description": "Referenced column (typically id)"
              },
              "relationshipHint": { "enum": ["manyToOne", "oneToOne"] }
            }
          }
        }
      }
    }
  }
}
```

## Rules

- **Scope:** create only entities that will have CRUD in the app UI. For option lists, see **Shared / reference tables** below.
- **legacyName:** read-only, seeded when a live table's previous title differed from its name. Never author or change it. Preserve it if present — it keeps backward compatibility for existing apps, and the user may refer to the table by this name as well.
- **Column names:** camelCase, unique within a table, case-sensitive.
- **Reserved column names (never use, in any case/variant):** id, userId, accountId, appId, tableId, createdAt, createdBy, updatedAt, updatedBy, updatedByAgentId, createdByAgentId, createdByAgentThreadId, deletedAt, deletedBy, isDeleted, metadata, tenantId. They are added automatically. Never add a column to track which agent created or changed a row — `createdByAgentId` / `createdByAgentThreadId` are on every row and per-column agent attribution is recorded for you (`blocks-client` skill → entities.md → Agent attribution). For apps where each organization/company/workspace isolates its own data, load the **`multi-tenancy`** skill — build a tenant table + reference chains instead of inventing a tenant column.
- **Column types:** `type` is exactly one of `string`, `number`, `boolean`, `object`, `date`, `time`, `datetime`. JSON and arrays are `object` with a `schema` (an array's schema is `{ "type": "array", "items": … }`), and an uploaded file is a `string` holding the URL `useFileUpload` returns. `pnpm gen:types` fails on any other type, because the platform refuses every insert into such a column.
- **Object columns:** when `type` is `object`, provide a fully detailed `schema` where every nested object and array item has its properties defined. `additionalProperties: true` without properties is only for genuinely dynamic structures. When storing an action's output in an object column, mirror that action's output schema (DescribeActions).
- **Calendar/scheduling:** use single `startDateTime` / `endDateTime` (datetime) columns rather than separate date + time, optionally `isAllDay` (boolean).
- **Date/time column semantics:** `date` (`"2026-07-03"`) and `time` (`"17:00"`) are wall-clock values with no timezone — store and display them verbatim, never through `new Date()` / `toISOString()` / offset math. `datetime` is an absolute instant stored as a UTC ISO string — convert to/from local exactly once at each UI boundary. Point the frontend agent at the "Dates, times & timezones" rules in the **blocks-client** skill; double-converting is what makes a picked 17:00 save as 11:00.
- **Relationships:** model links with a `reference` column; never copy a shared value into multiple tables.

## Shared / reference tables

| Situation                                                                                                          | Model it as                                        |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Values shared by **≥2 tables**, or user-managed, or each option carries its own fields (a location has an address) | **A table** + a `reference` column from each table |
| A small **fixed** set used by **one** table, no extra fields, not user-managed (e.g. `priority`: low/medium/high)  | Inline **`enum`** on a `string` column             |
| A pure UI constant never stored or edited (e.g. a filter-tab list)                                                 | **Hardcode** in code (no table)                    |

Set the lookup table's `displayColumn` — it is the label shown in dropdowns and reference fields.

## Seed / demo data (`seedData`)

Rows are inserted **once**, when the table block is **first created** on sync — not on later schema updates.

- Do not include reserved/platform columns (`id`, `createdAt`, …) — they are assigned automatically.
- For **reference columns**, use placeholder row ids `1`, `2`, `3`, … matching the **order** of rows in the referenced table's `seedData` (first row = `1`). Sync remaps placeholders to real row ids after parent tables are seeded.
- Parent tables with `seedData` must be created in the same sync batch before dependents; create order follows the `reference` columns.
- **The first open shows a business mid-shift.** Every row differs in the fields its screens show (no copy-pasted triplets). Numbers are uneven ("₪12,480", never "₪10,000"), names are real-shaped, and the words are the client's. Never lorem.
- **Every reference resolves.** A placeholder id that matches no row in the referenced table's `seedData` renders "Unknown" with a dash after it. Check each reference column against the order of the parent's rows.
- **Seed what the screens open on.** A dashboard KPI, a list's default filter and a total must compute to real values from these rows, never 0 or an empty list. When the frontend agent or the browser pass reports a screen that opens empty, fix the rows. On a table that already exists, `seedData` won't be inserted again, so change its rows with **DataInsert** / **DataUpdate**.

```json
{
  "name": "Categories",
  "displayColumn": "name",
  "columns": [
    { "name": "name", "type": "string", "description": "Category name" }
  ],
  "seedData": [{ "name": "Electronics" }, { "name": "Books" }]
}
```

```json
{
  "name": "Products",
  "displayColumn": "name",
  "columns": [
    { "name": "name", "type": "string", "description": "Product name" },
    {
      "name": "categoryId",
      "type": "number",
      "description": "Category",
      "reference": {
        "table": "Categories",
        "column": "id",
        "relationshipHint": "manyToOne"
      }
    }
  ],
  "seedData": [
    { "name": "Widget", "categoryId": 1 },
    { "name": "Novel", "categoryId": 2 }
  ]
}
```

## Users, roles, and extension entities

- **Never create a users table** — the platform provides `UsersEntity` (id, email, name, role). Users are created and managed outside the app by auth; the app only references existing ones, and builds no auth infrastructure (the frontend uses `useGoogleLogin()` / `useSendLoginLink()` / `logOut()`).
- **Roles are server-controlled.** Never create boolean role columns (`isTeacher`, `isAdmin`, …) or a column/table that stores or changes a user's role. Use only the `role` field from UsersEntity. Build role assignment features only if the user explicitly asks.
- **Role-specific data goes in separate profile entities**, not flags: `TeacherProfile` (subjects, qualifications), `StudentProfile` (grade) — not `UserProfile` with `isTeacher: boolean`.
- **Extension entities key off `email`, never `userId`:** `UserProfile`, `SellerProfile`, … carry an `email` column referencing UsersEntity. Core user data (email, name, role) stays in UsersEntity; app-specific data lives in the extension entity.
- **Two-tier reference pattern:** user-extension entities reference UsersEntity by `email`; every other entity references the extension entity's `id` (e.g. `ShiftsEntity.doctorId` → `DoctorProfile.id`). Chain: `UsersEntity.email → DoctorProfile.email → DoctorProfile.id → ShiftsEntity.doctorId`.
- **Extension records may not exist yet** for first-time users. Handle it with lazy creation (on first save — preferred for optional data) or auto-creation (on first access — only when essential).

## Update & delete

- **Update:** write the artifact with the **same name** as an existing table → updated in place (editTables). Columns are diffed against the live table: new columns are **added**, existing ones are **updated** (description, enum, expression, schema, reference), and columns no longer present are **removed** (system/reserved columns are never removed). Table metadata (description, icon, displayColumn, uniqueKey) is patched too. A column's **type is preserved** on update — to change a type, remove the column and add a new one with the new type, which drops the old column's data.
- **Delete:** remove the artifact file from `artifacts/tables/` to delete the table on sync.

After any table change, run **`pnpm gen:types`**.
