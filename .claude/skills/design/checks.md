# Design checks — the mechanical floors

Read this file at exactly two moments: **before `shadcn init`** (alongside the design note) and **at the critic pass**. SKILL.md owns taste; this file owns verification. Every item here is checkable, and a failed item is a build defect — not a style opinion.

Two things here belong to another agent. Where this file says to look at the rendered screen, design to it and leave the looking to the `qa-browser` pass, which runs these checks in a real browser after your gates (`app-browser-verify`). The seed rows are the orchestrator's (the `app-artifacts` tables doc): compute from them and report every gap.

## Before `shadcn init`

- The design note exists: discovery lines, direction paragraph (substitution-tested), structure choice with the losing sketches named, intended signature move.
- Client researched; **logo hunt** executed in order: uploaded asset → site header `<img>`/`<svg>` src → `og:image` → about/press page → favicon chain (`/apple-touch-icon.png`, `/favicon.ico`). Prefer SVG or largest raster; absolute URL used exactly; contrast-checked on the shell's ground (a white-site logo may need its light variant on a dark header); sized to hold its own — too-small is the most common failure. Wordmark lockup only after the hunt fails — an oversized or SEO raster (a big `og:image` JPG) is not a failed hunt: go back to the header `<svg>`/`<img>` and the favicon chain. Brand tokens come from the fetched site, never from memory.
- **The logo renders whole.** Keep its own proportions: size it by height only, never set both width and height, never crop it with `overflow-hidden` or `object-cover`; an inline SVG keeps its `viewBox` (drop fixed `width`/`height` attributes and size it with a height class). Look at it rendered: no clipped letter, no squash, no box around it.
- **A made-up wordmark passes contrast on its own ground** (4.5:1, or 3:1 at display size). Light brand hues — lime, yellow, pale mint — are never wordmark text on white; set the name in ink and put the colour in a mark or underline.
- Preset legal: never `mira` or `lyra`; `rhea`/`nova` only with the dense-tool reason written down; RTL language ⇒ `--rtl` on init.

## Seeded state — compute it, never assume it

- For every hero surface: read the actual `seedData` rows and the view it queries, apply the default filter it mounts with, and compute first render. KPI = 0, list mounting on "no results", an em-dash where a value belongs, a 0 ₪/€ total — each is a defect. First open shows a business mid-shift.
- **Walk the joins**: resolve every displayed reference column against the referenced table's seed rows. A reference that lands nowhere renders "Unknown" and drags "—" behind it — failed join.
- **The rows are the orchestrator's** (the `app-artifacts` tables doc holds the rules for writing them): report each defect with the screen and the rows behind it, never hide it in the UI.
- Long lists ship with the filter or grouping their real volume needs; every open/pending item shows its next action, not only a status.

## The component contract — fixed once per app, recorded in DESIGN.md

- **One control height, one radius scale, one border weight, and a small fixed set of text colours**, chosen once for this app and recorded in DESIGN.md. Never multiplied, never improvised per screen. The values are this app's design decision, not a house default.
- **Never a variant of an existing component for a new screen.** New screens compose from the standing kit; a new component style exists only as a deliberate `DESIGN.md` update on a redesign request.
- **Three color families, never borrowed across:** _health_ (ok / warning / failing), _activity_ (who or what is working right now), and _change_ (added / modified / removed in proposals and diffs). An "added" row is never health-green; a working agent is never change-blue.

## Proven patterns — reach for these before inventing

- A _live_ metric that is legitimately empty shows "—" **with its reason beside it** ("not yet measured · fills at 10 orders") — never a bare dash; the _seeded_ state never shows dashes at all.
- **Filters:** more than ~7 options becomes a searchable dropdown, never a chip row that wraps.
- **Proposals and changes side by side**, rows matched by the activity each describes, with only the real changes marked (the _change_ family); unchanged rows stay quiet.
- **The agent chat is one consistent side panel** — same placement, width, and header on every page that has it; never restyled per screen.

## Density — every fact once, every label earned

Generated screens fail by generosity: every known datum gets ink, and the useful ones get it two or three times. These are scanned on the rendered screen, value by value:

