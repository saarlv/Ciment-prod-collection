# Putting a Brand Spec onto the Theme

The mechanics of mapping decided design values — a palette, a radius scale, fonts, a type scale, control heights, a `DESIGN.md` the user supplied — onto the shadcn tokens in `src/index.css` and the component variants in `src/components/ui/`.

The decisions themselves are the `design` skill's: it runs before `init`, researches the brand, writes the design note, picks the preset and records the language in `memories/DESIGN.md`. Read that record first on an existing app, and write what you map here back into it. A DESIGN.md or brand spec the user supplied is a decided fact for the `design` skill; it stays where the brief put it and is never copied into the app.

## Contents

- Read the spec
- Map tokens to the theme (colors, radius, elevation, fonts, type scale, dark mode, focus)
- Map component recipes to variants
- Known traps
- Report

---

## Read the Spec

DESIGN.md files usually carry YAML frontmatter (`colors`, `typography`, `rounded`, `spacing`, `components`) and prose sections (Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's and Don'ts, Responsive, Known Gaps). Some only have prose with `{colors.x}` references. Handle both.

Long files exceed one read. Grep the headings first, then read frontmatter, **Do's and Don'ts**, **Iteration Guide** and **Known Gaps** in full. Those sections hold the rules that override defaults.

Extract into a working table before editing anything:

| Extract               | Look for                                                              |
| --------------------- | --------------------------------------------------------------------- |
| Canvas and ink        | `canvas`, `surface`, `ink`, "page floor", "body text"                 |
| Action color + states | `primary`, `-hover`, `-active`, `-pressed`, `-disabled`, `on-primary` |
| Secondary actions     | `button-secondary` fill, text and border                              |
| Surfaces              | card fills, soft bands, dark product surfaces                         |
| Lines                 | `hairline`, border alpha, "1px solid"                                 |
| Focus                 | outline vs ring, color, width, offset, alpha                          |
| Type families         | display, body, mono, and the documented **substitutes**               |
| Type scale            | size, weight, line height, tracking per token                         |
| Radius scale          | every value and what it applies to                                    |
| Elevation             | each shadow tier, verbatim                                            |
| Control heights       | button, input, ghost, icon-button heights and padding                 |
| Hard rules            | every "Don't" and "never"                                             |

---

## Map Tokens to the Theme

Edit only `src/index.css`. Every color is a full OKLCH value (`oklch(0.55 0.18 260)`): convert the spec's hex values, because the app's Theme panel reads this file back and writes OKLCH into it.

### Role mapping

| Spec role                                    | shadcn variable                                             |
| -------------------------------------------- | ----------------------------------------------------------- |
| canvas / surface / page floor                | `--background`                                              |
| ink / headline text                          | `--foreground`, `--card-foreground`, `--popover-foreground` |
| primary CTA fill / on-primary                | `--primary` / `--primary-foreground`                        |
| primary hover, pressed or active fill        | new `--primary-active` (or `--primary-pressed`)             |
| secondary button fill / text                 | `--secondary` / `--secondary-foreground`                    |
| soft band, alternating section               | `--muted`                                                   |
| secondary or descriptive text                | `--muted-foreground`                                        |
| ghost hover wash, active tab, menu highlight | `--accent` / `--accent-foreground`                          |
| card / feature card fill                     | `--card`                                                    |
| floating layer (menus, dialogs)              | `--popover` (usually the canvas)                            |
| hairline / structural border                 | `--border`, `--input`                                       |
| focus color                                  | `--ring`                                                    |
| error / validation                           | `--destructive`                                             |
| illustration accents                         | `--chart-1` … `--chart-5`, plus named tokens                |
| sidebar or nav rail surface                  | `--sidebar-*`                                               |

Every token without a shadcn slot gets a variable in `:root` (and `.dark` when it changes) and a registration in `@theme inline`:

```css
:root {
  --primary-active: oklch(0.47 0.13 40);
  --surface-card: oklch(0.94 0.02 85);
}

@theme inline {
  --color-primary-active: var(--primary-active);
  --color-surface-card: var(--surface-card);
}
```

### Radius

`init` wrote the radius ladder as multiples of `--radius` in `@theme inline` (`--radius-lg: var(--radius)`, the others `calc(var(--radius) * n)`). Keep it that way: the Theme panel's corner-radius control edits `--radius`, and a step pinned to a literal silently stops following it. Set `--radius` so the steps land on the spec's values; these are the classes the components use, so you can check each step against the spec:

| Class         | Used by                                         |
| ------------- | ----------------------------------------------- |
| `rounded-sm`  | Small accents                                   |
| `rounded-md`  | Menu, select and command items                  |
| `rounded-lg`  | Buttons, inputs, selects, tabs, popovers, menus |
| `rounded-xl`  | Cards, dialogs, command                         |
| `rounded-2xl` | Toasts, large containers                        |
| `rounded-4xl` | Badges (pill)                                   |

Confirm the classes and the multipliers for the installed style:

