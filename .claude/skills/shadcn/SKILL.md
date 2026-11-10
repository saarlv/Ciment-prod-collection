---
name: shadcn
description: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI, including chat interfaces. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. Also triggers for "shadcn init", "switch to --preset", and, with the design skill, for mapping a brand spec or DESIGN.md onto the theme.
user-invocable: false
allowed-tools: Bash(CI=1 pnpm dlx shadcn@4.23.0 *), Bash(yes n | CI=1 pnpm dlx shadcn@4.23.0 *)
---

# shadcn/ui

A framework for building ui, components and design systems. Components are added as source code to the app via the CLI.

This is a Blocks app: a Vite SPA with Tailwind v4, Base UI (`base`) on new apps and Radix (`radix`) on legacy ones. Three facts shape everything below:

- **The CLI runs as `CI=1 pnpm dlx shadcn@4.23.0 <command>`**, and every `add` as `yes n | CI=1 pnpm dlx shadcn@4.23.0 add <items> -y`: `-y` doesn't answer the CLI's "file already exists, overwrite?" question, so without `yes n` an `add` that meets an edited file installs nothing or hangs; with it that file is kept and the rest install. Never `npx`, `bunx` or another version. Examples below show the command only; run it that way.
- **`src/index.css` is the one global CSS file**: Tailwind wiring and the OKLCH token values together, in the stock shadcn layout, persisted by the platform. `init` runs once per app, from the `frontend` agent's "Theme & shadcn setup" section, after the `design` skill's design note picked the preset.
- **Blocks platform components** (`agent-chat`, `agent-layout`, `pdf-viewer`, `events-calendar`, `markdown`, `file-previewer`, `form`, `link`) install from the app's local `./.blocks-registry/` file addresses, never from `@shadcn`.

## Project Context

Nothing is injected here. Get it yourself:

- **Installed components:** `ls src/components/ui/`. Import only paths that exist there; `add` anything missing.
- **`components.json`:** `base` (`base` on new apps, `radix` on legacy ones — it decides `render` vs `asChild`), `style`, `rtl`, `iconLibrary` (`lucide`) and the aliases (`@/components/ui`, `@/lib/utils`).
- **The installed components' API:** the `awk` digest in the `frontend` agent's "Theme & shadcn setup" section, chained onto the same `add` call. It prints every signature and export in one call.

`CI=1 pnpm dlx shadcn@4.23.0 info --json` prints the resolved config when you need all of it.

## Principles

