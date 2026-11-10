---
name: app-whatsapp-channels
description: Giving an agent a WhatsApp Business number it answers — "customers can message us on WhatsApp and the agent replies", "connect the agent to our WhatsApp number". Load this skill when the user asks for an agent to handle WhatsApp messages. Covers the whatsapp-channel schema nested on the agent artifact, the connection check, and the number-picker step that decides which number. NOT the `whatsapp` skill, which is about building a WhatsApp conversations UI in the app; and NOT for an app that merely SENDS a WhatsApp message from a workflow — that is an ordinary WhatsApp action.
user-invocable: false
---

# WhatsApp Channel Artifacts

> A WhatsApp channel needs an agent — see the `app-artifacts` skill's [agents](../app-artifacts/agents/agents.md) doc.

A WhatsApp channel is a **business phone number the agent answers on**. It is stored ON the agent, so define each one as an entry under `communicationChannels.whatsapp` in that agent's file — `artifacts/agents/<Agent>.json`. The file the entry sits in IS the agent that answers. Like an [agent-chat](../app-artifacts/agent-chats/agent-chats.md), the channel is a surface on top of an agent — **instructions, tools, and knowledge live on the agent** — so it carries only the channel settings.

## Before writing a new channel — always, in this order

1. **Check the integration.** Call `mcp__harness-tools__get_app_integrations` for `whatsapp`. If it is missing, call `mcp__harness-tools__request_integration_connections` with exactly `whatsapp` and stop for the user. If they skip connecting, do **not** write a WhatsApp channel — say the agent can't answer WhatsApp without the connection and ask what they'd like instead.
2. **Ask which number.** Call `mcp__harness-tools__request_whatsapp_phone_number` with `channel_name` (and `agent_name`). This pauses the turn and shows the user the numbers of the connected account. A connection can expose several numbers, and their ids cannot be guessed.
3. **Write what it returns.** The answer carries a `phoneNumberId` and usually a `displayPhoneNumber`. Write both onto the entry.
4. If the user cancels, **do not create the channel** and do not guess a number — ask what they would like to do instead.

Ask **once per new channel**. Never call the number picker when editing an existing channel — the number is fixed at creation, and a seeded entry already carries its `phoneNumberId`.

## What it means to create one

The agent starts **reading and answering real WhatsApp messages** sent to that number. It is given a hidden send-message tool automatically, so it can reply in the conversation. Nothing is bought — the number belongs to the app's connected WhatsApp Business account — but a live customer channel now reaches an AI, so create a channel only when the user asked for WhatsApp to be handled. An app that merely SENDS a WhatsApp message — a notification, a reminder — needs a WhatsApp **action** in a workflow, not a channel.

## Where it goes

Inside the owning agent's file, under `communicationChannels.whatsapp`:

```jsonc
// artifacts/agents/SupportAgent.json
{
  "name": "SupportAgent",
  "instructions": "Answer customer questions about orders.",
  "communicationChannels": {
    "whatsapp": [
      {
        "name": "Field WhatsApp",
        // Both from request_whatsapp_phone_number — never hand-written.
        "phoneNumberId": "1103140766214227",
        "displayPhoneNumber": "+1 510 851 8633",
        // Optional: an EXISTING app action to run before the agent answers.
        "preAction": "LookupCustomer",
      },
    ],
  },
}
```

`communicationChannels` groups the ways to reach an agent by kind; `whatsapp` is the numbers. An agent that has no channels simply has no `communicationChannels` key. An agent can answer more than one number: add another entry to the array.

**Omitting a kind is not the same as an empty list.** Sync only treats an agent as authoritative over a kind of channel when the artifact actually declares that key — so an agent file rewritten without `whatsapp` keeps its numbers, rather than an unrelated edit silently unhooking them. To remove a channel, write the list without it; to remove the last one, write an explicit `"whatsapp": []`. The same holds for `email` and `voice`, independently.

## JSON schema