```bash
grep -ohE "rounded-(\[[^ \"]+\]|[a-z0-9]+)" src/components/ui/*.tsx | sort | uniq -c
grep -n "radius" src/index.css
```

When one component's radius doesn't fit the ladder (12px cards beside 4px buttons, say), give it a named token in `@theme inline` (`--radius-card: 12px`, which makes `rounded-card`) and use it in that component, instead of pinning a ladder step: every other step keeps following `--radius`. Record each named token in `memories/DESIGN.md`. `rounded-[min(var(--radius-md),Npx)]` caps small buttons and select triggers; edit the cap when the spec wants rounder small controls.

### Elevation

Override Tailwind's shadow scale in `@theme`, not `@theme inline`. Copy multi-layer shadows verbatim. Set `--shadow-xs` to `0 0 #0000` when the system is hairline-only, because inputs and outline buttons use it.

```css
@theme {
  --shadow-xs: 0 0 #0000;
  --shadow-sm: 0 1px 3px rgb(20 20 19 / 0.08);
  --shadow-lg: 0 1px 3px rgb(20 20 19 / 0.08), 0 8px 24px rgb(20 20 19 / 0.06);
}
```

The Theme panel reads the first layer of the first tier you set as its shadow settings (offsets, blur, spread, color, opacity), so it opens on the spec's look. When a user edits a shadow there, it regenerates every tier from those settings with its own two-layer formula, replacing the literals. A shadow that formula can't express (a specific multi-layer card shadow, say) survives such an edit only as its own named token in `@theme inline` (`--shadow-card: …`, which makes `shadow-card`), which the panel never touches. Record it in `memories/DESIGN.md`.

### Fonts

Fonts load from `src/index.css` only: the fontsource package `init` installed for the preset (`@import "@fontsource-variable/<face>"` at the top, from `pnpm add @fontsource-variable/<face>`), or a Google Fonts line at the very top, which is what the Theme panel writes when a user changes a font:

```css
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap');
```

