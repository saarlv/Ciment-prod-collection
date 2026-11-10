---
name: app-browser-verify
description: Run the app in a real browser and verify it — console errors, failed network calls, layout overflow/clipping, and whether each screen is focused rather than packed. Load this after lint/type-check/build pass, whenever you changed anything a user can see. Drives Chromium via the Playwright MCP (browser_* tools) against the app's own dev server.
---

# Browser verify — run the app and look at it

`pnpm lint`, `pnpm type-check` and `pnpm build` prove the code compiles. They prove nothing about
what the app _does_. A page that renders while its data call silently 500s, a button whose label
spills out of its frame, a `Select` showing `in_progress` instead of "In Progress" — every one of
those passes all three gates.

You have a real Chromium. Use it on anything a user can see.

## Start the app

```bash
node scripts/dev-server.mjs
```

It prints `http://localhost:5173` when the server is ready, and reuses an already-running one, so
it is cheap to call again before each page. It pins the port deliberately — **do not start Vite
yourself on another port.** Your browser session is pre-authenticated for that exact origin, and
an app served anywhere else will show you a login screen instead of the app.

**You are already logged in.** The platform seeds the browser's storage state with a token for
this app before your turn starts. You do not need credentials, and there is no email/magic-link
step. If you land on a login screen, something is wrong — say so rather than trying to log in.

## The tools

- **`browser_navigate`** — open a page.
- **`browser_snapshot`** — accessibility-tree snapshot (structure + element refs; cheap). Prefer
  it over a screenshot for "is this element here / what is on the page".
- **`browser_evaluate`** — run a JS function in the page (`() => {…}`). This is how you run the
  checks below.
- **`browser_console_messages`** — console output. A red error is a defect.
- **`browser_network_requests`** — the page's requests. **A 4xx/5xx from the app is a defect too**
  — a screen that renders while its data call fails is exactly what a click-through misses.

  **One exception: a request that fails because the platform does not have the new work yet.** A 404
  or "action not found" on a table, view or action created or changed this turn is not an app defect —
  the workspace has not been synced. If the orchestrator has a `sync_app` tool, it must run it before
  this pass; if that clearly did not happen, say so in the report instead of filing the failure as a
  defect. Without that tool the platform only receives artifacts when the turn ends, so report the
  flow as **not verifiable this turn**.

- **`browser_resize`** — set the viewport.
- **`browser_take_screenshot`** — capture the page. These are attached to the chat message the
  user sees, so screenshot anything you report as a defect; do not pick a save path.
- `browser_click` / `browser_type` / `browser_wait_for` drive the flows.

**Do not eyeball a screenshot alone — a screenshot lies about spacing.** Use the programmatic
checks to get the exact offending elements; use the screenshot to confirm the fix.

## Every page you changed

1. `browser_navigate` to it.
2. `browser_console_messages` — any error is a defect.
3. `browser_network_requests` — any failed or 4xx/5xx app request is a defect.
4. Run checks 1–4 below via `browser_evaluate`.
5. `browser_take_screenshot` and judge density (below).

Default viewport is **1280×800** (desktop). Most Blocks apps are back-office tools used at desks,
so desktop-only is the right default — add **375×812** (mobile) or **768×1024** (tablet) only when
the app targets them or the user asked.

## Programmatic checks

**Test with REALISTIC content, not the happy-path stub.** Overflow never shows on `"Task 1"` or
`$5` — it shows on a real long name, `$1,284,905.50`, a long email, a 3-line description. Before
running these, make sure at least one row or card holds worst-case content. A page that is clean
on stub data and breaks on real data is the most commonly missed defect there is.

**1 — Overflow (content exceeds its container):**

```js
() =>
  Array.from(document.querySelectorAll('*'))
    .filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 ||
        el.scrollHeight > el.clientHeight + 1,
    )
    .map((el) => ({
      tag: el.tagName,
      cls: String(el.className).slice(0, 40),
      dx: el.scrollWidth - el.clientWidth,
      dy: el.scrollHeight - el.clientHeight,
    }));
```

Also flag horizontal page scroll: `() => document.documentElement.scrollWidth > window.innerWidth`

**2 — Text clipping (wider than its box and NOT scrollable, so it is cut off):**

```js
() =>
  Array.from(
    document.querySelectorAll('button,a,span,p,h1,h2,h3,h4,td,th,li,label'),
  )
    .filter((el) => {
      const s = getComputedStyle(el);
      return (
        el.scrollWidth > el.clientWidth + 1 &&
        s.overflow !== 'auto' &&
        s.overflow !== 'scroll'
      );
    })
    .map((el) => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().slice(0, 50),
      overflowPx: el.scrollWidth - el.clientWidth,
    }));
```

**3 — Touching the viewport edge / too little padding:**

