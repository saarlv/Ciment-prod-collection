# Iteration 3 — adopt the "Liquid+" design from git, make it the house style, add the agent skeleton (paste to Ella)

Context: the app's new look was designed with Saar and built locally in Claude Code, then pushed to GitHub
`blocksapps/Ciment-Collection`, branch `master` (commit "Liquid+ design: glass theme, new shell, agent-first Today's queue").
Local `pnpm lint`, `pnpm type-check` and `pnpm build` pass. It has NOT been checked in the live app yet.
We are still building the skeleton, not the content: no new business logic in this iteration.

What the commit contains:
- `src/index.css`: the liquid-glass theme. It adds the wallpaper and the `glass`, `glass-hero`, `glass-inner`,
  `glass-soft` and `brand-card` utilities, the glass fills and shadows, chip tokens and the `--aging-1..4` ramp.
  Brand blue is #2C44A6.
- `src/root.tsx`, the new shell:
  - a floating glass sidebar with a blue brand card (centered white Ciment logo, drawn by the inline component
    `src/components/CimentLogo.tsx`, and "שלום, {first name}") and white-glass active nav items;
  - a floating glass top bar with the date, a customer search that opens `/customers?q=`, and "שאל את הסוכן",
    which is disabled for now.
- `src/routes/index.tsx` (תור היום), rebuilt agent-first:
  - a recommendation stack;
  - a KPI card with a debt-aging bar computed from Invoices;
  - an activity empty state;
  - a queue table with the overdue amount.
- Shared components restyled: `AgentPanel`, `AgentAvatar`, `PageHeader`, `PageStates`, `StatusBadge`, `ObligoBar`,
  the shadcn button, card, tabs and sidebar. There is a new `NextPhase` wrapper for controls that are disabled until the agent exists.
- `memories/files/DESIGN.md`: the house style, registered in `memories/AGENT.md`. `memories/STORY.md` is updated.

## 1. Take the git version
Make sure the workspace has the latest `master`. If a "[blocks] Manual sync" conflicts with it, keep the git
version of `src/**` and `memories/**`. Do not revert any of the theme, shell or Today's-queue changes.

Why the first pull failed: the commit imported `src/assets/ciment-logo-white.svg`, and the platform's git import
skips non-code files, so the build failed with ENOENT. The new commit draws the logo with the inline component
`src/components/CimentLogo.tsx` and removes the svg file and the import. If you restored a logo file or changed the
logo code in `src/root.tsx` in an earlier turn, drop that change and keep the git version. From now on, never import
image or asset files from `src/`; draw SVGs as components.

## 2. Check nothing broke
Run `pnpm lint`, `pnpm type-check` and `pnpm build`, and paste the last lines of each. Fix only real errors. Do not
restyle anything to make an error go away.

## 3. Make Liquid+ the binding house style
- Read `memories/files/DESIGN.md` fully. From now on, every UI change and every frontend brief in this app,
  including future pages and the second agent's screens, must follow it. Pass it, together with the DESIGN RULES
  block in `memories/AGENT.md`, to the frontend agent every time.
- Use the shared utilities and components (`glass*`, `AgentPanel`, `PageStates`, `StatusBadge`, `NextPhase`).
  Do not hand-roll colors, shadows or blur.
- Keep the wallpaper's hairlines and circles. Keep the cards translucent with the blur. Accent blue appears only on
  the brand card, the ONE primary button per screen, the active nav item and critical status.

## 4. Agent skeleton: identity only, no logic
The signed scope has two agents:
- the **Collections agent**, which is the first scope;
- the **Orders & delivery coordination agent**, which comes later.

In this iteration, create only the Collections agent's identity:
- An agent artifact with:
  - display name **<<Saar: fill in the agent's name>>**;
  - job title "סוכן/ת גבייה";
  - a profile photo, a neutral professional illustration that matches the calm blue style;
  - short Hebrew instructions saying it is in setup and will start working after the Priority connection.
- **No tools, no workflows, no channels.** Its behaviour waits for the discovery with Yaniv.
- If the platform's rules require an agent mini-app or agent-chat artifact for it, create them. Keep every chat entry
  point in the UI disabled through `NextPhase` until the agent goes live. "שאל את הסוכן" stays disabled.
- In the UI, replace the hard-coded placeholder identity with `useAgent`: `AgentAvatar` and the "סוכן הגבייה" labels
  in `AgentPanel` and on Today's queue should show the agent's name, job title and photo. Keep the dark
  sparkle avatar only as the loading/fallback state.
- Do not create the Orders agent yet. When it comes, it uses the same style and components.

## What must not change
- No table, column, view, action or workflow changes.
- No data writes. The TEST- fixtures stay as they are, and no mock data is added.
- No calculation changes. No route or URL changes.
- The approved look: theme, shell, Today's queue layout, StatusBadge colors.

## Acceptance (I will check each one on screen)
1. All 9 pages load with no console errors, on the glass wallpaper, with readable text.
2. The sidebar shows the blue brand card with the centered white logo and "שלום, <first name>". The active item is a
   white pill with blue text.
3. The top bar's customer search opens the customers page already filtered. "שאל את הסוכן" is disabled and its
   tooltip says "יופעל בשלב הבא".
4. On Today's queue, the hero, the KPI card with the aging bar, and the table render. With no queue rows, the empty
   states say what the agent is waiting for.
5. The agent's name, job title and photo appear in the hero and the AgentPanel cards on other pages, through `useAgent`.
6. The agent artifact, read back, has `tools: []` on purpose.

## STORY.md
Log "Iteration 3 — Liquid+ adopted from git, agent identity skeleton" under Evolution, and fold any new decision
into Decisions.

Reply with:
- the three command outputs;
- the agent artifact JSON as read back;
- the files you touched;
- anything you could not do or decided differently, and why.
