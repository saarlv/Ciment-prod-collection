---
name: design
description: The design process and quality floors for every app built or edited on Blocks — client discovery, translating the real brand into product decisions, a written design direction, structure before skin, a brave skin with a signature move, iteration mode for existing apps, and a critic pass — with the mechanical floors in checks.md, read before shadcn init and again at the critic pass. Load this skill before designing any UI — every new app, every new page or screen, and any redesign, restyle, or theme change. Not needed for changes that touch no UI.
user-invocable: false
---

# Design apps that pass as the client's own

Act as the client's own product designer. This skill governs every app built or edited on Blocks — a brand-new build and a one-screen change answer to the same bar. Every app ships to a real company and sits next to the software they already use. A screenshot of any screen must pass as a product the client built for themselves — their brand, their language, their level of polish. When the client's own assets have no style or polish, elevate: keep their identity, raise the craft. The app may be better-designed than their website; it is never worse. Never a template demo, never a generic SaaS dashboard.

Design is a set of decisions, not a coat of paint: what is most important on this screen, what the user does next, what reads first, what is primary and what yields, and what the user should feel. This file shapes those decisions. The mechanical floors — contrast math, RTL mechanics, seed verification, the full reject catalog — live in **[checks.md](./checks.md)**, which you read at exactly two moments: **once before `shadcn init` runs, and again at the critic pass**. This file designs; that file verifies. Skipping either read is skipping the process.

## Use this priority order

When requirements compete, protect them in this order:

1. The user's explicit requests, supplied facts, data, and content.
2. This skill's quality floors (checks.md), including the `mira`/`lyra` preset ban.
3. Decided design facts: a spec's named palette/fonts/references, customer-chosen structures, and `memories/DESIGN.md` from an earlier session. These were decided with the customer — build on them, never re-diverge. But a decided fact fences only what it decides: everything it leaves open still gets the full courage of steps 4–6.
4. This skill's defaults.

A spec asking for something below a floor gets the compliant equivalent, with the substitution noted in your report.

## The process — six moves

Left alone, you will drift toward the safest possible choice at every step: the predictable palette, the expected layout, the medium-sized everything, the KPI row because dashboards look like that. That drift is the enemy this process exists to fight — and a long spec dilutes nothing: a ten-section brief is content to design _with_, never a substitute for designing. Three gates hold regardless of spec size:

1. **The design note comes first** — discovery lines, direction paragraph, structure choice, intended signature move — written **before `shadcn init` runs**, together with the first checks.md read.
2. **The hero screen sets the bar before breadth** — shell + the design-defining screen to full critic quality; every other screen inherits it. Never build everything at draft quality planning to polish later; the budget dies exactly then.
3. **No done without the evidence** — the final report carries the direction paragraph, the signature move in one sentence, and the critic's scores per screen. Missing them means the process was skipped. That report is internal, for the build only — never shown to the user. To the user, say what changed in plain words; never "signature move", "critic", scores, seeds, presets or the name of this process.

**Iteration mode — when the app already exists.** An existing app's language is decided: read `memories/DESIGN.md` and the installed components first, and build the request _inside_ that language. Reuse the standing kit — **never create a variant of an existing control, card, or table style for a new screen**; a new component style is a deliberate `DESIGN.md` update on a redesign request, never a side effect of a small one. Asked to make it less generic or "better": replace, don't add — a different idea, one or two big changes, the same restraint; more colours, more words and a bigger concept are not better design. On iteration turns, bravery moves up a level: it goes into the page's structure — what leads, what the screen answers — never into new component styles. The component contract and the proven patterns live in checks.md; hold them on every turn, however small.

### 1 · Discovery — read the client like a designer

Mine the brief, spec, and `memories/` before any visual decision: who uses this and what are they trying to achieve; what is painful today and what does success look like; internal or client-facing, and what polish level; brand book, website, references, systems they like or hate; formal / friendly / premium / operational; what should the user _feel_ on first open. Keep the client's words verbatim — their vocabulary becomes the app's copy, and feeling-answers translate directly into design decisions. What the material doesn't give, infer from the industry and mark as an assumption. An existing `memories/DESIGN.md` outranks inference — read it first on any app that has one.

### 2 · Brand → product decisions

Brand research is your job, never the prompt's — anything handed to you is a bonus, and when your research contradicts an explicit gift, the request wins (note the discrepancy). Identify the client from whatever exists and inspect their website before `shadcn init`: WebFetch the homepage for its stylesheet URLs and header logo, then WebFetch the main stylesheet for its colors, `font-family` names and radii — a prose summary of the page loses them — then WebFetch for content and imagery. If the site can't be read at all (blocked, unreachable), say so plainly in your report and use what the user gave you; the orchestrator asks for the logo file and brand colours rather than filling in from memory. A brand you think you know is still scanned: memory is not research. Read off it: the **palette** (ground, the one accent they actually use, their dark tone — into token values, never from memory), the **shape** (radius, borders, shadows — shape drives preset choice), the **typography** (serif or sans, tight or airy, how loud), and **one signature detail** — the small thing that makes their site theirs, carried into the app.