```js
() => {
  const W = innerWidth,
    pad = 4;
  return Array.from(
    document.querySelectorAll(
      'button,[role="button"],input,a,h1,h2,h3,[class*="card"],[class*="btn"]',
    ),
  )
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.left < pad || r.right > W - pad))
    .map(({ el, r }) => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().slice(0, 40),
      left: Math.round(r.left),
      right: Math.round(r.right),
      vw: W,
    }));
};
```

**4 — Child spilling OUT of its parent** — the case checks 1–2 miss. When a parent has
`overflow: visible` (the default) a child can bleed past its edges while the parent's own
`scrollWidth === clientWidth`, so text sits visibly outside the button or card and checks 1–2
stay silent:

```js
() =>
  Array.from(
    document.querySelectorAll(
      'button,[role="button"],[class*="btn"],[class*="badge"],[class*="chip"],[class*="card"],td,th,[class*="stat"],[class*="kpi"]',
    ),
  ).flatMap((p) => {
    const pr = p.getBoundingClientRect();
    if (pr.width === 0) return [];
    return Array.from(p.children)
      .map((c) => ({ c, cr: c.getBoundingClientRect() }))
      .filter(
        ({ cr }) =>
          cr.width > 0 &&
          (cr.right > pr.right + 1 ||
            cr.left < pr.left - 1 ||
            cr.bottom > pr.bottom + 1 ||
            cr.top < pr.top - 1),
      )
      .map(({ c, cr }) => ({
        parent: p.tagName + '.' + String(p.className).slice(0, 24),
        child: (c.textContent || '').trim().slice(0, 40),
        spillRight: Math.round(cr.right - pr.right),
        spillBottom: Math.round(cr.bottom - pr.bottom),
      }));
  });
```

**Any non-empty result is a defect to fix, not a note to log.** Usual culprits: a flex child
missing `truncate`/`min-w-0`, long text needing `break-words`, insufficient container padding, a
fixed width that will not shrink, a grid that should collapse to one column. Fix in `src/`, then
re-run until clean. Prefer a component-level fix so it holds across pages.

## Density & restraint — judge every page

Overflow is mechanical; this is judgment, and just as much a defect. Blocks apps drown in
"dashboard everything" — a dozen KPI tiles, three charts and two tables on one screen, none of it
clearly more important than the rest.

- **Too many stats/charts?** Pick the **2–4 metrics that drive a decision** and make them
  prominent. The rest is a drilldown — behind a row click, a tab, a detail page. Twelve stat
  cards on a first screen is a redesign, not a nit.
- **Is the important thing outstanding?** The number or action the user came for should dominate
  by size, position and weight. If the screenshot makes everything look equally important,
  hierarchy is missing.
- **Too much text?** Labels over sentences, a value over a paragraph explaining the value. No
  helper text restating the obvious. Progressive-disclose the rest.

Same discipline as the code: **prefer simple.** Fewer, clearer screens beat one crammed screen.

## Design checks on the rendered screen

The frontend agent designs to the `design` skill's checks but has no browser, so these are yours on
every changed page:

- **The logo renders whole.** No clipped letter, no squashed proportions, no crop, no box around
  it, and it stands out on its own ground.
- **Every fact appears once.** The same value printed twice on one screen is a defect: a count in
  the headline and again in a badge, or an ID in a title and in its chip. Not an agent mini-app's
  needs-you marks (metric, sidebar count, column badges, red border and chip): all are required.
- **Text on every fill is readable.** Buttons, badges and pills need at least 4.5:1 between text
  and fill, or 3:1 for large numerals. When it looks close, compute it with `browser_evaluate`.
- **Right-to-left apps** (`document.documentElement.dir === "rtl"`): `lang` is set, navigation and
  reading start on the right, back arrows point right, and dialogs, menus and toasts open on the
  correct side.
- **The first open shows real work.** A KPI of 0, a list that opens on "no results", or "—" or
  "Unknown" where a value belongs is a seed-data defect. Report it with the screen and the value, so
  the orchestrator fixes the rows instead of the screen hiding them.

## Done means

Every changed page, at each viewport in scope: no element in checks 1–4, no horizontal page
scroll, no console errors, no failed app requests, the design checks above pass, and the
screenshot reads clean — **and focused**: a clear primary metric or action, ~4 stats or fewer
competing, minimal copy.

## Is the browser available? Call a tool — never infer it

**The only source of truth is your tool list — so just call `browser_navigate`.** If it works,
the browser is live: use it, do not script around it.

Do **not** infer availability from your shell environment, from whether you can see Chromium on
disk, or from reasoning about how the platform "would" have configured this turn. That
false-negative has cost real builds, which abandoned a fully working browser to hand-roll a
Playwright script.

If a `browser_*` call genuinely errors as unregistered, the browser is off for this turn. The
same goes for the rarer case where the tools exist but every navigation fails with a browser
launch error — that is a broken sandbox image, not something to route around.

Either way: say so plainly in your reply and fall back to the static gates. Do **not** install
Playwright or Chromium, do not add an MCP server, and do not hand-write a browser script. Those
paths are platform-owned here, and an app that ships a Playwright dependency because you
installed one is a worse outcome than an unverified UI.