1. **Use existing components first.** `search @shadcn -q "<need>"` before writing custom UI; list `.blocks-registry/` for the platform's own components.
2. **Compose, don't reinvent.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
3. **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
4. **Use semantic colors.** `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.

## Critical Rules

These rules are **always enforced**. Each links to a file with Incorrect/Correct code pairs.

### Styling & Tailwind → [styling.md](./rules/styling.md)

- **`className` for layout, not styling.** Never override component colors or typography.
- **No `space-x-*` or `space-y-*`.** Use `flex` with `gap-*`. For vertical stacks, `flex flex-col gap-*`.
- **Use `size-*` when width and height are equal.** `size-10` not `w-10 h-10`.
- **Use `truncate` shorthand.** Not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **No manual `dark:` color overrides.** Use semantic tokens (`bg-background`, `text-muted-foreground`).
- **Use `cn()` for conditional classes.** Don't write manual template literal ternaries.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Popover, etc. handle their own stacking.

### Forms & Inputs → [forms.md](./rules/forms.md)

- **Forms use `FieldGroup` + `Field`.** Never use raw `div` with `space-y-*` or `grid gap-*` for form layout.
- **`InputGroup` uses `InputGroupInput`/`InputGroupTextarea`.** Never raw `Input`/`Textarea` inside `InputGroup`.
- **Buttons inside inputs use `InputGroup` + `InputGroupAddon`.**
- **Option sets (2–7 choices) use `ToggleGroup`.** Don't loop `Button` with manual active state.
- **`FieldSet` + `FieldLegend` for grouping related checkboxes/radios.** Don't use a `div` with a heading.
- **Field validation uses `data-invalid` + `aria-invalid`.** `data-invalid` on `Field`, `aria-invalid` on the control. For disabled: `data-disabled` on `Field`, `disabled` on the control.

### Component Structure → [composition.md](./rules/composition.md)

- **Items always inside their Group.** `SelectItem` → `SelectGroup`. `DropdownMenuItem` → `DropdownMenuGroup`. `CommandItem` → `CommandGroup`.
- **Use `asChild` (radix) or `render` (base) for custom triggers.** Check the `base` field in `components.json`. → [base-vs-radix.md](./rules/base-vs-radix.md)
- **`base` Select requires `items` on the root.** `<Select items={[{ label, value }, …]}>` — without it `SelectValue` shows the raw value instead of the label; the placeholder is a `{ value: null }` item, not a prop. On `radix`, keep inline JSX + `placeholder`. → [base-vs-radix.md](./rules/base-vs-radix.md)
- **Dialog, Sheet, and Drawer always need a Title.** `DialogTitle`, `SheetTitle`, `DrawerTitle` required for accessibility. Use `className="sr-only"` if visually hidden.
- **Use full Card composition.** `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`. Don't dump everything in `CardContent`.
- **Button has no `isPending`/`isLoading`.** Compose with `Spinner` + `data-icon` + `disabled`.
- **`TabsTrigger` must be inside `TabsList`.** Never render triggers directly in `Tabs`.
- **`Avatar` always needs `AvatarFallback`.** For when the image fails to load.

### Use Components, Not Custom Markup → [composition.md](./rules/composition.md)

- **Use existing components before custom markup.** Check if a component exists before writing a styled `div`.
- **Callouts use `Alert`.** Don't build custom styled divs.
- **Empty states use `Empty`.** Don't build custom empty state markup.
- **Toast follows the project base.** On `base` apps, `toast` from `@/components/ui/toast` (`createToastManager()` + `<Toaster toastManager>` in `src/root.tsx`). On legacy `radix` apps, `toast()` from `sonner`.
- **Use `Separator`** instead of `<hr>` or `<div className="border-t">`.
- **Use `Skeleton`** for loading placeholders. No custom `animate-pulse` divs.
- **Use `Badge`** instead of custom styled spans.

### Icons → [icons.md](./rules/icons.md)

- **Icons in `Button` use `data-icon`.** `data-icon="inline-start"` or `data-icon="inline-end"` on the icon.
- **No sizing classes on icons inside components.** Components handle icon sizing via CSS. No `size-4` or `w-4 h-4`.
- **Pass icons as objects, not string keys.** `icon={CheckIcon}`, not a string lookup.

### Chat & Messaging → [chat.md](./rules/chat.md)

- **An agent conversation is `AgentChat`.** `AgentChatSimple` and `AgentLayout` from the Blocks registry, with `useAgentChat` (`blocks-client` skill → agents.md), render the transcript, reasoning, tool calls and approvals themselves. Never rebuild one from the primitives below.
- **People messaging people composes the chat primitives.** Conversations use `MessageScroller`, rows use `Message`, surfaces use `Bubble`. Never hand-rolled bubble `div`s or a raw scroll container.
- **`MessageScroller` owns scroll behavior.** Streaming follow, anchoring, and jump-to-latest (`MessageScrollerButton`) are built in. Don't write a `useStickToBottom`/`ResizeObserver` hook.
- **Attachments use `Attachment`; system notes and dividers use `Marker`.** Not `Item` cards or `Separator` + a label.
- **Activity the app records uses `Trace`.** Steps, tool runs and sources read from the app's own tables are `TraceLine`s in a `Trace`. Behavior wraps the line: `TraceCollapsible`, a sheet trigger or a link. Not a hand-rolled `Collapsible` or a `Marker`.

### CLI

- **Never decode preset codes or build preset URLs manually.** Use `preset decode <code>`, `preset url <code>`, or `preset open <code>`. For project-aware preset detection, use `preset resolve`.
- **Apply preset codes directly with the CLI.** `apply <code>` on an existing app; `init --preset <code>` only in the one-time init.

## Key Patterns

These are the most common patterns that differentiate correct shadcn/ui code. For edge cases, see the linked rule files above.

```tsx
// Form layout: FieldGroup + Field, not div + Label.
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// Validation: data-invalid on Field, aria-invalid on the control.
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// Icons in buttons: data-icon, no sizing classes.
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// Spacing: gap-*, not space-y-*.
<div className="flex flex-col gap-4">  // correct
<div className="space-y-4">           // wrong

// Equal dimensions: size-*, not w-* h-*.
<Avatar className="size-10">   // correct
<Avatar className="w-10 h-10"> // wrong

