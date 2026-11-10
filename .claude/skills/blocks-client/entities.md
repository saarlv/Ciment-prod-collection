# Entities — CRUD, views, dates, and real-time sync

Hooks from `@blocksdiy/blocks-client-sdk/reactSdk`, entities from `@/product-types`. A `<ClientProvider>` already wraps the app.

## Instance types

Two types cover everything — there is nothing to look up in the SDK's `.d.ts` files:

```tsx
import type { EntityType } from '@blocksdiy/blocks-client-sdk'; // root package — /reactSdk does not export it

type Task = EntityType<typeof TaskEntity>; // a row you READ: instance fields + id, createdAt/updatedAt, createdBy/updatedBy, createdByAgentId/createdByAgentThreadId
type TaskDraft = (typeof TaskEntity)['instanceType']; // what you WRITE: the mutable fields only — no id or timestamps
```

Rows returned by the read hooks are `EntityType<…>`; typing them with `instanceType` fails the type-check the moment you touch `row.id`. Never hand-write an `interface Task` — it drifts from the generated schema on the next `pnpm gen:types`.

## Reading

```tsx
import {
  useEntityGetAll,
  useEntityGetOne,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import { TaskEntity, ProductEntity } from '@/product-types';

const { data: tasks, isLoading } = useEntityGetAll(TaskEntity);

// 2nd arg: a query — `where` picks the rows, `orderBy` orders them. 3rd arg: query options.
const { data: myOpenTasks } = useEntityGetAll(
  TaskEntity,
  {
    where: {
      and: [
        { column: 'assignedTo', value: user.id }, // operator defaults to '='
        { column: 'status', operator: 'in', value: ['todo', 'in_progress'] },
      ],
    },
    orderBy: [{ column: 'dueDate', direction: 'asc' }],
  },
  { enabled: !!user.id },
);

const { data: product } = useEntityGetOne(
  ProductEntity,
  { id: productId }, // useEntityGetOne takes key/value filters: { email: 'a@b.com' }
  { enabled: !!productId },
);
```

`useEntityGetAll` returns `{ data, isLoading, error, isError, isFetched, isFetching, isSuccess, status, hasNextPage, fetchNextPage, isFetchingNextPage }`; `useEntityGetOne` the same without the paging fields.

**The query** — always pass one of these three keys, never bare `{ column: value }` pairs:

- `where` — a condition `{ column, operator?, value }`, or `{ and: [...] }` / `{ or: [...] }` of nested conditions; add `not: true` to negate any of them. Operators: `=` (default), `!=`, `>`, `>=`, `<`, `<=`, `in` / `not in` (array `value`), `is null` / `is not null` (no `value`). `column` is a field name of the entity, system fields included (`id`, `createdAt`, `updatedAt`, `createdBy`, …) — TypeScript rejects unknown names, and the server silently ignores a condition on a column that does not exist, so never build `column` from untyped strings.
- A calculated column (one defined by an `expression`) can be read but never used in `where` or `orderBy` — the server rejects it with `CALCULATED_COLUMN_NOT_QUERYABLE`. It is never stored, so do not send a value for it on create or update (it is dropped). Filter or sort on the stored columns it is computed from, or on a SQL `expression` in a view's `select`.
- `orderBy` — `[{ column, direction?: 'asc' | 'desc' }, …]`. With no `orderBy`, rows come back oldest first (`id` ascending, creation order), paged or not — for the latest rows first (a feed, recent orders), pass `orderBy: [{ column: 'id', direction: 'desc' }]` — `id` follows creation order and is indexed, so it is the fast newest-first sort; `createdAt` gives the same order but is not indexed, so every page sorts the whole table. `id` is always the final tie-breaker.
- `page` — `{ size }` turns on paging. See Paging below.

Import the query types from the root package when you need to name them: `import type { EntityQuery, EntityWhereClause } from '@blocksdiy/blocks-client-sdk';`.

**Every read returns at most one server-side limit of rows** — a large table is never returned whole. A read without `page` gets the first rows up to that limit and has no way to reach the rest.

Filter **server-side** (with `where`) for user-scoped, large, or sensitive data. Filter **client-side** off one unfiltered list for instant search and for instant cross-group moves (kanban columns, status tabs) — that path is fully optimistic, with no round-trip between groups — but only for tables that stay small (hundreds of rows, not tens of thousands). For a table that can grow, filter with `where` and page.

## Paging large tables

Any list that can grow past a few hundred rows (orders, messages, logs, events, records users keep adding) must be paged. Add `page: { size }` and render a "Load more" button or an infinite-scroll sentinel:

```tsx
const {
  data: orders,
  isLoading,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
} = useEntityGetAll(OrderEntity, {
  where: { column: 'customerId', value: customerId },
  orderBy: [{ column: 'id', direction: 'desc' }], // newest first
  page: { size: 50 },
});

return (
  <>
    {orders?.map((order) => (
      <OrderRow key={order.id} order={order} />
    ))}
    {hasNextPage && (
      <Button onClick={fetchNextPage} disabled={isFetchingNextPage}>
        {isFetchingNextPage ? 'Loading…' : 'Load more'}
      </Button>
    )}
  </>
);
```

