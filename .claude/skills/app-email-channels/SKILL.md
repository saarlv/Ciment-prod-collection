---
name: app-email-channels
description: Giving an agent a mailbox it answers — an email inbox, a support address, "customers can email us and the agent replies". Load this skill when the user asks for email handling by an agent ("the agent should answer our support inbox", "reply to incoming emails", "give it an email address"). Covers the email-channel schema nested on the agent artifact and the connected-mailbox rules that decide whether one can be created at all. NOT for an app that merely SENDS mail from a workflow — that is an ordinary Gmail or Outlook action.
user-invocable: false
---

# Email Channel Artifacts

> An email channel needs an agent — see the `app-artifacts` skill's [agents](../app-artifacts/agents/agents.md) doc.

An email channel is a **mailbox the agent answers**. It is stored ON the agent, so define each one as an entry under `communicationChannels.email` in that agent's file — `artifacts/agents/<Agent>.json`. The file the entry sits in IS the agent that answers. Like an [agent-chat](../app-artifacts/agent-chats/agent-chats.md), the channel is a surface on top of an agent — **instructions, tools, and knowledge live on the agent** — so it carries only the mail settings.

## Ask which mailbox first — always

The platform does not create email addresses. A channel answers a mailbox the user has already connected, and **which one is never yours to decide**: a connection is identified by an opaque `connectionId` you cannot invent, its label is free text that often isn't even an address, and the wrong pick points an agent at somebody else's inbox.

So for every **new** email channel, before writing the entry:

1. Call `mcp__harness-tools__request_email_mailbox` with `channel_name` (and `agent_name`). This pauses the turn and shows the user a mailbox picker.
2. It comes back with a `connectionId`, and usually an `emailAddress`. Write both onto the entry.
3. If the user cancels, **do not create the channel** and do not guess a mailbox — ask what they would like to do instead.

That card also connects a mailbox when the user has none, so for this purpose it replaces the integration check: do **not** call `get_app_integrations` or `request_integration_connections` for the mailbox.

Ask **once per new channel**. Never call it when editing an existing channel — the mailbox is fixed at creation, and a seeded entry already carries its `connectionId`.

Writing an entry without asking does not work: with two mailboxes connected, sync cannot tell which one you meant and the channel fails.

## What it means to create one

The agent starts **reading and answering real mail**. It is given its mailbox's reply tool automatically, so it can answer within a thread; `allowOutbound` additionally lets it write to people other than the sender. Nothing is bought and no address is created — but a live inbox now reaches an AI, so create a channel only when the user asked for their mail to be handled ("answer our support inbox", "reply to incoming emails"). An app that merely SENDS mail — a notification, a receipt, an invoice — needs a Gmail or Outlook **action** in a workflow, not a channel.

One more thing worth telling the user: the trigger fires on **everything the mailbox receives**, not just messages meant for the agent. The agent is instructed to ignore newsletters, receipts, and automated mail, but a shared personal inbox is a bigger surface than a dedicated support address. Prefer a dedicated mailbox.

## Where it goes

Inside the owning agent's file, under `communicationChannels.email`:

```jsonc
// artifacts/agents/SupportAgent.json
{
  "name": "SupportAgent",
  "instructions": "Answer customer questions about orders.",
  "communicationChannels": {
    "email": [
      {
        "name": "Support Inbox",
        // Both from request_email_mailbox — never hand-written.
        "connectionId": 42,
        "emailAddress": "support@acme.com",
        "signature": "— Acme Support",
      },
    ],
  },
}
```

`communicationChannels` groups the ways to reach an agent by kind; `email` is the mailboxes. An agent that has no channels simply has no `communicationChannels` key. An agent can answer more than one mailbox: add another entry to the array.

**Omitting a kind is not the same as an empty list.** Sync only treats an agent as authoritative over a kind of channel when the artifact actually declares that key — so an agent file rewritten without `email` keeps its mailboxes, rather than an unrelated edit silently unhooking them. To remove a channel, write the list without it; to remove the last one, write an explicit `"email": []`. The same holds for `voice`, independently: listing `email` says nothing about phone lines.

## JSON schema