Each entry of `communicationChannels.whatsapp`:

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Channel name, shown in the builder (e.g. \"Field WhatsApp\"). This is its identity — sync matches on it, so renaming an entry that has no channelId creates a second channel and the backend rejects the duplicate number."
    },
    "phoneNumberId": {
      "type": "string",
      "description": "Which business number to answer on. Comes from request_whatsapp_phone_number — NEVER invent, guess, or copy one from another app. FIXED at creation."
    },
    "displayPhoneNumber": {
      "type": "string",
      "description": "The same number in human form (e.g. \"+1 510 851 8633\"), as returned alongside the phoneNumberId. A readable label — phoneNumberId is what binds. FIXED at creation."
    },
    "preAction": {
      "type": "string",
      "description": "App action to run before the agent answers each inbound message, by action artifact `name`. It receives the incoming message context (the sender's number) and its output is passed to the agent to personalize the reply — use it to look the customer up. Must be an action that ALREADY exists in artifacts/actions/; this skill does not create actions. Empty string clears it. Keep it a fast deterministic lookup."
    },
    "language": {
      "type": "string",
      "description": "READ-ONLY. Conversation language code the platform recorded. Never author or change it."
    },
    "sendMessageActionId": {
      "type": "string",
      "description": "READ-ONLY. The channel's hidden send tool ref. Never author or change it."
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
          "description": "Phone numbers in E.164 (\"+14155550100\") or a trailing-* prefix (\"+1415*\"). Empty for \"open\"; at least one for \"allowlist\"."
        }
      }
    },
    "channelId": {
      "type": "string",
      "description": "READ-ONLY identity of an existing channel. Keep it exactly as-is when editing a seeded entry — it is how sync knows to update this channel instead of creating a second one."
    }
  }
}
```

## Protection — who may reach the agent

A channel entry may carry an optional `protection`. Absent means open. Every inbound message is checked before the agent runs; a refused sender is dropped silently, with no reply.

```jsonc
"protection": {
  "mode": "allowlist",   // "open" | "allowlist" | "blocklist"
  "entries": ["+14155550100", "+1415*"]   // phone numbers in E.164, or a trailing-* prefix
}
```

- **Offer it, do not impose it.** Set it only when the user asks, or the request implies a restricted audience ("only our staff should use this line"). Then ask which numbers to allow or block; never guess.
- **It is channel configuration.** Never filter senders in the agent's instructions or system prompt, or in a pre-action; the platform enforces `protection` before the agent runs.
- Both restricting modes refuse a sender whose identity cannot be read (a message with no sender number). An `"allowlist"` needs at least one entry.
- Edit in place: keep `channelId`, write the new `protection`. Clear it with `{ "mode": "open", "entries": [] }`. Omitting it leaves the live setting unchanged.

## Rules

- **The number and the owning agent are fixed at creation.** Sync cannot point an existing channel at a different number or move it to another agent — it reports an error instead of quietly ignoring the change. Changing either means deleting the entry and creating a new one (which asks for the number again).
- **`name` and `preAction` are editable in place.** Keep the entry's `channelId` and write the new value, and sync updates the live channel.
- **`preAction` must name an existing action.** If the user wants a lookup that does not exist yet, create the action artifact first (see `app-artifacts/actions/actions.md`), then reference it. Sync fails the channel loudly on an unknown action rather than creating a broken one.
- **Never invent a `phoneNumberId`.** It only ever comes from `request_whatsapp_phone_number` for a new channel, or from the seeded entry for an existing one.
- **Never rename a seeded entry without keeping its `channelId`** — losing that identity makes sync try to create a second channel on the same number.
- **Removing the entry from the list stops the agent answering that number.** Sync tears the channel down: the inbound trigger is unsubscribed and the agent's send tool is removed. The number stays with the connected account, so this is recoverable — unlike a phone line. Deleting the whole agent file takes its channels down with it.
- **The channel owns its wiring.** The agent's tools entry marked with this channel's `managedByChannelId`, and the workflow/trigger blocks the channel provisioned, are the channel's. Never remove or rewire them, and never re-implement the reply as a workflow send node.
- **Prefer `Edit` over a full rewrite of an agent file.** A rewrite that drops the rest of the entry's fields (`channelId`, `phoneNumberId`, `sendMessageActionId`) loses the channel's identity. `Read` the file and `Edit` the field you mean to change.
- **Sync error "channel … no longer exists (deleted outside the builder)"** means the user removed that channel from the builder UI while its entry stayed behind. Delete the stale entry — only drop its `channelId` instead if the user explicitly wants a brand-new channel.
- **Sync error "WhatsApp channels are not enabled for this account"** means the account lacks the entitlement. Nothing you can fix from here: say so, don't retry, and remove the entry you just wrote so it doesn't retry on the next turn.
- **Sync error "That WhatsApp number is already answered by the … channel on agent …"** means the number is already bound in this app. Two channels on one number cannot coexist — reuse the existing channel, or ask the user for a different number.
- **Sync error "Reconnect WhatsApp and try again"** means the connection is there but its inbound trigger or send action is missing. Ask the user to reconnect WhatsApp in app settings, then retry on the next turn.
- **Sync error "the entry has no phoneNumberId"** means you wrote the entry without asking. Call `request_whatsapp_phone_number` and write the returned id.
- **WhatsApp channels have no frontend binding.** They produce no `product-types.ts` export and nothing to render — a customer uses WhatsApp. If the UI should advertise the number, pass `displayPhoneNumber` to the `frontend` agent as plain copy.
- Whenever the agent needs to read or write app data while handling messages, give the **agent** the relevant table tools — same as for chats.

After any WhatsApp-channel change, run **`pnpm gen:types`**.
