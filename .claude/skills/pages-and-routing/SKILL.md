---
name: pages-and-routing
description: How pages, URLs, and project file structure work — the folder structure under src/routes/ IS the routing (index.tsx, layout.tsx, [param], [...splat]), root/section layouts with Outlet, navigation (Link, useNavigate, getRouteUrl), dynamic params, and the not-found catch-all page via React Router v8. Load this skill whenever adding or renaming a page, deciding where a file goes or how to structure the project, changing URLs or navigation links, nesting layouts, or handling 404s and error states. Never use src/pages/ — that model is retired.
user-invocable: false
---

# Pages & Routing — the folder structure IS the URL structure

Route modules are `.tsx` files under **`src/routes/`**. The **folder structure is the URL structure** — the build discovers them automatically, with **no route registration step**.

**React Router v8 only.** Use library APIs: `Link`, `NavLink`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`, `Outlet`, `generatePath`, `matchPath`. No framework-mode APIs (no loaders, actions, meta, `routes.ts`).

**Never create `src/pages/`** — retired legacy model. Never mix `pages/` and `routes/`.

**Reserved:** `/auth/*` is platform-owned (login/logout) — never define routes under it.

## Folder → URL

| File                          | URL                | Notes                                                                                                                                  |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/index.tsx`            | `/`                | Root index — a pure redirect to the first declared page mini-app, else the first agent; or the home of a sole mini-app at `/` (rule 0) |
| `routes/about.tsx`            | `/about`           | Leaf route                                                                                                                             |
| `routes/concerts/index.tsx`   | `/concerts`        | Index under concerts folder                                                                                                            |
| `routes/concerts/[city].tsx`  | `/concerts/:city`  | Dynamic segment — read with `useParams()`                                                                                              |
| `routes/concerts/layout.tsx`  | (layout)           | Section layout — **must render `<Outlet/>`**                                                                                           |
| `routes/not-found.tsx`        | (404)              | The app's 404 page — see below                                                                                                         |
| `routes/files/[...rest].tsx`  | `/files/*`         | Catch-all                                                                                                                              |
| `routes/orders/[id]/edit.tsx` | `/orders/:id/edit` | Param folders work too                                                                                                                 |

**Reserved basenames** inside `src/routes/`: `index.tsx` (folder index), `layout.tsx` (folder layout), and `not-found.tsx` (folder 404). Everything else is a plain route named by its file.

**`[param]` and `[...splat]` brackets are the only special filename syntax.**

A folder **without** `layout.tsx` just adds URL segments (no wrapper). Add `layout.tsx` only when the section needs shared chrome.

**Only route modules (`.tsx`) belong under `src/routes/`** — components, hooks, and utils go in their own folders (`src/components/`, etc.), never co-located inside `routes/`.

## Structuring an app — the shape to aim for

A well-structured mid-size app looks like this; the annotations are the rules:

```text
src/
├── main.tsx                    ← the app's entry, the platform's: read-only, never edit
├── root.tsx                    ← app shell: nav + <Outlet/> (see app-layout skill)
├── index.css                   ← the single stylesheet
├── routes/
│   ├── index.tsx               ← "/"  pure redirect to the first declared page mini-app (rule 0)
│   ├── portal/                 ← a PAGE MINI-APP at "/portal" — a folder, per its declared entry route
│   │   ├── index.tsx           ← "/portal"  the mini-app's home
│   │   ├── customers.tsx       ← "/portal/customers"  ONE url for this feature → flat file, no folder
│   │   ├── orders/             ← a SECTION: several related urls share the /portal/orders prefix
│   │   │   ├── layout.tsx      ← only exists because the section shares chrome (tabs/header)
│   │   │   ├── index.tsx       ← "/portal/orders"  the list
│   │   │   └── [orderId].tsx   ← "/portal/orders/:orderId"  bookmarkable detail (only if asked for)
│   │   └── settings/           ← folder WITHOUT layout.tsx — groups urls, adds no wrapper
│   │       ├── index.tsx       ← "/portal/settings"
│   │       └── notifications.tsx  ← "/portal/settings/notifications"
│   ├── booking/                ← a second PAGE MINI-APP at "/booking" — same rules inside its folder
│   │   └── index.tsx           ← "/booking"
│   ├── support/                ← an AGENT MINI-APP at "/support" — its files: the agent-mini-apps skill
│   │   └── …
│   └── not-found.tsx           ← the app's 404 page (see below)
├── components/
│   ├── OrderStatusBadge.tsx    ← shared by ≥2 routes → earns its own file
│   ├── orders/OrderTable.tsx   ← feature subfolder once a feature has ≥2 components
│   └── ui/…                    ← shadcn, CLI-managed
├── hooks/useDebounce.ts        ← one hook per file
└── utils/DateUtils.ts          ← pure TS, no JSX/hooks
```

Decision rules, in order:

0. **Route trees come from the declared mini-apps.** The items in `artifacts/app.json` `miniApps` each declare an entry route: page mini-apps (`{entryRoute, icon, label}`) and agent mini-apps (`{entryRoute, agent}`). This rule is about how each becomes a folder.
   - **Each segment-mounted mini-app is a folder** — `src/routes/portal/` with `index.tsx` as its home. This is the one exception to "start flat" (rule 1): the folder exists even with one page, because it is the mini-app's boundary and its entry route owns the whole tree.
   - **The root:** unless a page mini-app is declared at `"/"`, `src/routes/index.tsx` only routes the visitor into a mini-app — a pure redirect to the **first declared page mini-app** (`<Navigate to="/portal" replace />`), else to the **first agent mini-app**. When the brief keeps some mini-apps to certain roles, a signed-in user goes to the first page mini-app that is theirs — a mini-app meant for everyone, or for one of their roles, in declared order (the same choice the platform makes from the declaration's `roles`); anyone with none of their own (anonymous included) takes the first mini-app meant for everyone. Still nothing rendered, still `replace`. This root is the only route outside every mini-app. A sole mini-app declared at `"/"` skips both the folder and the redirect: the root of `routes/` is its tree, and rules 1–5 apply directly there. (The design canvas opens builders on the first declared page mini-app, or on a role's first under View as role — verify role routing in the standalone app.)
   - **Agent routes** (items with `agent`) are folders too, with `new` and `threads` reserved inside; every other routing rule applies. What goes in the folder is the `agent-mini-apps` skill's contract — load it before building one.
   - **Stay in sync:** when your brief lacks the `ENTRY ROUTES` block, read the declaration before structuring routes; report any deviation (a mini-app — page or agent — mounted at a different URL, added, or dropped) so the orchestrator updates it; inner pages of a tree are never mini-apps.
1. **Start flat.** One URL for a feature = one file directly in its mini-app's folder (or `routes/` when the app declares no mini-apps). Do not pre-create folders for features that have a single page — only mini-app roots (rule 0) are born as folders.
2. **Fold into a folder when the second related URL appears.** `orders.tsx` becomes `orders/index.tsx` + `orders/[orderId].tsx` the moment a sub-URL exists — the folder is the URL prefix, nothing more.
3. **Add `layout.tsx` only for shared chrome.** Section tabs, a persistent sub-header, a sidebar for that area. A folder with no shared chrome needs no layout — don't create passthrough layouts.
4. **Record detail defaults to a Sheet/Dialog on the list route**, not a route file. Create `[id].tsx` only when a bookmarkable URL is wanted — and a missing/invalid id must redirect to the list, never render an empty shell. An agent mini-app's item deep dive is the standing exception: always `[id].tsx` under its board (the `agent-mini-apps` skill).
5. **Non-route code never lives in `routes/`.** A component used by one route and under ~100 lines stays in that route's file, above the default export; it moves to `src/components/` when a second route needs it or it outgrows that.

## Layouts

| File                   | Role                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/root.tsx`         | **Root layout** — app-wide chrome (nav, sidebar, providers, `<Toaster/>`). Default-export a component that **must render `<Outlet/>`**. Never redirect from a layout.           |
| `routes/**/layout.tsx` | Section layouts — same rule: default export + `<Outlet/>`. A top-level `routes/layout.tsx` wraps all routes, but app-wide chrome belongs in `src/root.tsx` — don't create both. |

```tsx
import { Outlet } from 'react-router';