- **Every fact appears exactly once per screen.** A count lives in one place — the tab badge, or the headline, or a chip, never two of them. An ID lives in its chip, so the title doesn't repeat it; an amount lives in its column, so the title doesn't carry it. Scan the screen for the same value printed twice — each duplicate is a defect, and the copy that survives is the one in the strongest position.
- **One encoding per message.** A timing or progress story is told by the prose, or the bar, or the microcopy — whichever is strongest — never stacked. If the sentence already says "runs out Oct 17, 24 days short," a bar and an "out in 11d · 24d short" microline beneath it are the same fact told three more times: cut them.
- **A label exists only to resolve an ambiguity.** An amount beside an Approve button needs no label; a lone date needs no "Date:"; a row of agent avatars needs no "Team" eyebrow. If a value could not be misread, it carries no label — a screen with a label on everything has labeled nothing.
- **Status text or status badge, never both.** "Waiting on you" + a "7 need you" badge is one message twice; keep the one that carries the number.
- **Row budget.** A list row is: one status mark, the title, at most two metadata values, one primary action (and a quiet secondary). One chip maximum. Everything else belongs to the row's detail — expand, hover, or drilldown — and the proof of restraint is what the row does _not_ show.
- **Zero rows don't print.** Legends and stage lists show only entries with content; zeros collapse into one muted line or disappear.
- **An agent mini-app's needs-you marks are one designed signal** (the `agent-mini-apps` skill): the "N need you" metric, the sidebar count, the Needs you filter, column badges, the red border and its action chip all stay, and its work board keeps every stage column, empty or not.

## Color and contrast

- **Two sides of every fill**: for each colored ground (buttons, pills, badges) compute which foreground clears 4.5:1 — never assume white or dark. Mid-tones (gold, bronze, amber, lime) often clear with neither: shift the fill within its hue until one passes, or reserve the tone for large numerals (3:1), borders, accents. Note the substitution.
- **A status never fills a whole row** — start-edge rule, solid badge, or bold value; never a full-row colored fill behind body text. Status color is solid or outline, never a tint under matching colored text.
- **The page ground is white, or the brand's own ground — never a pale neutral grey.** A near-white grey page blends into the Blocks platform around the app. A tinted or dark ground is used only when the brand's site carries it; cards separate by border and soft shadow.
- **The primary button is the highest-contrast element on the screen** — never a washed pastel of the accent.
- The accent is the client's mark's color; semantic green/amber/red tuned to sit beside it; charts are a ramp built from the brand palette, `--success`/`--destructive` stay their own tokens.

## Hebrew and RTL

- **Serif Hebrew is banned in UI** — Frank Ruhl Libre, David Libre, Tinos, and kin read as newspaper/ministry/memorial to a native eye. Modern Hebrew sans only, **chosen like the Latin face — matched to the brand, never applied by reflex.** Pick the Google Fonts Hebrew sans closest to the brand's type character and industry: geometric (Heebo, Rubik), humanist (Assistant, Open Sans, Noto Sans Hebrew), technical (IBM Plex Sans Hebrew), rounded (Varela Round), display weight for headings (Secular One). Arimo is the fallback when nothing fits closer, not the default answer; name why the face fits in the design note. Real bold weights in-script, the Latin face paired to the Hebrew skeleton, slightly taller line-height than the Latin default.
- Everything translated — statuses, empty states, errors, toasts, chart labels — in the client's industry vocabulary. Dates, currency side, and separators per locale.
- Mixed-direction strings intact: SKUs, phones, ח.פ IDs — **and any English word inside Hebrew text** — isolated as their own runs (`bdi`/`dir="ltr"`) so punctuation doesn't jump across the boundary. Directional icons flip, **including the send icon**, chevrons, and arrows; non-directional don't. Charts, steppers, breadcrumbs run with the reading direction. Asymmetric spacing mirrors via logical utilities — a button balanced in English and lopsided in Hebrew was spaced physically.
- **RTL is verified, never assumed** — setup lives in the `app-layout` skill's RTL section; here you prove it held. `components.json` has `rtl: true`; `document.documentElement.lang` is set; `DirectionProvider` wraps the tree; `Sidebar` has `side="right"` and `Calendar`/`Pagination` are checked by hand (the CLI doesn't flip them). Search app code outside `src/components/ui/` for physical utilities — `ml-` `mr-` `pl-` `pr-` `left-` `right-` `text-left` `text-right` `rounded-l` `rounded-r` `border-l` `border-r` — and convert every hit to its logical twin (`ms-` `me-` `ps-` `pe-` `start-` `end-` `text-start` `text-end`); zero hits is the floor. Then look at the rendered screen: nav and reading start on the right, back arrows point right, dialogs, menus and toasts open the right way.
- **Agents speak Hebrew in gender-neutral first person** — "קיבלתי", "אעדכן", "סיימתי" — never a gendered form for the agent, never the third person about itself.
- **Never letter-space Hebrew.** No `tracking-*` on Hebrew text — not in eyebrows, not in labels, not anywhere; Hebrew letterforms connect visually and tracking shatters them. Eyebrow styling in Hebrew comes from weight and color, not spacing.