- `data` is every page loaded so far, flattened into one array in order — render it exactly like an unpaged list. `hasNextPage` is `false` after the last page; `fetchNextPage()` is safe to call any time (it does nothing while a page is loading or when there is none left).
- For infinite scroll, call `fetchNextPage()` when a sentinel element after the last row enters the viewport (`IntersectionObserver`). Never loop `fetchNextPage()` until `hasNextPage` is false — that is loading the whole table, which is what paging prevents.
- Pages are cursor-based, so they stay correct and fast however deep the user scrolls. Keep the query (where / orderBy / size) stable for the life of the list; changing it (a new search term, a new filter tab) starts a fresh list at page one — that is the right behavior for search and filters.
- Always set `orderBy` on a paged list — users expect newest-first or a meaningful order, and pages follow it.
- Page size: 20–100. Counts or totals over the whole table ("1,284 orders") come from a view entity with an aggregation, never from loading every page.
- View entities and `UserEntity` cannot be paged — the server rejects `page` on them. Read them without `page` and keep views small (aggregate or filter in the view).

Outside React — in an action handler or a one-off script inside the app — use the entity directly: `findMany(query)` returns one array (up to the server limit, or `page.size` rows), and `findPage(query, cursor)` returns `{ rows, nextCursor }`; pass `null` for the first page and each `nextCursor` after, until it is `null`.

## View entities (read-only)

A view artifact `artifacts/views/OrderSummary.json` exports `OrderSummaryEntity` and `IOrderSummaryEntity` after `pnpm gen:types`, exactly like a table. Only `useEntityGetAll` and `useEntityGetOne` work on it — `useEntityCreate`, `useEntityUpdate`, `useEntityDelete`, and `useEntityDeleteMany` do not.

Views sit outside real-time sync: change events fire for the view's source tables, not for the view. A mounted view query does **not** update after an in-app write — the refreshed rows arrive on remount (navigate away and back); `refetch()` is a no-op and focus does not refetch. So never render a mutable list straight from a view: read and mutate the base table entity, and take only the derived fields (computed columns, joined labels, aggregates) from the view.

## Agent attribution — which agent created or changed a row

Every row records whether an app agent created it, and every column records which agent last wrote it — for "ask the agent about this" affordances.