export default function RootLayout() {
  return (
    <div>
      <nav>{/* … */}</nav>
      <Outlet />
    </div>
  );
}
```

Migrated apps may still have their legacy layout as a plain component (`src/components/layout.tsx`) that the generated `root.tsx` wraps around its `<Outlet/>` — inline it into `root.tsx` when convenient.

## Route module contract

Each route file exports **only a default React component**. No `loader`, `action`, `ErrorBoundary`, or `meta` exports — call APIs from the component.

```tsx
export default function AboutPage() {
  return <h1>About</h1>;
}
```

## Navigation

```tsx
import { Link, useNavigate, useParams } from 'react-router';
import { getRouteUrl } from '@blocksdiy/blocks-client-sdk/reactSdk';

// Static URLs — use real paths
<Link to="/dashboard">Dashboard</Link>;

// Dynamic routes — use getRouteUrl
<Link to={getRouteUrl('concerts/:city', { city: 'berlin' })}>Berlin</Link>;
// → /concerts/berlin

const { city } = useParams();
const navigate = useNavigate();
navigate(getRouteUrl('concerts/:city', { city: 'paris' }));
```

- Never `to="#"` or `href="#"` placeholder links.
- Never `window.location` for internal navigation.
- **Never nest one mini-app's routes inside another's folder** — each entry route owns its own tree (rule 0). Whether and how a page may link into another mini-app is the `app-layout` skill's rule ("Mini-apps link like apps").
- **`getPageUrl('Name')`** remains only for migrated flat pages; new code uses real URLs / `getRouteUrl`.

## Landing page (`/`)

The landing page is **`routes/index.tsx`** — every app must have one. Without it, `/` renders nothing. With declared mini-apps, rule 0 already dictates its content: the redirect into a mini-app, or the root-mounted mini-app's home. Only in an app with no declared mini-apps (a migrated legacy app — every new app declares at least one) may an existing page be re-exported as the landing page:

```tsx
// routes/index.tsx — apps WITHOUT declared mini-apps only
export { default } from './dashboard';
```

## Unmatched URLs — `not-found.tsx` (404)

A URL that matches no route falls back to the **platform's unbranded default 404**, so users never see a blank screen. Don't leave it at that: every app should own its not-found page so it matches the app's design. Create **`routes/not-found.tsx`** — it replaces the default automatically:

```tsx
// routes/not-found.tsx — keep it simple: heading, one line, a way home
import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn't exist or has moved.
      </p>
      <Link to="/" className="underline">
        Back to home
      </Link>
    </div>
  );
}
```

It renders inside `root.tsx` like any route, so it inherits the app's chrome and theme. A `not-found.tsx` inside a section folder (e.g. `routes/orders/not-found.tsx`) catches unmatched URLs under that section only. A **missing/invalid record id** on a dynamic route is a different case — redirect to the list route (structure rule 4), don't show the 404.

## Errors — who handles what

- **Render crashes are platform-owned.** Never add `ErrorBoundary` exports, app-wide error boundaries, or a boundary in `root.tsx` — the platform catches render errors outside the app and surfaces them (in the builder, with the details needed to fix them). A boundary inside the app would swallow that signal.
- **Data errors are page-owned.** Every fetch/action call needs loading, error, and empty branches — a failed fetch shows a readable message with a way forward (retry, back link), never a blank section and never an unhandled throw during render.
- **Missing/invalid record ids redirect** to the list route (structure rule 4) — not a 404, not an empty shell.

## Migrated legacy apps

A migrated legacy app has this shape:

| Older shape                                         | In a migrated app                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/pages/**`                                      | `src/routes/**` (1:1 directory copy; URLs preserved)                                                      |
| Reserved basenames (`index`, `layout`, `not-found`) | `<name>/index.tsx`                                                                                        |
| `src/layout.tsx`                                    | A regular component (`src/components/layout.tsx`), wrapped by generated `src/root.tsx` around `<Outlet/>` |
| App default page                                    | Generated `routes/index.tsx` re-exporting it — edit it to change the landing page                         |

You may inline/refactor `layout.tsx` into `root.tsx`, and reorganize flat migrated files into folders on later edits.
