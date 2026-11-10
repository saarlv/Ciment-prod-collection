---
name: app-layout
description: Creating or modifying src/root.tsx and section layout routes — the app shell and nested layouts that render Outlet. Load this skill when adding navigation (sidebar, top nav, header, footer), implementing auth-aware layout behavior, or building any persistent shell around route content. Use it proactively whenever the task involves layout, navigation structure, or persistent UI outside individual route modules.
user-invocable: false
---

# App Layout

**`src/root.tsx`** is the root layout — app-wide chrome (nav, sidebar, providers, `<Toaster/>`). It default-exports a component that **must render `<Outlet/>`** from `react-router`. Route modules under `src/routes/` render into that outlet; they never import `root.tsx`.

An app with an agent mini-app has `FloatingAgentChatProvider` (from `@/components/ui/floating-agent-chat`) once in the layout that wraps the whole app — this file, or a top-level `routes/layout.tsx` — never in one mini-app's `layout.tsx` (the `agent-mini-apps` skill).

**Section layouts** are per-folder `layout.tsx` files that render `<Outlet/>` — e.g. `routes/concerts/layout.tsx` wraps `routes/concerts/index.tsx` and `routes/concerts/[city].tsx`. See the `pages-and-routing` skill for naming conventions.

**One shell per mini-app.** Each mini-app (the brief's `ENTRY ROUTES` block / `artifacts/app.json` `miniApps`) gets its shell in its folder's `layout.tsx` (the folder: the `pages-and-routing` skill's rule 0); an agent mini-app's shell is `AgentLayout` per the `agent-mini-apps` skill. `root.tsx` keeps only chrome shared across mini-apps (providers, `<Toaster/>`, auth branching); when the only mini-app is at `/`, `root.tsx` is its shell.

**Mini-apps link like apps — they never share a layout.** A shell's nav lists **its own folder's routes only**: no app-wide nav re-listing the mini-apps, no other mini-app's pages rendered under this layout, and the brand mark, "Home" and "Back" links land on **this** mini-app's entry route (never on `/`, unless `/` is that entry route). When this mini-app's users need a screen another mini-app has, link to it; build a copy here over the same data only for people kept out of that mini-app (a portal's customers). Linking _to_ another mini-app is fine wherever it suits the flow, even though the platform's rail already lists every mini-app the user is shown: a plain link to any URL in that mini-app's tree — `<Link to="/admin">` or `<Link to="/admin/requests/42">`, a user-menu item, a button on a page — which leaves this shell behind; never a sidebar section re-listing mini-apps. Sign-in / sign-out wiring: [building-blocks.md](./building-blocks.md).

Match each mini-app's shell to its use case: many sections → sidebar; a few → top nav; a list-and-detail app or an editor → split panel; a single-purpose utility → a slim header, or nothing at all.

**A sidebar is always the shadcn sidebar component** — install it and pull its API docs (variants, collapsible modes, `isActive`) via the `shadcn` skill rather than assembling one from divs.

## Contracts

1. Read the current `src/root.tsx` first and preserve its behavior unless the prompt says to change it. Migrated apps may still have a separate legacy layout component (`src/components/layout.tsx`, imported by `root.tsx`) — inline into `root.tsx` when convenient.
2. Render `<Outlet/>` on every code path, including the unauthenticated one (the one exception: a mini-app's `layout.tsx` denying in place — the `roles-and-authentication` skill).
3. Never redirect from a layout — route modules own auth redirects.
4. Navigation URLs are real paths (`/dashboard`) or `getRouteUrl(pattern, params)` for dynamic routes — see the `pages-and-routing` skill.
5. Highlight the current link with the nav component's `isActive` prop, not a manual `bg-*` class.

## Building blocks

[building-blocks.md](./building-blocks.md) carries the platform wiring for the pieces you assemble into the design: auth-aware branching, the user menu with logout, the theme mode switcher, role-based shells, and RTL / runtime language switching.
