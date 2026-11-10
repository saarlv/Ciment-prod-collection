---
name: custom-dependencies
description: Adding an npm library this app needs that the boilerplate doesn't already ship. Load ONLY when the app genuinely requires a package beyond the preinstalled set (React, Recharts, date utils, lucide-react, motion, etc.) — most apps never need this. Covers `pnpm add`, how the dependency round-trips and re-installs at compile, and verifying a library's real exports before importing.
user-invocable: false
---

# Custom npm dependencies

The boilerplate already ships React, react-router, Recharts, date-fns, lucide-react, motion, lodash, papaparse, xlsx, zod, and more — **check `package.json` before adding**.

**UI components are not a custom dependency.** shadcn/ui components and the packages they pull in are installed with the shadcn CLI — see the `shadcn` skill. Never `pnpm add` a component library by hand.

## Adding a package

`pnpm add <package>` installs into this app's isolated per-app `node_modules` (built from the shared pnpm store, so nothing leaks between apps) and updates `package.json`, so you can import and verify it right here.

## Rules

- **Pick maintained, ESM-first, pure-JS libraries.** Native binaries and packages needing postinstall/build scripts do not work — install scripts are disabled by the app's pnpm config (`ignoreScripts` in `pnpm-workspace.yaml`). CommonJS is supported, including packages that `require` react and other provided globals.
- **Add, don't remove.** Leave the boilerplate's own deps, scripts, and tooling (including `pnpm-workspace.yaml` and `.npmrc`) alone — the platform merges your deps onto the boilerplate, yours winning on conflicts.