## Layout, scale, responsiveness

- Centered container, deliberate max-width, gutters that grow with the viewport; prose/forms ~65–75ch; chat at conversational width; no line of text spanning the full screen; no horizontal scroll for core content; layout holds at every breakpoint the audience uses; targets ≥44px on phone-used surfaces.
- A clear lead as the largest thing on each screen; numbers `tabular-nums`; 16px body (14px only with the stated dense reason); one dominant object, obvious at 50% zoom.
- One primary action per view (one filled button); destructive never louder than primary; no bordered box inside a bordered box; tables full section width, text to reading start, numbers to the end, primary column truncates last.

## Agents and voice

- Every agent shown as itself via `useAgent` — avatar, name, job title — wherever it acts: feeds, timelines, headers, processing states. First person in its own attributed entries; the UI addresses the user directly. No "Done by Ron". No sparkle, no `Bot` icon, no "✨ AI" badge, not even as loading stand-ins. Presence intentional: one clear home per screen plus signed entries — if the face repeats more than the content it signs, cut copies. Judgment moments (fuzzy match, flagged anomaly) are first-class cards: decision, evidence, confidence. An agent's colour is a marker — avatar ring, dot, a card's edge — never a whole card filled with it.
- Speak to the user by name (`useUser`) where it adds warmth — a mention in a headline or a reply, never a stock "Good morning, Dana" banner on every screen; headlines report state in human words — "7 invoices are waiting for you", never "Pending: 7". Insight screens lead with the finding ("Three customers are 67% of revenue"), never the screen's name; every chart carries a one-line takeaway; an empty metric says what will fill it, never a dash.
- Motion functional: 120–200ms, ease-out in / ease-in out, settle not bounce, reduced-motion respected; skeletons match layout; progress names its stage. Empty state = what's missing + next step, one line. No emoji in UI copy. One icon family (lucide), one stroke weight, no icon as decoration.

## The reject catalog

- **The generic SaaS dashboard** — identical stat cards, a rainbow chart, a cramped table, regardless of client.
- **The dashboard of zeros** — an empty seeded day; reads as a dead product.
- **Cream-and-crimson** — warm beige ground + red/terracotta accent: the single most recognizable AI-generated look. Only when the client's own mark carries it.
- **The invented brand** — styling from imagination when the real site was one fetch away.
- **The sparkle and the bot** — a generic AI glyph where an agent's own identity belongs.
- **Rainbow data** — charts and tags in unrelated hues instead of a brand ramp.
- **Boxes in boxes** — nested cards standing in for spacing.
- **The filler subtitle** — explanatory text under every heading saying nothing.

## Before you report done

1. Would a screenshot pass as the client's own internal product?
2. Real logo in the shell (or an earned wordmark), palette from their mark — one accent, neutral-led, solid semantics?
3. Why did this structure beat the obvious one — and is the center the decision the user came to make?
4. Signature move nameable in one sentence; critic scores 9+ on all four questions after removals?
5. Language native; RTL verified — `rtl: true`, `lang` set, zero physical utilities in app code, the rendered screen reads from the right?
6. Agents as themselves, first person, intentional; no sparkles, no narration?
7. Container and margins real; layout holds on the smallest screen the audience uses?
8. One primary action per view; every element earns its place — no value printed twice on one screen, no label stating the obvious, no message encoded more than once?
9. Zero/long/loading/error states designed — and every hero surface computes to seeded rows, resolved joins, and non-zero totals?
10. Contrast passes on both sides of every fill; the logo renders whole?
11. The app speaks like a considerate colleague, in the user's language — and no stock greeting banner?
12. `memories/DESIGN.md` written or updated so the next session inherits the language?
13. On an iteration turn: everything new composed from the standing kit — zero new component variants, the component contract held, the agent panel unchanged?

The report carries: the direction paragraph, the signature move, the critic scores per screen, and confirmation this file ran twice. It is internal — the user hears only what changed, in plain words, none of this vocabulary.