Each entry of `communicationChannels.email`:

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Channel name, shown in the builder (e.g. \"Support Inbox\"). This is its identity — sync matches on it, so renaming an entry that has no channelId creates a second channel on the same mailbox, and the sender gets two replies."
    },
    "connectionId": {
      "type": "number",
      "description": "Which connected mailbox to answer. Comes from request_email_mailbox — NEVER invent, guess, or copy one from another app: it is an opaque account-scoped id, and a wrong value binds the agent to someone else's inbox. FIXED at creation."
    },
    "emailAddress": {
      "type": "string",
      "description": "The address of that mailbox (e.g. \"support@acme.com\"), as returned alongside the connectionId. Mostly a readable label — connectionId is what binds — and absent when the connection never reported one. FIXED at creation."
    },
    "signature": {
      "type": "string",
      "description": "Appended to the bottom of every reply the agent sends (e.g. \"— Acme Support\"). Omit when the user did not ask for one."
    },
    "allowOutbound": {
      "type": "boolean",
      "description": "When true, the agent can also write to people other than the one it is answering. Default false, which leaves it able to reply within a thread only. Set it only when the user wants the agent to start new email conversations."
    },
    "protection": {
      "type": "object",
      "description": "Who may reach the agent on this channel. Omit unless the user asked to restrict access.",
      "required": ["mode", "entries"],
      "properties": {
        "mode": {
          "type": "string",
          "enum": ["open", "allowlist", "blocklist"],
          "description": "\"open\" admits everyone, \"allowlist\" admits only the listed entries, \"blocklist\" refuses only them."
        },
        "entries": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Email addresses (\"support@acme.com\") or a whole domain (\"@acme.com\"). Empty for \"open\"; at least one for \"allowlist\"."
        }
      }
    },
    "channelId": {
      "type": "string",
      "description": "READ-ONLY identity of an existing channel. Keep it exactly as-is when editing a seeded entry — it is how sync knows to update this channel instead of binding the mailbox a second time."
    }
  }
}
```

## Protection — who may reach the agent

A channel entry may carry an optional `protection`. Absent means open. Every inbound message is checked before the agent runs; a refused sender is dropped silently, with no reply.

```jsonc
"protection": {
  "mode": "allowlist",   // "open" | "allowlist" | "blocklist"
  "entries": ["support@acme.com", "@acme.com"]   // addresses, or a whole @domain
}
```

- **Offer it, do not impose it.** Set it only when the user asks, or the request implies a restricted audience ("only our staff should use this line"). Then ask which addresses to allow or block; never guess.
- **It is channel configuration.** Never filter senders in the agent's instructions or system prompt, or in a pre-action; the platform enforces `protection` before the agent runs.
- Both restricting modes refuse a sender whose identity cannot be read (a From header with no readable address). An `"allowlist"` needs at least one entry.
- Edit in place: keep `channelId`, write the new `protection`. Clear it with `{ "mode": "open", "entries": [] }`. Omitting it leaves the live setting unchanged.

## Rules

- **The mailbox and the owning agent are fixed at creation.** Sync cannot point an existing channel at a different mailbox or move it to another agent — mail already on its way to the old address would be silently orphaned — so it reports an error instead of quietly ignoring the change. Changing either means deleting the entry and creating a new one (which asks for the mailbox again).
- **Gmail and Outlook mailboxes only.** A Microsoft 365 shared mailbox (a team address nobody signs in to) can't be answered: suggest forwarding its mail to a mailbox the user signs in to.
- **Everything else is editable in place.** Keep the entry's `name` and write a new `signature` / `allowOutbound`, and sync updates the live channel.
- **Never invent a `connectionId`.** It only ever comes from `request_email_mailbox` for a new channel, or from the seeded entry for an existing one. Copying one from another agent, another app, or an earlier conversation binds the wrong inbox.
- **Never rename a seeded entry without keeping its `channelId`** — losing that identity binds the mailbox twice, and every message gets answered twice.
- **Removing the entry from the list stops the agent answering that mailbox.** Sync tears the channel down: the trigger is unsubscribed and the agent's mail tools are removed. The mailbox itself is untouched and stays connected, so this is recoverable — unlike a phone line. Deleting the whole agent file takes its channels down with it.
- **Prefer `Edit` over a full rewrite of an agent file.** A rewrite that drops the rest of the entry's fields (`channelId`, `connectionId`, `emailAddress`) loses the channel's identity. `Read` the file and `Edit` the field you mean to change.
- **Sync error "channel … no longer exists (deleted outside the builder)"** means the user removed that channel from the builder UI while its entry stayed behind. Sync refuses to re-bind the mailbox. Delete the stale entry — only drop its `channelId` instead if the user explicitly wants a brand-new channel.
- **Sync error "Email channels are not enabled for this account"** means the account lacks the email-channel entitlement. Nothing you can fix from here: say so, don't retry, and remove the entry you just wrote so it doesn't retry on the next turn.
- **Sync error "already answered by the … channel"** means that mailbox is already bound in this app. Two channels on one mailbox both wake on every message and answer it twice — reuse the existing channel instead.
- **Email channels have no frontend binding.** They produce no `product-types.ts` export and nothing to render — a customer uses their own mail client. If the UI should advertise the address, pass it from `emailAddress` to the `frontend` agent as plain copy.
- Whenever the agent needs to read or write app data while handling mail, give the **agent** the relevant table tools — same as for chats.

After any email-channel change, run **`pnpm gen:types`**.
