---
name: multi-tenancy
description: Building apps where multiple organizations, companies, or workspaces each see only their own private data (SaaS, B2B portals, multi-company apps). Load this skill when the request implies multi-tenant, per-organization, per-company, or per-workspace data isolation — before creating table artifacts. Covers the tenant-ready data model (tenant table + reference chains) and the exact UI steps to enable multi-tenancy after the app is built. Not for simple per-user row ownership (use row policies instead).
user-invocable: false
---

# Multi-Tenancy

For apps serving **multiple tenants** — organizations, companies, clinics, schools, workspaces — where each tenant's users see only their own rows. Load it **before creating table artifacts**.

Not this: "each user sees only their own tasks". That is a **row policy** (`createdBy = {{user.id}}`), configured in the same **Data Permissions** UI, with no tenant table.

## What Blocks multi-tenancy is

The platform stores a physical `tenant_id` on every row and auto-filters `tenant_owned` tables by the signed-in user's `tenantId`. Build and Manage members see and manage every tenant's data; Use members are scoped to the one tenant they are assigned.

| Not to be confused with                          | What it is                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform `accountId`                             | The Blocks account that owns/installs the app — always filtered, not configurable                                                                                                                                                                                                               |
| Reserved `tenantId` column                       | Platform-managed header column — never in a table artifact                                                                                                                                                                                                                                      |
| **App access permission** (Build / Manage / Use) | Platform membership setting in **Invite & Share / Members**, **not app roles**. **Can build** = edit the app and see all tenants; **Can manage** = use the app, invite people, set their access and roles, and see all tenants; **Can access** = end-user access, scoped to the assigned tenant |
| **App roles** (`artifacts/roles/`)               | Optional in-app personas (Admin, Buyer, Seller, …) that branch UI via `user.role`                                                                                                                                                                                                               |
| Portal / linkage table                           | User↔entity mapping for scoped UIs without full tenancy — see `roles-and-authentication` and `roles/roles.md`                                                                                                                                                                                   |

## Tenancy is enabled in the UI, not in artifacts

Artifact sync does not set `multiTenant` scope or `tenantTableBlockId`. Do **not** add `multiTenant` fields to table artifact JSON — they are ignored on sync. Your job is to build a **tenant-ready** data model, tell the user how to switch tenancy on afterwards, and record the setup in `memories/STORY.md` (tenant table name, which tables are tenant-owned vs shared, and that UI enablement is pending).

## Tenant-ready data model

1. **A tenant table** whose rows are tenants — `Companies`, `Organizations`, `Workspaces`, `Clinics`. Set `displayColumn` to the human-readable name column; it labels the tenant pickers.
2. **Reference chains.** Every table of tenant-specific business data needs a `reference` column chaining back to the tenant table, either direct (`Products.companyId → Companies`) or one hop away (`Activities.opportunityId → Opportunities.companyId → Companies`). Use the standard `reference` mechanism from [`app-artifacts/tables/tables.md`](../app-artifacts/tables/tables.md).
3. **Shared lookup tables** (statuses, categories, countries, product catalogs) get no tenant reference.
4. **Never add a `tenantId` column** — it is reserved and added by the platform, in any case or variant.

Blocks auto-detects scope from those chains when the user enables tenancy: exactly one reference path to the tenant table → **Private to tenant**; no unambiguous path → **Shared across tenants**, which is the right answer for lookups.

## Build and Use are app access permissions, not app roles

They are assigned per member in **Invite & Share / Members**, never as role artifacts:

- **Can build** (`permission: 'build'`, "Access and Edit") — sees all tenants and can create rows for any of them; the platform resolves `tenant_id` from the reference columns on insert.
- **Can access** (`permission: 'use'`, "Access only") — sees only their assigned tenant's rows; ordinary CRUD works unchanged once tenancy is on.

Do **not** create role artifacts named "Build", "Use", "Admin", or "Tenant User" to model this. A multi-tenant SaaS often needs no role artifacts at all — just Build members and Use members. Add roles only for genuinely distinct in-app personas beyond Build vs Use; see [`app-artifacts/roles/roles.md`](../app-artifacts/roles/roles.md).

## Pass these to the frontend agent

- Data is auto-scoped for Use members — no manual `tenantId` filter in any query; normal `useEntityGetAll` and CRUD work.
- Hide or auto-set the tenant reference column (e.g. `companyId`) for Use members, since the platform fills `tenant_id` from their session. Show the picker only to Build members.
- Build members may need tenant selectors or cross-tenant list pages.
- `user.role` (app roles) and `user.permission` (Build/Use) are different things — branch on them separately.

## Tell the user how to enable it

Multi-tenancy is inactive until the user does this, so give them these steps at the end of the build, with these labels.

**Step 1 — Enable multi-tenancy.** **Settings** (gear icon, top bar) → **App permissions** → the **Data Permissions** card ("Control who can access data") → toggle **Enable multi-tenancy** ("Let different groups use this app with their own private data.") → under **Tenant table**, select the tenant table (e.g. **Companies**) → review the auto-detected groupings: **Private to tenant**, **Shared across tenants** (badged "Auto-detected by Ella"), and **System-level** for rare app-wide config → for each **Private to tenant** table confirm the **Select a column** picker names the right reference column → **Apply changes**.

**Step 2 — Assign users to tenants.** **Invite & Share** (top bar) or **Settings → Members**. Set each member's app access permission to **Can build** (edits the app, sees all tenants), **Can manage** (invites people and sets roles, sees all tenants) or **Can access** (end user, scoped). For **Can access** members also set their tenant, labeled with the singular tenant table name (e.g. **Company**): "The tenant under which this user's access and data will be managed". App roles, if the app has any, are assigned separately.

## Row and column policies

Per-user isolation without enabling tenancy: **Settings → App permissions → Data Permissions** → expand a table row → **Row Policies** or **Column Policies**, e.g. `createdBy = {{user.id}}` for "users see only rows they created". They complement tenancy rather than replacing it.
