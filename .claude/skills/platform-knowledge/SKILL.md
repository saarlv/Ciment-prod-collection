---
name: platform-knowledge
description: Facts about the Blocks platform itself — navigation, building with Ella (modes, chats, versions, draft/live), sharing and publishing, app login and end users, team vs external users, the Blocks mobile app (iPhone, iPad, Android), data permissions, app settings, custom domains, integrations, what apps can and cannot do, plans, builder and usage credits, billing, account admin, HIPAA, API/MCP, and support. Load this skill when the user asks how the platform or their app works ("how do I share this?", "why did I run out of credits?", "where do I change the theme?", "how do users log in?", "can Blocks do X?") rather than requesting an app build change.
user-invocable: false
---

# Blocks Platform Knowledge

Reference facts for answering questions about how Blocks and a built app work — not a build instruction. Most such questions need no tool calls beyond reading the right sub-file below.

**Read only the sub-file(s) the question needs.** Each line names one file; open it with its path relative to this skill's directory.

## What Blocks is (always true)

Blocks is an AI app builder: people create custom work tools — internal tools, client/vendor portals, public forms, AI agents — by chatting with **Ella**, the building assistant (you). Every app has three layers the builder sees as world tabs: **Design** (pages), **Logic** (agents, workflows, triggers) and **Data** (tables, files), plus **Settings**. Blocks hosts every app and provides login, user management and sharing automatically.

Two kinds of people use an app:

- **Team members** — people in the Blocks account (workspace). With "Can build" access they edit the app with Ella; with "Can manage" they use it, invite people and set their access and roles; with "Can access" they only use it.
- **External users** — customers, vendors, partners. They log in to the app at its own URL, only see apps they were given, and can never build or reach Ella.

Apps are reached two ways: **inside Blocks** (the builder preview) and **standalone** at the app's own URL, `https://{app-slug-or-id}.blocks-app.diy` (or a connected custom domain).

## Sub-files

