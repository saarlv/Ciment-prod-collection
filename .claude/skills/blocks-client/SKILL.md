---
name: blocks-client
description: All data access and platform interaction in this project — entity CRUD (fetch, create, update, delete), executing backend actions, file uploads, current user info, which integrations are connected (to hide features whose integration isn't), page navigation, AI chat, and app agent identity (useAgent for the agent's title, job title, and photos). Load this skill any time the task involves reading or writing data, calling actions, handling user state, navigating between pages, or showing an app agent in the UI. If the task touches data at all, this skill is needed.
user-invocable: false
---

# Blocks Client SDK

React hooks for everything the app does with the platform: data, actions, files, the current user, navigation, and agents. Import hooks from `@blocksdiy/blocks-client-sdk/reactSdk`; import entities, actions, pages, and agents from `@/product-types`. A `<ClientProvider>` already wraps the app — call hooks directly, no setup.

## Every hook, and the sub-doc to read first

| Hook                                             | Purpose                                                            | Read                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------- |
| `useEntityGetAll` / `useEntityGetOne`            | Read rows (where / orderBy / paging) — views too                   | [entities.md](./entities.md)                       |
| `useEntityCreate` / `useEntityCreateMany`        | Create one / many                                                  | [entities.md](./entities.md)                       |
| `useEntityUpdate`                                | Update one                                                         | [entities.md](./entities.md)                       |
| `useEntityAttribution`                           | Per column: which agent last changed it; creating run              | [entities.md](./entities.md)                       |
| `useIsAgent`                                     | Is a recorded agent id this agent? (id or name)                    | [entities.md](./entities.md)                       |
| `useEntityDelete` / `useEntityDeleteMany`        | Delete one / many                                                  | [entities.md](./entities.md)                       |
| `useExecuteAction`                               | Run a backend or AI action                                         | [actions-and-files.md](./actions-and-files.md)     |
| `useFileUpload`                                  | Upload a file, get its URL                                         | [actions-and-files.md](./actions-and-files.md)     |
| `useIntegrationStatus` / `useIntegrationsStatus` | Which integrations are connected — gate features on it             | [actions-and-files.md](./actions-and-files.md)     |
| `useUser` / `useChangeUserRole` / `useThemeMode` | Current user; role change (build or manage permission); dark/light | [user-and-navigation.md](./user-and-navigation.md) |
| `useAgent` / `useAgentChat`                      | Agent identity (title, jobTitle, photos); chat surface             | [agents.md](./agents.md)                           |
| `useAgentContext`                                | Share a component's state with the floating chat                   | [agents.md](./agents.md)                           |
| `useGoogleLogin` / `useSendLoginLink`            | Custom login page only                                             | `public-app` skill                                 |

Two more entry points: **date, time, and datetime fields** have non-obvious timezone rules — [entities.md](./entities.md) → Dates, times & timezones. Navigation, sign-in and sign-out helpers (`getRouteUrl`, `getLoginUrl`, `logOut`): [user-and-navigation.md](./user-and-navigation.md).

## The six rules that apply everywhere

1. **Grep before you import.** `src/product-types.ts` is generated. Import an `…Entity` / `…Action` / `…Agent` symbol only if it is in the file right now — a name from the orchestrator's brief is what it _intended_ to create.
2. **Tables are read-write; views are read-only.** Use a table entity for CRUD on one dataset, a view entity for joins, aggregations, filtered subsets, or computed columns. On a view, only `useEntityGetAll` / `useEntityGetOne` work.
3. **Page every list that can grow.** Reads return at most one server-side limit of rows; a table users keep adding to gets `page: { size }` and a Load more / infinite scroll — [entities.md](./entities.md) → Paging large tables.
4. **The cache maintains itself.** Mutations are optimistic and external changes arrive over websockets, so `refetch()`, polling, and mirroring `data` into `useState` are all unnecessary — and the last one breaks real-time sync.
5. **Type rows you read as `EntityType<typeof EntityName>`** (from the root package) and write payloads as `(typeof EntityName)['instanceType']` — [entities.md](./entities.md) → Instance types. A hand-written interface drifts from the generated schema on the next `pnpm gen:types`.
6. **`useAgent` is not a query.** It returns the identity synchronously — no `data`/`isLoading` to unwrap: `const { title, jobTitle, avatarUrl, photoUrl } = useAgent(<Name>Agent);`

Related skills: `roles-and-authentication` (auth state, protected pages, role-based UI), `public-app` (custom login for public apps), `charts`, `file-parsing`.