// Status colors: Badge variants or semantic tokens, not raw colors.
<Badge variant="secondary">+20.1%</Badge>    // correct
<span className="text-emerald-600">+20.1%</span> // wrong
```

## Component Selection

| Need                                 | Use                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Button/action                        | `Button` with appropriate variant                                                                   |
| Form inputs                          | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| Toggle between 2–5 options           | `ToggleGroup` + `ToggleGroupItem`                                                                   |
| Data display                         | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| Navigation                           | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| Overlays                             | `Dialog` (modal), `Sheet` (side panel), `Drawer` (bottom sheet), `AlertDialog` (confirmation)       |
| Feedback                             | `toast` (base), `sonner` (legacy radix), `Alert`, `Progress`, `Skeleton`, `Spinner`                 |
| Command palette                      | `Command` inside `Dialog`                                                                           |
| Charts                               | `Chart` (wraps Recharts) — the `charts` skill                                                       |
| Layout                               | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| Empty states                         | `Empty`                                                                                             |
| Menus                                | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| Tooltips/info                        | `Tooltip`, `HoverCard`, `Popover`                                                                   |
| Agent conversation                   | `AgentChatSimple`, `AgentLayout` (Blocks registry — `blocks-client` skill)                          |
| People messaging people              | `MessageScroller`, `Message`, `Bubble`, `Attachment`, `Marker`                                      |
| Activity log, code or output on show | `Trace`, `CodeBlock`                                                                                |

## Key Fields

The `components.json` fields that matter here:

- **`aliases`** → use the actual alias prefix for imports (`@/components/ui`, `@/lib/utils`), never hardcode another.
- **`base`** → primitive library (`base` or `radix`). Affects component APIs and available props.
- **`style`** → component visual treatment (`maia`, `vega`, …), chosen once at init.
- **`rtl`** → `true` means `add` installs components with logical classes; set by `init --rtl` or `migrate rtl` (the `frontend` agent's "Theme & shadcn setup").
- **`iconLibrary`** → `lucide`: icons import from `lucide-react`, in the app's code and in every component `add` installs. `init` and `apply` write the preset's own library (`maia`'s is `hugeicons`), so the `frontend` agent sets it back to `lucide` before the first `add` ("Theme & shadcn setup").
- **`tailwind.css`** → `src/index.css`, the global CSS file where every variable lives. Always edit this file, never create a new one. Tailwind is v4: tokens are mapped in its `@theme inline` block.

The app is a Vite SPA on pnpm: no `"use client"`, no framework routing conventions beyond the `pages-and-routing` skill, and `pnpm add` for a non-shadcn dependency (the `custom-dependencies` skill).

## Component Docs, Examples, and Usage

The API of every installed component is in `src/components/ui/*.tsx`, and the `awk` digest in the `frontend` agent's "Theme & shadcn setup" section prints all of it in one call. That is the reference for creating, fixing, debugging or using a component: these are the exact files this app builds, for its base and style.

`docs <component>` prints URLs, not content, and its `ui.shadcn.com/code/...` links redirect cross-host to `raw.githubusercontent.com`, which `WebFetch` refuses; the upstream examples behind them import registry-internal paths this app does not have. Use `docs` only for a prose page you genuinely need, and fetch the `raw.githubusercontent.com` target directly. Never fetch anything to learn an API the digest already shows.

## Workflow

1. **Get project context** — `ls src/components/ui/` and `components.json` (see Project Context).
2. **Check installed components first** — before running `add`, list `src/components/ui/`. Don't import components that haven't been added, and don't re-add ones already installed.
3. **Find components** — `search @shadcn -q "<need>"` for shadcn's; `ls .blocks-registry/` for the platform's. Use `view @shadcn/<item>` to read an item you haven't installed.
4. **Install** — one `yes n | … add <components> -y` call listing every component the design needs, chained onto the digest. Blocks registry items go in their own `yes n | … add ./.blocks-registry/<item>.json -y` call; each prints its usage on install.
5. **Update** — when updating an installed component from upstream, use `--dry-run` and `--diff` to preview changes first (see [Updating Components](#updating-components) below).
6. **Review added components** — After adding a component or block from any registry, **always read the added files and verify they are correct**. Check for missing sub-components (e.g. `SelectItem` without `SelectGroup`), missing imports, incorrect composition, or violations of the [Critical Rules](#critical-rules).
7. **Registries are `@shadcn` and `./.blocks-registry/`.** Add a community registry (`@magicui`, `@tailark`, `owner/repo`) only when the brief names it; then check the added non-UI files for hardcoded import paths (`@/components/ui/...` is right here; another alias is not) and replace icon imports with `lucide-react`.
8. **Switching presets** — rare; only when the brief asks for it. `apply <preset>` re-installs every component in the new style and overwrites the theme values in `src/index.css`: afterwards put the brand's token values back (`memories/DESIGN.md` records them) and redo any component edits the app relied on. It also takes the new preset's icon library: after `apply maia`, set `iconLibrary` back to `lucide` and re-add the installed shadcn components with `add <components> --overwrite -y` — the one place `--overwrite` is right, since `apply` already replaced them. `apply <preset> --only theme,font` replaces only the palette and fonts and keeps the components. `preset resolve` shows the current one. The CLI keeps the app's `base`; never pass `--base` to change it.

## Mapping a brand spec onto the theme

The `design` skill decides how the app looks: it runs before `init`, writes the design note, picks the preset and records the language in `memories/DESIGN.md`. When the brief or that record gives decided values — a palette, a radius, fonts, control heights, or a DESIGN.md the user supplied — [design-system.md](./design-system.md) has the mechanics for putting them onto the shadcn tokens and component variants: role mapping, radius, elevation, fonts, type scale, dark mode, focus, control heights, and the traps that bite on the way.

## Updating Components

When the brief asks to update a component from upstream while keeping the app's changes, use `--dry-run` and `--diff` to merge. **NEVER fetch raw files from GitHub manually — always use the CLI.**

1. Run `add <component> --dry-run` to see all files that would be affected.
2. For each file, run `add <component> --diff <file>` to see what changed upstream vs local.
3. Decide per file based on the diff:
   - No local changes → safe to overwrite.
   - Has local changes → read the local file, analyze the diff, and apply upstream updates while preserving local modifications.
4. **Never use `--overwrite` to update.** It also resets components the app edited and the Blocks registry's installs. Its one use is re-adding components right after `apply <preset>` (step 8 of the Workflow), when `apply` has already replaced them.

## Quick Reference

```bash
# One-time init on a new app: the exact command, with the preset the design note chose,
# is in the frontend agent's "Theme & shadcn setup" section (append --rtl for an RTL language).
CI=1 pnpm dlx shadcn@4.23.0 init -b base -p <preset> -y --force --no-reinstall

# Add components, one call, chained onto the API digest from that same section.
yes n | CI=1 pnpm dlx shadcn@4.23.0 add button card dialog select -y && awk '…' src/components/ui/*.tsx

# Add Blocks platform components from the local registry.
yes n | CI=1 pnpm dlx shadcn@4.23.0 add ./.blocks-registry/agent-chat.json -y

# Retrofit RTL on an app inited without --rtl.
CI=1 pnpm dlx shadcn@4.23.0 migrate rtl -y

# Preview changes before updating.
CI=1 pnpm dlx shadcn@4.23.0 add button --dry-run
CI=1 pnpm dlx shadcn@4.23.0 add button --diff button.tsx

# Search and inspect the registry.
CI=1 pnpm dlx shadcn@4.23.0 search @shadcn -q "sidebar"
CI=1 pnpm dlx shadcn@4.23.0 search @shadcn -q "menu" -t ui
CI=1 pnpm dlx shadcn@4.23.0 view @shadcn/button

# Presets on an existing app (rare, only when the brief asks).
CI=1 pnpm dlx shadcn@4.23.0 preset resolve
CI=1 pnpm dlx shadcn@4.23.0 apply <preset>
CI=1 pnpm dlx shadcn@4.23.0 apply <preset> --only theme,font
```

**Presets:** the list, with when each fits, is in the `frontend` agent's "Theme & shadcn setup" section; the `design` skill picks one and bans `mira` and `lyra`.
**Preset codes:** version-prefixed base62 strings (e.g. `a2r6bw` or `b0`), from [ui.shadcn.com](https://ui.shadcn.com); pass them through unchanged.

## Detailed References

- [rules/forms.md](./rules/forms.md) — FieldGroup, Field, InputGroup, ToggleGroup, FieldSet, validation states
- [rules/composition.md](./rules/composition.md) — Groups, overlays, Card, Tabs, Avatar, Alert, Empty, Toast, Separator, Skeleton, Badge, Button loading
- [rules/chat.md](./rules/chat.md) — MessageScroller, Message, Bubble, Attachment, Marker, Trace, CodeBlock; streaming, anchoring, jump-to-latest
- [rules/icons.md](./rules/icons.md) — data-icon, icon sizing, passing icons as objects
- [rules/styling.md](./rules/styling.md) — Semantic colors, variants, className, spacing, size, truncate, dark mode, cn(), z-index
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) — asChild vs render, Select, ToggleGroup, Slider, Accordion
- [cli.md](./cli.md) — Commands, flags, presets, migrate
- [registry.md](./registry.md) — Authoring source registries, `include`, item definitions, dependencies, GitHub registry rules
- [customization.md](./customization.md) — Theming, CSS variables, extending components
- [design-system.md](./design-system.md) — Putting a brand spec onto the theme: role mapping, radius, elevation, fonts, type scale, dark mode, focus, control heights, traps
