---
name: agent-mini-apps
description: Building or changing an agent mini-app — an `artifacts/app.json` miniApps item with `agent` (an agent route in your brief's ENTRY ROUTES) — its folder under src/routes/, the layout.tsx that IS the mini-app (AgentLayout from the agent-layout registry item), the redirect at index.tsx, the new-chat page at new.tsx, the threads/ pages, and the agent's own pages listed in the sidebar — its work board and item deep dive. Load this before touching any agent mini-app — creating one, adding a page to one, changing who sees what in it, or wiring its suggestions — even if pages-and-routing or blocks-client is already loaded; those tell you where files go, this tells you what goes in them.
user-invocable: false
---

# Agent mini-apps

An **agent mini-app** is one agent's space — the agent owns a whole job for the people who use it, like a colleague. It is a folder at its declared entry route whose shell is a conversations sidebar (the agent's persona, the agent's pages, "New chat", the live conversation index, the signed-in user's menu) beside the route content. The chat, the conversation list and feedback are built in; what you build are the agent's pages — its **work board** and **item deep dive** (below), from the brief's `MINI-APPS` paragraph for this agent.

Everything here comes from ONE registry item, `agent-layout` (it brings `agent-chat` along):

```bash
yes n | CI=1 pnpm dlx shadcn@4.23.0 add ./.blocks-registry/agent-layout.json -y
```

Then import from `@/components/ui/agent-layout` (`AgentLayout`, `AgentConversation`, `AgentViewport`, the parts) and `@/components/ui/agent-chat` (`AgentChatSimple`).

