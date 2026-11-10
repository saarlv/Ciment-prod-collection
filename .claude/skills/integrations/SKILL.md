---
name: integrations
description: OAuth integrations and API secrets. Load IMMEDIATELY when a request involves any third-party service that needs credentials. FIRST step is always to read `artifacts/app.json` — only hand the user off to App Settings if the required provider/secret is missing there.
user-invocable: false
---

# Integrations

Load this the instant a request touches a third-party service that needs credentials (Gmail, Slack, Google Calendar, Linear, Intercom, Stripe, a custom API key), before exploring the codebase and before creating any integration-backed action.

## Step 1 — read `artifacts/app.json` before anything else

Make it your first tool call. It is the only record of what is already connected, so until you have read it you cannot tell whether a handoff is needed:

- **`integrations`** — `[{ "provider": "gmail" }, …]` — OAuth providers already connected on this app.
- **`secrets`** — `[{ "name": "MY_API_KEY" }, …]` — custom secrets already configured.

It is a snapshot from the last sync from Blocks, so after the user connects something new they must sync again before it appears.

## Step 2 — decide, per provider and per secret

**Everything the request needs is present** → continue the build normally. Don't hand off, don't send the user to App Settings, don't mention this skill. Asking a user to reconnect something they already connected is the exact bug this skill exists to prevent.

**Something is missing** → hand off for the missing ones only.

## Step 3 — hand off and wait

Stop building where you are — no action artifact, no `code-actions/` code, no subagent delegation, no `pnpm gen:types`, no `pnpm bundle:action` — and send one message naming every missing integration and secret at once, so the user makes a single trip to the platform:

> To build this I need the **<Integration Name>** integration connected on the Blocks platform first.
>
> 1. Open this app in Blocks → **App Settings → Integrations**.
> 2. Connect **<Integration Name>** (choose **Personal** or **Shared** based on whether it should be user-owned or app-wide).
> 3. Reply here once it's connected and I'll continue.

Then wait. Once the user replies, re-read `artifacts/app.json` if you have a fresh copy to confirm the provider/secret is there, and resume the normal artifact / code-action / frontend flow, referencing the integration by its provider name.

## Hard rules

- **Never ask for API keys, OAuth tokens, or secrets in chat.** The user adds them in **App Settings → Integrations** on the platform.
- **Public keys** (e.g. a Stripe publishable key used by client-side UI) may be collected in chat.
