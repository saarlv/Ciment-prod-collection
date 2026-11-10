# Integrations

## What's available

- Blocks connects to dozens of services. The list changes without notice, so check the store rather than quoting a fixed list. Common ones:
  - **Google**: Gmail, Calendar, Drive, Docs, Sheets, Meet, Ads, Analytics, Search Console
  - **Microsoft**: Outlook, Teams, OneDrive, SharePoint
  - **Team tools**: Slack, Notion, Asana, Jira, Confluence, Airtable, monday.com
  - **Sales and support**: HubSpot, Intercom, Zendesk, Calendly, Zoom, Mailchimp
  - **Social**: LinkedIn, Facebook, Instagram, YouTube, X, Meta Ads
  - **Payments**: Stripe
  - **AI**: Anthropic (Claude, with your own Claude API key)
  - **Data and other**: Snowflake, GitHub, WhatsApp, SAP Business One, Priority, Odoo, DocuSeal, Dropbox Sign, Apollo, People Data Labs, Semrush, ElevenLabs, SendGrid, Apify, and databases
- **Ask Ella first.** If a service isn't in the store, Ella can usually connect to its API with a custom code action, given the API docs and your API key, which you enter as a secret. You need your own account with that service, with API access. Blocks doesn't resell third-party subscriptions.
- Some integrations, and custom integrations, need an eligible plan. A locked integration shows which plan unlocks it.
- Built-in services need no account of your own: email sending, SMS, AI web search and AI models. They use usage credits.

## Connecting

- **Easiest**: when Ella needs a service, a **connect card** appears in the chat. Click **Connect** and sign in.
  - Ella never asks for passwords or API keys in a message.
  - Connect when asked; a build that depends on a service can't finish without it.
- The builder rail shows **Integrations** (integrations icon with a dot) while the app has connections still waiting: "Connect your account(s)".
- **All your connections** are under **Integrations** in the platform rail:
  - **All integrations**
  - **My connections**
  - **Other connections**, for admins: everyone's connections, read-only
- Connecting opens a sign-in popup. If nothing happens, allow popups for Blocks. On mobile the page redirects instead.

## Personal vs shared connections

There are two separate switches.

1. **Account level**: the **Team connection** switch on a connection, "Everyone on your account can use this connection". Only the person who created a connection can share, rename or delete it.
2. **App level**: **Settings → Integrations → Connection type**.
   - **Share with all app users**: everyone using the app acts through your connected account. For example, all emails are sent from your Gmail.
   - **Just for me**: each user connects their own account. For example, each person's emails come from their own Gmail. Users are prompted to connect when they first need it.
   - If the app has a shared connection, it's used instead of each user's own.
     - Exception [flag: per-user-integration-triggers]: a workflow Ella sets to run per user listens only on each user's own connection, never the shared one. Users must connect their own account in the app for it to run for them (`building/logic-world.md`).
3. **Per workflow step**: a step's **Connection** setting can use the connection from its trigger, or the app-level one.
4. **Optional**: tick it so app users aren't forced to connect. The app should hide what depends on it.

## Reconnecting and disconnecting

- Expired or revoked connections show **Connection expired** / **Access was revoked** with **Reconnect**. The owner also gets an email.
- A connection's "…" menu has **Reconnect** and **Disconnect**. Disconnect removes it from every app that used it.
- To swap the account an app uses: **Settings → Integrations** → pick another connection, or **Remove from app** and ask Ella to connect it again.

## Account admins: Allowed integrations

**Account → Allowed integrations** restricts which integrations (and which of their actions and triggers) the account may use, and whether code actions are allowed. A blocked integration appears disabled with "Ask your admin".

## Secrets and webhooks

See `building/logic-world.md`.

## Service-specific notes (from support)

- **Stripe**:
  - Connect your own Stripe account.
  - Blocks isn't a payment processor and never holds app revenue; payout questions go to Stripe.
  - Card payments and Google Pay work.
  - Apple Pay needs a domain verification file Blocks can't serve yet.
- **Email from your own address**: use Gmail or Outlook (with **Just for me** if each user should send as themselves), or an SMTP connection.
  - Email channels where an agent _answers_ a mailbox support Gmail and Outlook, not Microsoft 365 shared mailboxes (`app-capabilities/agents-and-channels.md`).
- **Email links**: write the app's link as plain text, and test it in a private window.
- **SMS**: no setup needed. Store phone numbers in international format (+country code).
- **Facebook/Instagram**:
  - Carousels need 2–10 JPEGs under 8 MB.
  - Meta retires some metrics from time to time, so update the metric names if a report breaks.
- **LinkedIn**: data access is limited by LinkedIn's privacy rules; scraping profiles isn't reliable.
- **Anthropic (Claude)**: for using your own Claude account, which bills usage to your Anthropic organization rather than to Blocks usage credits. AI features use Blocks' built-in AI, which needs no key; apps use Anthropic only when you ask to work with your own Claude account, Claude Managed Agents or Claude Code routines.
  - The connect form asks for an **API key** (from the Claude Console, under API keys), an optional **Workspace ID** (only when the key isn't tied to one workspace) and optional **Claude Code routines**. The key is checked when you connect; a wrong or revoked key is rejected on the form.
  - One connection serves the whole account. To change it later without re-entering the key: **Integrations** → **My connections** → **Anthropic** → the **⋯** menu → **Edit details**. Saved keys and tokens show as blank; leave them blank to keep them.
  - Apps can ask Claude directly (structured answers, documents and images, web search, code execution, skills), run large batches, keep and download files, run Claude Managed Agents that keep working on their own, and start Claude Code routines.
  - Long jobs (agent sessions, routines) send their results back into the app when they finish: Ella sets up a workflow with a webhook that receives them and saves them to your tables.
  - **Routines**: create the routine at claude.ai/code/routines, then **Add trigger** → **API** → **Generate token** (shown only once). On the Anthropic connection, **Add routine** and fill in a **Name** (how apps refer to it, e.g. "Triage bug"), **What it does**, the **Trigger URL** and the **Token**. Pasting the whole curl command into **Trigger URL** also works. The routine's own instructions must tell Claude to act on the text it's sent and to post its results to the address it's given; Ella can write them for you. Its environment needs internet access so it can reach the app.
- **AI web search**: built in, so no personal key is needed. It uses usage credits; the deep-research option costs much more than a quick search.