**Floating agent chat.** The layout's sidebar picks open the app's floating agent chat (`floating-agent-chat.tsx`, installed with the layout): the conversation in a panel over the page, in every mini-app. An app with an agent mini-app must have `FloatingAgentChatProvider` once in the layout that wraps the whole app (`src/root.tsx`, or a top-level `routes/layout.tsx`) — add it with the layout; without it, picks navigate. Give it `agents`, one entry per agent mini-app — `{ agent: <Name>Agent, agentChat: <Name>ChatAgentChat, entryRoute: '/<the mini-app's entryRoute>' }` (the handles from `@/product-types`, the route from `artifacts/app.json`) — and the platform's rail (the chat bubble on an agent's row) opens a new chat with any of those agents in the floating chat panel, from anywhere in the app. Every turn in the floating chat carries `urlContext` — the page's route params and search params (a repeated key as an array) — beside `chatContext`: the provider's own `chatContext` (the app's, for every floating conversation — a module-level constant, like `agents`) under the opener's (the layout's on a sidebar pick; `open`'s) — plus what the page itself tells the agent: its entity reads and `useAgentContext` (the `blocks-client` skill → agents.md).

## The layout IS the mini-app — nothing around it

`layout.tsx` returns the layout as the **entire** route element. No page header naming the agent above it (the layout carries the persona itself), no wrapping card, padding or height math, no second nav, no `h-screen`. The layout's sidebar already carries the user menu, theme mode and sign out, so an agent-only app needs no other chrome at all. The layout fills from where it starts to the bottom of the viewport on its own.

## The folder

Worked example — the brief's `ENTRY ROUTES` names `/support (SupportAgent)` and its `MINI-APPS` paragraph says: _"/support is SupportAgent's mini-app for the support managers (role SupportManager), who direct the agent; nobody else enters it. Its job: resolve every ticket from first message to closed. Its work items are TicketsEntity, stages New → Investigating → Resolved; a card shows agentStatus, red with neededAction or openQuestion when needsYou; metrics from TicketMetricsEntity. The deep dive shows the customer's message, their past tickets, the agent's recommendation and reasoning, the draft reply, TicketEventsEntity as its timeline; Approve calls SendApprovedReplyAction when neededAction is "Approve reply"."_ Every name below comes from that; substitute yours.

```text
src/routes/support/
├── layout.tsx            the mini-app's shell → <AgentLayout> (who sees it: below)
├── index.tsx             "/support"                     a plain redirect → <Navigate replace /> to the work board
├── new.tsx               "/support/new"                 the EMPTY NEW CHAT   → <AgentConversation suggestions />
├── threads/
│   ├── index.tsx         "/support/threads"             redirect to "/support/new"
│   └── [threadId].tsx    "/support/threads/:threadId"   one conversation     → <AgentConversation threadId />
└── tickets/
    ├── index.tsx         "/support/tickets"             the WORK BOARD, listed via `links`
    └── [ticketId].tsx    "/support/tickets/:ticketId"   the ITEM DEEP DIVE
```

- `layout.tsx`, `index.tsx`, `new.tsx`, `threads/index.tsx` and `threads/[threadId].tsx` are **mandatory** — the sidebar navigates to these URLs.
- **`new` and `threads` are reserved.** Every other name is yours.
- **`index.tsx` is an ordinary redirect** — file-system routing decides where the mini-app opens, nothing else to declare. The work board — `<Navigate to="/support/tickets" replace />` — unless the brief says this agent has no work items and opens on the new chat: `<Navigate to="/support/new" replace />`. The persona header at the top of the sidebar navigates to the entry route, so it lands wherever `index.tsx` sends it.
- The rest of the folder follows the `pages-and-routing` rules as usual (flat files, fold into a folder at the second URL, `layout.tsx` only for shared chrome). The deep dive is always a `[id]` route under its board. Nested pages inherit the shell and their sidebar link stays lit (`/support/tickets/42` lights "Tickets").
- **Pages are the ones the brief describes for this mini-app** — the work board and the item deep dive the `MINI-APPS` paragraph specifies for this agent, plus any further page it names. Build those, and **propose** in your report the ones you see missing — never add unbriefed pages. This folder holds the agent's pages, not the app's: when a briefed page reads as the app's rather than the agent's (records that aren't its work items, a screen several agents share, admin), say so in your report as a page-mini-app candidate — the orchestrator owns the split.

## `layout.tsx` — the shell, and who sees it

**Signed-in users only.** The layout lists the agent's conversations and is never rendered for an anonymous visitor (it throws). In a private app the platform's login already guarantees that, so `layout.tsx` is just the layout. In a **public** app, branch on `user.isAuthenticated` first and give guests a sign-in prompt (the `public-app` skill); the floating agent chat has the same gate, so call `open()` only for a signed-in user.

Anything narrower — some roles see the shell, others don't — is the app's ordinary decision, made here from what the brief says about who uses this mini-app, exactly like deciding who sees a button: the `roles-and-authentication` skill (deny in place, never a redirect). Not a rule of this skill. The orchestrator also lists those roles in the declaration's `roles`, so the platform's rail hides the mini-app from everyone else — but a direct URL still opens it, so this check stays. Neither is the agent's `adminRoles`, which only decides who gets the admin chat (feedback, the admin tools) inside the shell.

```tsx
// src/routes/support/layout.tsx
import {
  useAgentChat,
  useEntityGetAll,
  useUser,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import { TicketIcon } from 'lucide-react';
import { Outlet } from 'react-router';
import { AgentLayout } from '@/components/ui/agent-layout';
import { SupportChatAgentChat, TicketsEntity } from '@/product-types';

export default function SupportLayout() {
  const agentChat = useAgentChat(SupportChatAgentChat); // the mini-app's own block, from the brief's AGENTS line — its artifact carries `"isAdmin": true`
  const user = useUser();
  // The sidebar count is live: it comes from the work-item TABLE (a view would go stale — the
  // layout stays mounted for the whole mini-app and views don't update after a write).
  const { data: waiting } = useEntityGetAll(TicketsEntity, {
    where: { column: 'needsYou', value: true },
  });
  const needYou = waiting?.length ?? 0;

  // Public app only — in a private app the platform's login already keeps guests out; drop this branch.
  if (!user.isAuthenticated) return <SignInPrompt />; // yours to write — the public-app skill

  // Narrower than "everyone signed in" ONLY when the brief says so — an ordinary role check, e.g.
  // `if (user.role !== 'support_manager') return <NotForYourAccount />;` (roles-and-authentication skill)

  return (
    // "New chat", the conversation list and the user menu (theme, sign out) are the block's own;
    // `links` are only this mini-app's pages. `userMenuItems` only when the app needs an extra item.
    <AgentLayout
      agentChat={agentChat}
      links={[
        // The board's link carries the count of items waiting on a person: "Tickets (6)".
        {
          icon: TicketIcon,
          label: needYou > 0 ? `Tickets (${needYou})` : 'Tickets',
          path: '/support/tickets',
        },
      ]}
    >
      <Outlet />
    </AgentLayout>
  );
}
```

When the brief wants people who don't get the shell to still chat with the agent at this route, render `AgentChatSimple` for them over **their own** agent-chat block (its own handle on the `AGENTS` line), inside `<AgentViewport>` so it fills to the viewport bottom: `<AgentViewport><AgentChatSimple agentChat={theirChat} className="min-h-0 flex-1" /></AgentViewport>` — no `<Outlet/>`, the chat is the whole mini-app for them. `AgentConversation` renders only under `AgentLayout`, never there. A handle you need but the brief doesn't name is a missing artifact: report it, never reuse the layout's handle for another surface. **That block's artifact carries `"isAdmin": false`** — only the block the layout itself is given is `true`. The two sit at the same route, so this is the easiest place to get it backwards.

## The conversation pages

Three files of a few lines each, importing from `react-router` and `@/components/ui/agent-layout`:

- `new.tsx` — `<AgentConversation suggestions={[…]} />`, the empty new chat.
- `threads/[threadId].tsx` — `const { threadId } = useParams()` → `<AgentConversation threadId={threadId} />`.
- `threads/index.tsx` — `<Navigate to="/support/new" replace />`: a thread URL without a thread is a new chat.

**Suggestions belong to `new.tsx` alone.** `AgentConversation` ignores them when `threadId` is set, and `threadId` is never optional on the thread page. Real prompts for this app, never placeholder copy.

`AgentConversation` renders **only** in `new.tsx` and `threads/[threadId].tsx`. A chat embedded in one of the mini-app's pages is `AgentChatSimple` over its own agent-chat block, never `AgentConversation`.

### Linking into a conversation — "talk to the agent about this"

A row an agent created or changed can link to the conversation it happened in, opened at the exact run (turn) that did it:

```tsx
import { threadHref } from '@/components/ui/agent-layout-context';

// created by the agent — the thread is on the row; the run comes from useEntityAttribution
threadHref('/support', task.createdByAgentThreadId, {
  runId: attribution?.createdByAgentRunId ?? undefined,
});
// its status changed by the agent — the column's own thread and run
threadHref('/support', attribution.columns.status.updatedByAgentThreadId, {
  runId: attribution.columns.status.updatedByAgentRunId ?? undefined,
});
// → "/support/threads/<threadId>?runId=<runId>"
```

`?runId=` scrolls the conversation to that run's first message and tints its messages briefly; the thread page passes nothing extra — `AgentConversation` reads it from the URL. A run that isn't in the thread opens the conversation normally. Navigate with the router (`<Link to>` / `navigate`), like any in-app link. Where the ids come from, and when a row has none: the `blocks-client` skill → entities.md → Agent attribution.

To open it beside the page instead, in the floating agent chat as the sidebar does: `useAgentLayout().openConversation({ chatThreadId })` (from `agent-layout-context`; never `useFloatingAgentChat().open` with the layout's handle).

- **Offer the link only when it can open:** the id's agent (`createdByAgentId` / `updatedByAgentId`) is THIS mini-app's agent — `useIsAgent(<Agent>ChatAgentChat).isAgent(id)`, never `=== <Agent>ChatAgentChat.agentId` (the row holds a block id, the handle a name; they never compare equal) — and the thread id is set.
- **The thread id alone is enough, wherever the conversation happened.** A conversation belongs to the agent, not to a chat block: a row the agent wrote from an action's SendAgentMessage node, a workflow (an email follow-up, a scheduled run), or a plain chat elsewhere carries a thread id that `threadHref(basePath, threadId, { runId })` opens and continues here.
- **Everyone who enters the mini-app sees all of the agent's conversations** unless the layout sets `private` (below) — linking doesn't widen who can see a thread; the layout's own access decision (above) still applies.

## The mini-app's pages

Every page is an ordinary route file in the folder with a matching `links` entry — one entry per page, one page per entry, `path` absolute and inside the folder. Pages render in the content column next to the sidebar, scroll on their own, and never wait on the chat runtime (they render instantly even while the conversations sidebar is still loading). Each brings its own header and padding (a `flex flex-col gap-6 p-6` column: title, one-line description and page actions, then the content) — keep it light and consistent across the mini-app.

Pages are data-backed (the app's tables and views, per the `blocks-client` skill) with their loading/error/empty branches; a page with nothing real behind it is not a page. The sidebar already takes people back ("New chat"; the persona header returns to the entry route) — no "back to chat" links of your own. Never nest a second `AgentLayout` inside a page.

**`links` list this mini-app's pages and nothing else**; linking to another mini-app follows the `app-layout` skill ("Mini-apps link like apps").

## The work board and the item deep dive

Every agent that handles work items gets these two pages; the brief's `MINI-APPS` paragraph gives the work-item entity, its stages in order, what a card shows, the metrics view, what the deep dive shows, and the app action behind each step a person takes on an item that waits on them (Approve included). **Human approval is the core of both:** an item waiting on a person is red everywhere it appears — the board's "Needs you" filter and count, the column badges, the card border, the deep-dive header — with a chip naming what is wanted ("Approve outreach", "Customer replied").

### The work board — `tickets/index.tsx`

Every item the agent handles and where each one stands. Top to bottom:

- **A card in the agent's voice** saying what its job is — the persona from `useAgent(<Name>Agent)` (the `blocks-client` skill), the job text from the brief.
- **The metrics**, led by "N need you" (a chart beside them when the brief gives one — the `charts` skill). "N need you" and the per-column counts are counted from the rows the board already loads (live); aggregates over the whole table (value in play, won this month) come from the brief's view entity, which refreshes when the page remounts.
- **The board**: a kanban with one column per stage in the brief's order, and a list toggle showing the same rows as a table (one state, two renderings — `Tabs` or `ToggleGroup` from the `shadcn` skill). A **"Needs you"** filter narrows both to items waiting on a person; each column's badge shows its count of those. Load the rows from the work-item table with `useEntityGetAll` and group client-side while the table stays small (hundreds of rows; the `blocks-client` skill → entities.md, "kanban columns"). For one that grows, load each column with `where` on the stage and `page: { size }`, and take whole-table counts from the metrics view. The stage column's enum values are the columns.
- **Adding and changing items**: the add, edit and move controls the brief names, as ordinary table writes — except on an item that waits on a person: its stage and its wait change only through the brief's app actions (Approve, reject), never a write from the page, so a waiting card is not dragged. When the brief names no action for such a step, leave the control out and say so in your report.
- **A card**: the item's name, the agent's status line (what it is doing and the next step), and when it waits on a person a `border-destructive` border and the action chip. Clicking a card opens the deep dive.

### The item deep dive — `tickets/[ticketId].tsx`

Everything a person needs to decide on one item — always its own route (so the board, an email or a workflow's message can link straight to one item); a missing or unknown id redirects to the board. Top to bottom:

- **The "<Agent> recommends" banner**: the recommendation in one sentence, a "Why" expander with the reasoning, **Approve** and **Ask <Agent>**. The header is red while the item waits on a person. When the agent already acted on its own, the banner says what it did, and the page is where a person reviews and corrects it — through **Ask <Agent>**, since feedback is the conversation's, not a form of yours.
- **Approve** shows only while the item waits on a person with an action to approve (the brief's needed-action column is set), and runs the handle the brief pairs with that action via `useExecuteAction` (the `blocks-client` skill): the action performs the step, advances the stage and clears the wait, and the row updates over live sync (read the item from its table, never from a view — `refetch()` is a no-op). Disable it while it runs.
- **Ask <Agent>** is `useAgentLayout().openConversation('new')` (from `@/components/ui/agent-layout-context`): the agent opens beside the page in the floating agent chat. The page's route params and its entity reads already reach the agent on every turn; for state they don't carry (the selected draft, a computed total) the component that owns it calls `useAgentContext` (the `blocks-client` skill → agents.md). No chat embedded in the page, no second chat block.
- **The question the agent needs answered** when it isn't certain — the brief's question column, shown as a red prompt with Ask <Agent> beside it; this kind of wait has no Approve.
- **Key facts as cards** (the brief's fields: value, confidence, time in stage, expected close).
- **The source** — the original message, email or request — and **account context** from the related entity the brief names (the customer's past orders).
- **"How <Agent> got here"** — the dated notes of the brief's events entity; when a note or the row carries a thread id, link it to the conversation and run where the agent acted (`threadHref`, "Linking into a conversation" above).
- **What the agent prepared** — the draft email, the order lines — marked **"Waiting for you"** while it waits on the person.

Never rebuild the chat, the conversation list or feedback on either page; the sidebar already holds them.

## Props

`AgentLayout` (the block):

| prop            | meaning                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentChat`     | `useAgentChat(<Agent>ChatAgentChat)` — the mini-app's own block; the persona comes from its agent                                                                                   |
| `links`         | `{ icon, label, path }[]` — this mini-app's own pages, in the nav in this order, with "New chat" last, right above the conversations (lucide icon, absolute path inside the folder) |
| `userMenuItems` | Extra `DropdownMenuItem`s in the user menu, when the app has a reason for one                                                                                                       |
| `chatContext`   | Extra context handed to the agent on every turn of every conversation (default; a conversation may override)                                                                        |
| `size`          | `'sm' \| 'md' \| 'lg'` chat density for the whole layout — transcript, composer, header rows, persona (default `md`)                                                                |
| `private`       | Show each signed-in user only their own conversations (default: all of the agent's). A display filter, not access control                                                           |
| `children`      | `<Outlet />`                                                                                                                                                                        |

`AgentLayoutRoot` (the parts form, below) takes `agentChat`, `chatContext`, `size`, `private` and `minimizeTo` plus plain `div` props (`className`, …); the sidebar goes in its `sidebar` prop and `<Outlet />` is its child, `links` become `<AgentLayoutNavLink>` rows in the order you place them with `<AgentLayoutNewChat>` last in the nav (it accepts `children` to relabel the row), `userMenuItems` the children of `<AgentLayoutUserMenu>`, and the first link's `path` is `minimizeTo`.

`AgentConversation`:

| prop          | meaning                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `threadId`    | The `[threadId]` route param — always, on the thread page. Omit on `new.tsx` → the empty new chat       |
| `suggestions` | Starter prompts on the welcome hero; each sends as the first message. `new.tsx` only                    |
| `placeholder` | Composer placeholder                                                                                    |
| `size`        | `'sm' \| 'md' \| 'lg'` chat density; defaults to the layout's `size` — set only to make ONE page differ |
| `chatContext` | Replaces the layout's `chatContext` while this page is mounted (only when a page has a reason to)       |

`AgentViewport`: `div` props — the frame for a lone `AgentChatSimple` (above); it fills to the viewport bottom by itself, so there is no `h-[calc(100dvh-…)]` to get wrong. It is a **row** flex box: give the chat `className="min-h-0 flex-1"`.

## What the layout already does — don't rebuild it

- **The URL is the source of truth.** "New chat" navigates to `/support/new`, sidebar rows to `/support/threads/<id>`; the conversation pages select from the URL; Back/Forward and a deep link to a thread all work through the router. Never add your own thread state, selection, or "current conversation" store.
- **The empty new chat** lives at `new`: a draft conversation with the welcome hero (persona avatar, greeting, your suggestions). The first send turns it into a real thread and the layout swaps the URL to `threads/<id>` without interrupting the reply (`replace`, so Back doesn't return to a state that no longer exists). A deep link to an unknown id simply opens an empty conversation under that id — a plain empty transcript, no hero.
- **The entry route renders at once.** `index.tsx` is a redirect outside the chat runtime, so arriving at the mini-app never waits on the chat resolving — whatever it redirects to takes over.
- **The conversation list is the agent's, whole**: every conversation anyone in the account had with this agent — started here, in a plain chat elsewhere, or by a workflow run — one index, shared among everyone who enters the mini-app, each at its plain `threads/<id>`. `private` on `AgentLayout` narrows the list to each user's own conversations — a display filter, not access control; set it when users must not see each other's conversations (health data, HR, one client per user) and say plainly that it filters the UI rather than securing the data.
- **The sidebar** groups conversations by source (Chats / Workflows / Feedback — `source` is write-once, so a listed row stays in its group whatever the agent does on it — only a legacy `unknown` row moves, once, to its first known source) and marks each row with its status by shape (filled dot: waiting for a person; spinner: a run in progress; hollow ring: ended with an error; none: resting), with the status + source filter on the index's top label, rename, load more, live updates, a throttled refresh on window focus; below `md` it is a sheet, opened from the small-screen bar the content column renders above every page.
- **The chat root is mounted once** in the layout and re-pointed per conversation; switching threads never remounts it. `initialPrompt` is disabled there on purpose.
- **Picks on a page open the floating agent chat** beside the page (below `md`, or without the provider, they navigate); arriving on a conversation route of this agent folds it. The way back is built in too: at `md`+ with the provider, the conversation page's header has **Minimize to the floating chat** — the conversation moves into the floating chat, over the page its expand came from, else the first of `links`. Never add your own back-to-the-floating-chat control.
- **Feedback is built in — on the admin chat only.** When the layout's block carries `"isAdmin": true`, `AgentConversation` renders thumbs under each assistant turn for the agent's **admins** — users with build permission, plus the roles in the agent's `adminRoles` (every signed-in user when it lists none; see [agents](../app-artifacts/agents/agents.md)). No feedback UI shows on any other block, or to anyone else. A thumb opens **Send** / **Add comment**: Send records the rating on the conversation as it is (the agent reads it on its next turn there; no thread opens) and shows as a centred **Feedback sent** chip; Add comment sends a normal message about that reply, answered in the same conversation. There is no feedback button in the composer. The agent may propose a change to itself on a **Remember this rule?** card (a short summary of the change, with the full change under Show details, approved or rejected as is), and an approved change opens a feedback thread (`fb-…`) that appears in the sidebar under Feedback, with a `Feedback · From …` line above its transcript linking back. Never hand-build thumbs, ratings, or feedback forms.
- **Skeletons** cover the sidebar (and the conversation, on conversation routes) while the chat runtime resolves; pages never wait for it. If the agent can't be loaded, an error with a retry takes their place — nothing of yours to build.
- **Signed-in only** — the layout throws for an anonymous visitor.

## Composing your own shell (rarely)

`AgentLayout` is a block built from exported parts. When a mini-app genuinely needs a different sidebar (an extra group, a different order, no user menu because `root.tsx` has one), compose the same parts under `AgentLayoutRoot` instead of editing the component file — this is exactly what the block renders:

```tsx
<AgentLayoutRoot
  agentChat={agentChat}
  minimizeTo="/support/tickets"
  sidebar={
    <AgentLayoutSidebar>
      <AgentLayoutPersona />
      <AgentLayoutNav>
        <AgentLayoutNavLink to="/support/tickets" icon={TicketIcon}>
          Tickets
        </AgentLayoutNavLink>
        <AgentLayoutNewChat />
      </AgentLayoutNav>
      <AgentLayoutConversations action={<AgentLayoutThreadFilter />} />
      <AgentLayoutUserMenu />
    </AgentLayoutSidebar>
  }
>
  <Outlet />
</AgentLayoutRoot>
```

The sidebar is the `sidebar` prop and `<Outlet />` the only child — the root places each where it belongs (the content column is the root's own). `minimizeTo` is where a conversation page's **Minimize to the floating chat** goes when the floating chat's expand did not bring the person there — the first page link, as `AgentLayout` passes it; without it such a page has no minimize. Inside the sidebar, order and selection of parts are yours; every part takes `className`. Keep `action={<AgentLayoutThreadFilter />}` on `AgentLayoutConversations` unless you mean to drop the conversation filters.

## Report

Your final report names, for each agent mini-app you touched: the entry route, who sees what (the layout, a plain chat, the denial state), where it opens, and the pages built as `<Label> (<path>)` — plus any page you recommend adding and why. The orchestrator keeps the declaration and the brief in sync from that.