Never a `<link>` or a runtime loader (the `frontend` agent's "Brand Theme" section). Brand fonts are usually licensed: use the substitutes the spec names, and import every face you reference.

Font stacks are runtime tokens, wired the way shadcn wires its colors: the stack lives on `:root`, and `@theme inline` maps the Tailwind key to it with `var()`. Never a literal stack inside `@theme inline`: Tailwind inlines that into every utility and emits no variable, so nothing can change the font at runtime (the platform's Theme panel previews a font by setting `--font-sans`), and a `var(--font-sans)` reference elsewhere dangles. `init` writes the preset's stack as such a literal; the platform moves it to `:root` when it saves the file, so you will find it there. When a user picks a font in the Theme panel, the platform writes the token, uses the face the app already ships for that family if there is one and adds a Google import otherwise, and drops the import of a family nothing references any more: one load per font, from one place.

```css
:root {
  --font-sans: 'Rubik Variable', 'Rubik', system-ui, sans-serif;
  --font-serif: 'Cormorant Garamond Variable', Garamond, serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
}

@theme inline {
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);
  --font-heading: var(--font-sans);
}
```

`--font-heading` styles small component titles (`CardTitle`, `DialogTitle`, `SheetTitle`). Point it at the display face only when that face reads well at 16px. Otherwise keep it on the sans and use display tokens for page headings. For a Hebrew or Arabic app the stack is dual-script, Latin face first (the `app-layout` skill's RTL section); the `design` skill's checks choose the script face.

### Type scale

Turn every typography token into a `type-*` utility. Don't use `--text-*` theme keys for this, because `cn()` treats unknown `text-*` classes as colors and drops whichever comes first when one sits next to `text-muted-foreground`.

```css
@utility type-display-lg {
  font-family: var(--font-serif);
  font-size: clamp(34px, 3vw + 16px, 48px);
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.021em;
}

@utility type-caption-upper {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
```

- Clamp display sizes so mobile works. Convert pixel tracking to `em` (`-1px / 48px = -0.021em`) so the ratio holds as the size shrinks.
- Respect the rules on tracking (none below a size) and weight (display never bold). Never letter-space Hebrew (the `design` skill's checks).

### Dark mode

The platform sets `.dark` or `.light` on `<html>` from the viewer's choice (or their system), so the app never adds a theme provider or toggle; you only fill the `.dark` block's values.

- **The spec defines dark surfaces** (product mockups, footers): put them in `.dark`. Because `init` wrote `@custom-variant dark (&:is(.dark *))`, `className="dark"` on any section renders every component inside it with the dark tokens. Use it for dark bands, featured pricing cards and footers.
- **The spec is light-only**: derive `.dark` from the brand's known dark surfaces and say in your report that it is derived.
- **The brand wants it dark whatever the viewer picks**: Blocks has no per-app default. The viewer's setting picks `:root` (light) or `.dark`, and the Theme panel edits only those two blocks, so give `:root` the same dark palette as `.dark`. That makes the app dark-only: a viewer's light choice and the Theme panel's Light scope both show the dark palette. Say so in your report, and record it in `memories/DESIGN.md`.

### Focus

Match the documented focus treatment:

- **Ring with alpha** (for example "3px coral at 15%"): replace `ring-ring/50` with the documented alpha on field components (`input`, `textarea`, `input-group`, `select`, `native-select`, `combobox`, `input-otp`).
- **Solid outline with offset**: add an unlayered rule in `src/index.css` so it beats `outline-none`, and cancel the ring shadow:

```css
:is(
  button,
  a[href],
  [role="button"],
  [role="tab"],
  [role="checkbox"],
  [role="radio"],
  [role="switch"],
  [role="slider"]
):focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  --tw-ring-shadow: 0 0 #0000;
}
```

This covers actions only. Field controls keep their ring. When the spec applies the outline to fields too, add `input, textarea, select, [role="combobox"]` to the selector.

---

## Map Component Recipes to Variants

Restyle by editing the `cva` variants in the installed component source. Keep existing variant names so usage stays standard. Add a variant only when the spec defines a distinct recipe, and record the result in `memories/DESIGN.md` as the app's component contract (the `design` skill's checks: one control height, one radius scale, one border weight, fixed once per app).

| Spec recipe                          | shadcn target                                |
| ------------------------------------ | -------------------------------------------- |
| `button-primary`                     | `Button` `default`                           |
| `button-secondary` (tinted fill)     | `Button` `secondary`                         |
| `button-secondary` (canvas + border) | `Button` `outline`                           |
| `button-ghost`, nav links            | `Button` `ghost`                             |
| text link                            | `Button` `link`                              |
| circular icon button                 | `Button` `icon*` sizes + `rounded-full`      |
| `badge-pill`, `badge-<accent>`       | `Badge` `secondary`, `default`, new variants |
| `card`, `feature-card`               | `Card` (fill, ring, `--card-spacing`)        |
| `text-input`, `-focused`             | `Input`, `InputGroup`, `Select`, `Textarea`  |
| `category-tab`, filter row           | `Tabs` `default` list + trigger              |

**Control heights move together.** When the button height changes, change the field controls to match, or forms misalign. In base-nova the 32px default lives in:

| File                | Class                            |
| ------------------- | -------------------------------- |
| `button.tsx`        | `h-8`, `size-8` (icon)           |
| `input.tsx`         | `h-8`                            |
| `input-group.tsx`   | `h-8`                            |
| `select.tsx`        | `data-[size=default]:h-8`        |
| `native-select.tsx` | `h-8`                            |
| `combobox.tsx`      | `min-h-8` (chips)                |
| `toggle.tsx`        | `h-8 min-w-8`                    |
| `input-otp.tsx`     | `size-8` (slot)                  |
| `tabs.tsx`          | `group-data-horizontal/tabs:h-8` |
| `menubar.tsx`       | `h-8`                            |
| `command.tsx`       | `h-8!` (input group)             |

Re-grep before editing (`grep -n "\bh-8\b\|size-8\b" src/components/ui/*.tsx`); other styles use different values.

**States.** Follow the documented states exactly. If the spec says "darken on press only", use `active:` instead of `hover:`. Keep hover on ghost buttons and menu items even when the spec omits it, and say so in your report.

**Hard rules.** Turn each "Don't" into a check before you finish, for example: no radius outside the scale, no accent color on buttons, no bold display type.

---

## Known Traps

| Component           | Trap                                                                        | Fix                                                                                   |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Command` inline    | cmdk scrolls its first item into view on mount, which jumps the page to it. | Control it: `value={value} onValueChange={setValue}` with initial `"none"`.           |
| `MessageFooter`     | Placed beside `MessageContent`, it becomes a squeezed flex column.          | Put it inside `MessageContent`.                                                       |
| `Select` (base)     | `SelectValue` shows the raw value.                                          | Pass `items` to `Select` ([base-vs-radix.md](./rules/base-vs-radix.md)).              |
| `Resizable`         | react-resizable-panels v4 dropped `direction` and numeric sizes.            | `orientation="horizontal"`, `defaultSize="40%"`.                                      |
| `DirectionProvider` | Provider alone doesn't flip layout.                                         | Both are needed: the build stamps `dir` on `<html>` when `rtl: true`, and the tree is wrapped in `DirectionProvider` (the `app-layout` skill's RTL section). |
| Nav links           | `Button` renders a `<button>`.                                              | Base: `nativeButton={false} render={<Link to="…" />}`. Radix: `asChild` around `Link`. |

---

## Report

In your report to the orchestrator, and in `memories/DESIGN.md`:

- What maps where: colors, fonts (and substitutes), radius, shadows, focus.
- Contrast pairs under 4.5:1, including ones the spec itself specifies — the `design` skill's checks decide what to do about them.
- Every component file you edited and why.
- Every deliberate deviation from the spec, and every named radius or shadow token: a derived dark mode, kept hover, substituted fonts, `--radius-card`, `--shadow-card`.