- **Created by** is on the row itself: `row.createdByAgentId` and `row.createdByAgentThreadId` (the conversation it was created in) — `null` when a person created it, or when the agent ran outside a conversation (a workflow step). Filterable like any column: `useEntityGetAll(TaskEntity, { where: { column: 'createdByAgentThreadId', value: threadId } })`.
- **Last changed by, per column** — and the run that created the row — come from `useEntityAttribution`. Not needed for "created by" alone: that is on the row. It is one request per row, so fetch it only when it is needed (a row's menu opening), never for every row of a list:

```tsx
import { useEntityAttribution } from '@blocksdiy/blocks-client-sdk/reactSdk';

const { data: attribution } = useEntityAttribution(TaskEntity, task.id, {
  enabled: menuOpen,
});
attribution?.createdByAgentRunId; // the agent run (one turn) that created the row
attribution?.columns.status?.updatedByAgentId; // the agent that last set `status` — null if a person did
attribution?.columns.status?.updatedByAgentThreadId; // …in which conversation
attribution?.columns.status?.updatedByAgentRunId; // …in which run
```

`columns` is keyed by property name and omits columns the user may not see and columns never written since attribution existed. It refetches itself after every write to the table.

- **Which agent** — ask `useIsAgent`, never compare ids yourself. The rows record the agent's block id while the generated handles (`SupportAgent.id`, `SupportChatAgentChat.agentId`) carry its name, so `task.createdByAgentId === SupportChatAgentChat.agentId` is always false:

```tsx
import { useIsAgent } from '@blocksdiy/blocks-client-sdk/reactSdk';

const { isAgent, isLoading } = useIsAgent(SupportChatAgentChat); // or the agent handle: useIsAgent(SupportAgent)
isAgent(task.createdByAgentId); // true when the support agent created it
isAgent(attribution?.columns.status?.updatedByAgentId); // …or last set its status
```

Call it once per agent at the list or page level and pass `isAgent` down — it is one cached lookup per agent. It answers `false` until that lookup resolves, so hide agent-only affordances while `isLoading`. An id no handle matches is an agent the app has no chat for — offer nothing.

- **Opening the conversation** — a thread id only opens in that agent's mini-app, as `threads/<threadId>` (the `agent-mini-apps` skill → "Linking into a conversation") — including a conversation the agent held from an action's SendAgentMessage node or another chat. Offer the link only when the agent has a mini-app in this app AND the thread id is set.

## Writing

| Hook                     | Returns                             | Call with                                                 |
| ------------------------ | ----------------------------------- | --------------------------------------------------------- |
| `useEntityCreate(E)`     | `{ createFunction, isLoading }`     | `createFunction({ data: {…} })` → the new row             |
| `useEntityCreateMany(E)` | `{ createManyFunction, isLoading }` | `createManyFunction({ data: [{…}, {…}] })` → the new rows |
| `useEntityUpdate(E)`     | `{ updateFunction, isLoading }`     | `updateFunction({ id, data: {…} })` → the updated row     |
| `useEntityDelete(E)`     | `{ deleteFunction, isLoading }`     | `deleteFunction({ id })`                                  |
| `useEntityDeleteMany(E)` | `{ deleteManyFunction, isLoading }` | `deleteManyFunction({ ids })`                             |

```tsx
import { useEntityCreate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { toast } from '@/components/ui/toast';

const { createFunction, isLoading } = useEntityCreate(TaskEntity);

const newTask = await createFunction({
  data: { title, status: 'todo', assigneeId: user.id },
});
toast.add({ title: `Task "${newTask.title}" created`, type: 'success' });
```

Success feedback uses the shadcn `toast` component on `base` apps (the default) — install it with the shadcn CLI and render its `<Toaster />` once in the layout (see the `shadcn` skill). On legacy `radix` apps it is `toast.success()` from `sonner` instead.

`useEntityUpdate(UserEntity)` does not work — user records are server-owned and reject writes from the app. See the `roles-and-authentication` skill.

## Instant UI updates & real-time sync

- **Updates and deletes are optimistic.** Every cached copy of the row (in `useEntityGetAll` lists and `useEntityGetOne`) is patched — or the row removed — the moment the mutate function is called, and rolled back automatically if the server rejects. So don't build per-row "deleting…" spinners and don't filter the row out of local state: it is already gone from `data` while the request runs.
- **Creates land on success** — the new row is written into unfiltered lists, and `useEntityGetOne(E, { id: newRow.id })` is pre-seeded, so navigating to its detail page renders instantly.
- **External changes are pushed** — rows created, updated, or deleted by workflows, agents, or other users arrive over websockets and merge into cached data.

Unfiltered `useEntityGetAll(E)` and `useEntityGetOne(E, { id })` are maintained purely by those cache writes. Lists with a query (`where`, `orderBy`, `page` — paged lists refetch every loaded page) and non-id one-queries can't be reconciled client-side — the server decides which rows match and in what order — so the SDK refetches them in the background after each write: an update patches the row's fields instantly but the row joins, leaves, or moves within such a list only when that refetch lands, and a created row appears there only after it. Deletes are exact everywhere, instantly.

That refetch is automatic, so `refetch()` and polling are never your job, and mirroring `data` into `useState` goes stale and breaks the live updates (copying individual field values into form state is fine).

Writes are client-rate-limited: a burst of repeated writes to the same row throws. Save on blur or submit, or debounce — never call `updateFunction` on every keystroke.

## Dates, times & timezones — read before building any date/time field

The rule depends on the column `type` in the table artifact. Getting it wrong gives the classic "picked 17:00, UI shows 14:00, table stores 11:00" drift — one shift per unnecessary conversion.

- **`time` (`"17:00"`) and `date` (`"2026-07-03"`) are bare wall-clock values with no timezone.** Bind the input value straight to the field and store the exact string the user chose. Never put one through `new Date(...)`, `.toISOString()`, `getTimezoneOffset()`, `toLocaleTimeString()`, or any local↔UTC conversion — each one silently adds or subtracts the offset. Build hour dropdowns from plain strings (`"09:00"`, `"10:00"`), not from `Date` objects.
- **`datetime` is an absolute instant, stored and returned as a UTC ISO string (`…T…Z`).** Convert exactly once at each boundary: `new Date(task.dueAt).toLocaleString()` to display, `new Date(e.target.value).toISOString()` to write from a `datetime-local` input. Never call `.toISOString()` on a value that is already a UTC ISO string, and never hand-adjust the offset on top of what `new Date(...)` / `toLocaleString()` already did.

## User extension entity pattern

User records are server-owned and cannot be written from the app. For extra per-user fields, add a table with an `email` column and look it up by the current user's email — only user extension entities are looked up by email; everything else references the extension row's `id`.

```tsx
const user = useUser();

const { data: profiles } = useEntityGetAll(UserProfileEntity, {
  where: { column: 'email', value: user.email },
});
const profile = profiles?.[0];

const { data: tasks } = useEntityGetAll(
  TaskEntity,
  { where: { column: 'assignedProfileId', value: profile?.id } },
  { enabled: !!profile?.id },
);

// Save: update when the row exists, otherwise create it with the email that links it to the user.
profile
  ? await updateFunction({ id: profile.id, data: formData })
  : await createFunction({ data: { ...formData, email: user.email } });
```