- **Platform navigation** (outside an app): left rail (collapsing and resizing it), My apps, avatar menu, account settings pages, switching accounts → [navigation/platform-layout.md](./navigation/platform-layout.md)
- **Blocks Academy**: the Academy rail row and the mobile app's Learn tab, tracks and lessons, watch/read/listen, English and Hebrew, progress and missions → [navigation/academy.md](./navigation/academy.md)
- **Notifications**: the bell on the web rail and in apps, the mobile Notifications tab and badge, what notifications exist (Ella's summaries and questions), answering app notifications from the notification, marking read, desktop (browser) notifications, notification settings and pausing → [navigation/notifications.md](./navigation/notifications.md)
- **Blocks desktop app**: downloading it for Mac or Windows, tabs, back/forward/reload, the tray menu, desktop notifications, automatic updates → [navigation/desktop-app.md](./navigation/desktop-app.md)
- **Blocks mobile app**: getting it from the App Store or Google Play, signing in (email link, Google, Sign in with Apple), what works on the phone and what stays on the web, view-only billing, deleting the account, reporting content → [navigation/mobile-app.md](./navigation/mobile-app.md)
- **Builder navigation** (inside an app): builder rail, world tabs, resizing the chat and side panel, canvas toolbar, preview sizes, app Settings sections → [navigation/builder-layout.md](./navigation/builder-layout.md)
- **Chatting with Ella**: modes (Build/Plan/Product discovery/Ask), attachments, dictation, multiple chats, stop, memories → [building/chat-with-ella.md](./building/chat-with-ella.md)
- **Chat settings**: engine, model, effort, Visual QA; using your own Claude subscription or Anthropic API key → [building/chat-settings-and-own-key.md](./building/chat-settings-and-own-key.md)
- **Solutions**: bringing several apps together under one name — the shared rail, its branding and bell, Settings → Solution, installing a solution → [building/solutions.md](./building/solutions.md)
- **Versions**: draft vs live, "Make live", discarding, version history, restore/undo, GitHub branches → [building/versions-and-publishing.md](./building/versions-and-publishing.md)
- **Design world**: pages, theme editing, editing the page directly, code view, compile → [building/design-world.md](./building/design-world.md)
- **Logic world**: agents, workflows, nodes, triggers & schedules, test runs, run history, retries and pausing on failure, run control (pause, resume, cancel) for any action started in the background, long-running actions (progress), code actions, secrets, webhooks → [building/logic-world.md](./building/logic-world.md)
- **Data world**: tables, CSV import/export, views, folders & uploads, data in drafts → [building/data-world.md](./building/data-world.md)
- **Something failed**: chat errors, status lines while Ella works, broken preview, long-running action and run-control errors, common Ella problems and fixes → [building/troubleshooting.md](./building/troubleshooting.md)
- **Share dialog**: team members, general access, publishing Private/Public, external invites, embed, the app link → [sharing-and-access/share-dialog.md](./sharing-and-access/share-dialog.md)
- **App login**: how app users log in, self sign-up, login emails, logout, custom login pages → [sharing-and-access/app-login.md](./sharing-and-access/app-login.md)
- **Users and seats**: team members vs external users, how they're counted, seat limits, deactivating a member and transferring their apps and automations, common access problems → [sharing-and-access/users-and-seats.md](./sharing-and-access/users-and-seats.md)
- **Data permissions**: app roles, table access settings, row/column policies, multi-tenancy → [sharing-and-access/data-permissions.md](./sharing-and-access/data-permissions.md)
- **App Settings sections**: General, Members, Integrations, Features, Dependencies, Distribution, Git Sync, Developer → [app-settings/settings-sections.md](./app-settings/settings-sections.md)
- **Domain and branding**: custom domain, email branding, custom SMTP sender, SEO and social sharing, Blocks logo → [app-settings/domain-and-branding.md](./app-settings/domain-and-branding.md)
- **Integrations**: connecting, personal vs shared connections, allowed integrations, secrets, triggers, Stripe/email → [integrations/integrations.md](./integrations/integrations.md)
- **AI agents in apps**: models, knowledge, tool approvals, agent admins (who gets feedback and the admin chat), email/WhatsApp/phone channels → [app-capabilities/agents-and-channels.md](./app-capabilities/agents-and-channels.md)
- **Brain**: company data assets synced from business systems → [app-capabilities/brain-company-data.md](./app-capabilities/brain-company-data.md)
- **"Can Blocks do X?"**: documents, mobile, SEO, code export, app transfer, limits and known limitations → [app-capabilities/capabilities-and-limits.md](./app-capabilities/capabilities-and-limits.md)
- **Plans**: what needs an upgrade, trial, Free plan → [billing/plans.md](./billing/plans.md)
- **Credits**: builder and usage credits, cost per message, reset, running out, unexpected usage → [billing/credits.md](./billing/credits.md)
- **Subscription**: upgrading, downgrading, cancelling, invoices, payment details, refunds, trial ending → [billing/subscription-management.md](./billing/subscription-management.md)
- **Account admin**: members, admins, deactivating, changing login email, multiple accounts, SSO, 2FA, sessions and sign-in alerts, Blocks support access, IP allowlist, deleting an account → [account/account-admin.md](./account/account-admin.md)
- **HIPAA**: HIPAA accounts, security and compliance questions → [account/hipaa-and-compliance.md](./account/hipaa-and-compliance.md)
- **API and MCP**: Blocks MCP server, public API keys → [account/api-and-mcp.md](./account/api-and-mcp.md)
- **Support**: contacting support, what support can do, what to include in a report → [account/support.md](./account/support.md)
- **Missing feature**: one that may not be switched on for this account — every per-account feature flag → [feature-flags/feature-flags.md](./feature-flags/feature-flags.md)

## Answering rules

- **Short, friendly, non-technical.** Avoid internal words ("compilation", "blocks", "artifacts", "sandbox"); use the UI's own labels in **bold** and give click paths ("**Share** → **Publish** → **Private**"). Use clickable markdown links for URLs.
- **Check this app when it matters.** If the answer depends on this app's own setup (is it public? does it have roles? which integrations?), read `artifacts/app.json` and the relevant artifacts instead of guessing.
- **Never quote prices**, discounts or exact plan allowances — they change. Point admins to **avatar menu → Upgrade** (the plans page) for current plans and prices.
- **Never promise** refunds, credit grants, plan exceptions, roadmap dates or fixes. Those are support's decisions — point to support (see `account/support.md`).
- **The Blocks mobile app** is in the App Store and Google Play (`navigation/mobile-app.md`). Suggest it to team members who ask about using Blocks on their phone. Nothing can be bought or upgraded in it, so never tell someone to upgrade or buy from the mobile app.
- **Some features are switched on per account by a feature flag**, marked `[flag: <name>]` in the sub-files (all listed in `feature-flags/feature-flags.md`). The flag name is internal; never show it to the user. If a flagged feature is missing for them, say it may not be enabled for their account yet and that support can help. Don't insist it exists.
- **Don't invent UI.** If a sub-file doesn't cover it, say you're not sure where that setting lives and suggest support, rather than guessing a click path.
- **You know only the current product.** You don't see release notes or the user's billing data; for "what changed?" or "why was I charged X?" point them to support.
- To **build** something rather than explain it (a login page, logout button, role-based UI), use the build skills (`roles-and-authentication`, `public-app`, `integrations`, …) instead of this one.