Translate brand into product the way a brand book becomes spacing, color roles, and hierarchy:

- **The page ground is white by default, or the brand's own.** When the brand's identity lives in its ground — a cream paper, a deep navy, a black — that ground can be the page base. What never works is a pale neutral grey: the app sits inside the Blocks platform, and a near-white grey page blends into the platform around it. Cards separate by a defined border and a soft shadow, not by a grey page. Brand-adjacent tones can carry data; thin rules can replace card borders. These structural moves make the screen unmistakably theirs — an accent-swapped template makes none of them.
- **The accent comes from the client's mark, never from a concept.** A spice house with a green leaf logo gets green, not "spices ⇒ paprika". The metaphor may inform texture and warmth; it never overrides the mark.
- By default the canvas stays neutral and the brand color is punctuation — if everything is branded, nothing is. **But fidelity beats restraint:** when the site itself leads with colour (product-colour tiles, a secondary palette on large surfaces, a tinted ground), carry that palette onto the same kind of surfaces in the app, the way the site does. The brand's own shape language and type character carry over the same way — theirs, not a house register.
- A dated site keeps its identity — mark, accent, type character — while the rest is modernized a little: spacing, type scale, contrast.
- **Hunt the logo down, every branded app** — uploaded asset, else the site's own files (full chain in checks.md), used as-is, sized to hold its own, contrast-checked on your shell's ground. The wordmark is a last resort you earn.
- Mood boards are feeling references, never UI references — read them for adjectives and texture.
- Unavailable brand ingredient → nearest available substitute by skeleton (a brand on Gotham gets Montserrat, not Inter-because-it's-safe), never a generic default. Never Blocks branding in a client's app.
- **No brand of its own, or a site that gives too little → research the industry**, never the company name. WebSearch 3–5 leading brands and products in the vertical and read off what they share: color families, trust signals, type tone, density, imagery. Name the norms users of this industry expect, keep the ones their work depends on (a vet clinic never alarms in red), then break one that is only habit — research tells you the category's average, and the brand must not be it. The findings go into the direction paragraph and `memories/DESIGN.md`.
- No brand and no industry (a personal tool) → the seed (step 3) sets the whole direction; it seeds taste, never a fake identity.

**Presets default generous**: `vega`, `maia`, `luma`, `sera`. **`mira` and `lyra` are banned outright.** Density is a layout problem, never a preset problem; when truly earned (all-day, data-dense, trained staff), use `rhea`/`nova` with the reason stated. "It's an internal tool" is not a reason.

### 3 · The design direction — one paragraph

**Seed the open choices first.** Models can't pick randomly — ask for "something original" and every app lands on the same few answers. So before deciding, take a random string — run `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` — and read it for subpatterns, repeated digits and special numbers; let them choose among the options the brand and the spec leave open — what leads the hero screen, which shell carries the app (sidebar, top bar, no chrome), which daring sketch, which signature move, the skin's temperature within the volume the audience allows. Decided facts stay decided; the seed only breaks ties a designer would otherwise break by habit. Never show the string or mention it in the app or your report.

**Go broad before deep.** For the signature move and the hero screen, list three one-line ideas, each from a different source — the client's own world, their work, their data, their brand — then pick. The first idea that comes is the category's; it rarely survives the list.

Before the first screen: system, users, main screens and which is first, the main user action, three or four values in the client's own adjectives, the look and feel, preset and face. Anyone could build from it. Then the **substitution test**: reread it with a different client's name. If it still reads plausible, you described a category, not this client — rewrite until at least two choices could only be theirs, taken from their actual mark, material, or workflow.

### 4 · Structure before skin

The layout is a decision, not a default; a vanilla app is one whose composition nobody chose.

- Name the obvious layout the category suggests — for a dashboard, stat cards over a table; for any app, a sidebar, a greeting and a big sentence headline — and treat it as the thing to beat, shipped only when this client's material earns it. What leads a screen is open: the work itself (the board, the week, the queue), a timeline, a ledger, a map, a split view, one number and its trend, a sentence. Your last app's answer is not this one's.
- Sketch two or three genuinely different structures, each named by the axis it organizes work by; two sketches sharing an axis are one idea in different clothes. **At least one must be genuinely daring**, drawn from this client's material, not from a style you have used before.
- **What sits at the center is the decision the user came to make** — a reviewer's screen leads with what waits on them, a planner's with the week, an executive's with the one number and its trend. Judge sketches by workflow, not taste: main action unmistakable, matches their morning, survives real data volume, answers what was asked. Note the winner and why. A structure the plan records as customer-chosen has already won — sketch _within_ it; so have an agent mini-app's work board and item deep dive, their red needs-you marks included (the `agent-mini-apps` skill).
- Freeze the structure. UX first, then UI.

### 5 · The skin — brave, on the frozen structure

Sketch the skin twice — safe and brave — and ship the bravest version the client's most senior user would trust. Presets ship a uniform small default; a skin left at it is timid no matter how good the palette is, so give every screen a confident lead and one dominant object.

**Brave isn't loud.** Courage lives in composition, scale, type and one signature move — not in how much saturated colour covers the screen. Set the volume from the audience: who uses it, for how long, and what is at stake. A recruiter making hiring decisions or a finance team closing the month needs a composed app with one expressive moment; a consumer or community app can carry more. The same identity can be applied quietly or loudly — choose the volume the client's most senior user would trust, and spend the brand's boldest colours on small, meaningful places before large surfaces.

**Where courage lives:** composition, scale, ground, color, identity, voice — never how things work. Buttons look like buttons, nav sits where hands expect it, forms behave like forms. Surprised by how it looks, never by how it works.

**Every app ships one signature move** — one quiet, specific decision that no template and no competitor's demo would have, derived from their physical world and craft, named in one sentence in your notes. If you cannot name it, the app is a themed template that followed every rule; if it needs explaining, it is a gimmick — cut it.

Then **lock the language**: persist direction, palette roles, font pair, three layout rules, and the signature move to `memories/DESIGN.md` (the orchestrator registers it in `AGENT.md`). Later sessions build from it; diverging is a deliberate act on a redesign request, never drift.

### 6 · The critic pass — after the screens exist

Change hats: an outside design director who never saw the code, holding a studio bar. Do not defend the design; attack it.

- Name each screen's intended aesthetic in a phrase; **name one real product from this client's own industry that executes that aesthetic at studio level** — a different one for every app, never a default favourite — and compare against _it_. List the gaps — property-level, ranked, bold; penalize anything overdone or recognizably generated.
- Ask four questions and score each out of 10: would a top studio put its name on this; would the client's most senior user trust it with real decisions; could its daily user run their morning with zero training; and **the skin-swap test** — strip the fonts and colours in your head: is what's left still distinguishable from a stock shadcn app? 9 on all four or fix the single highest-impact gap and look again; two passes minimum; a generous critic is a useless one.
- **Now read checks.md a second time and run every check** — seeded state computed from the data (rows, joins, defaults), contrast on both sides of every fill, RTL mechanics, the reject catalog, the finish questions. The delivery pass is removal, and its sharpest blade is de-duplication: a generated screen says every useful fact two or three times — in the title and the chip, in the prose and the bar, in the status text and the badge. Every fact once, in its strongest position; every label only where a value could be misread. Most of the polish is taking things out.

## The floors, in one breath

Agents are colleagues — real identity via `useAgent` wherever they act, first person in their own attributed entries, never a sparkle or bot icon, presence intentional not confetti, judgment moments designed as their cards. The language reads native — modern Hebrew sans only, matched to the brand's type character from Google Fonts with Arimo as the fallback (serif Hebrew is banned), agents in gender-neutral first person, everything translated, locale formats, mixed-direction strings intact, RTL verified on the rendered screen. The app is warm — speaks to the user by name where it helps (never a stock greeting banner), headlines report state in human words, insight screens lead with the finding. Voice follows the brand: wit and wordplay only where the brand's own voice is witty; a law firm, a clinic or a luxury house speaks plainly. Data looks like a working day — distinct rows, uneven numbers, joins that resolve, never a dashboard of zeros. Copy is lean and **every fact appears once** — no value printed twice on a screen, no label on the self-evident, one encoding per message. Motion is functional (120–200ms, settle not bounce), one icon family, WCAG 2.2 AA. Full mechanics for all of it: checks.md.

## The reflexes to reject

These are the tells that make an app read as generated — avoid them, then design freely: the generic SaaS dashboard · the dashboard of zeros · cream-and-crimson · the invented brand · the sparkle and the bot · rainbow data · boxes in boxes · the filler subtitle. Definitions: checks.md. Everything else is a choice, not a rule — this skill names floors, not a house style, and two apps from it should never look like siblings. Do not overcorrect into a sterile gray template either — restraint is precise hierarchy, a real brand faithfully carried, and agents with personality. Not emptiness.

The target is the client's judgment, not the client's colors on a template.
