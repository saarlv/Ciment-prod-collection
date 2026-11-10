---
name: app-voice-channels
description: Giving an app a real phone number that callers dial to talk to an AI agent — a voice line, hotline, or phone IVR. Load this skill when the user asks for phone calls ("customers should be able to call", "give it a phone number", "a voice line / hotline", "the agent should call people back"). Covers the voice-channel schema nested on the agent artifact and the rules that keep one entry from buying a second paid number. NOT for in-app chat with an agent — that is an agent-chat artifact.
user-invocable: false
---

# Voice Channel Artifacts

> A voice channel needs an agent — see the `app-artifacts` skill's [agents](../app-artifacts/agents/agents.md) doc. If this skill is loaded, voice channels are enabled for this app.

A voice channel is a **real phone number** callers dial to talk to an agent. It is stored ON the agent, so define each one as an entry under `communicationChannels.voice` in that agent's file — `artifacts/agents/<Agent>.json`. The file the entry sits in IS the agent that answers. Like an [agent-chat](../app-artifacts/agent-chats/agent-chats.md), the channel is a surface on top of an agent — **instructions, tools, and knowledge live on the agent** — so it carries only the call settings.

**One entry = one purchased phone number.** On sync the platform buys a US number, binds it to the agent, and wires the inbound call workflow. That costs the account money and gives out a number people may publish or save. So create a voice channel **only when the user actually asked for phone calls** — "customers should be able to call", "give it a phone number", "a voice line / hotline / IVR". A request for a chat, an assistant, or "talking to the agent" in the app is an [agent-chat](../app-artifacts/agent-chats/agent-chats.md), not a voice channel. When in doubt, ask rather than provisioning.

## Where it goes

Inside the owning agent's file, under `communicationChannels.voice`:

```jsonc
// artifacts/agents/SupportAgent.json
{
  "name": "SupportAgent",
  "instructions": "Help callers with orders.",
  "communicationChannels": {
    "voice": [
      {
        "name": "Support Line",
        "areaCode": "415",
        "firstMessage": "Thanks for calling Acme.",
      },
    ],
  },
}
```

`communicationChannels` groups the ways to reach an agent by kind; `voice` is the phone lines. An agent that never had a phone line simply has no `communicationChannels` key. An agent can answer more than one number: add another entry to the array.

**Omitting the key is not the same as an empty list.** Sync only treats an agent as authoritative over its channels when the artifact actually says `communicationChannels` — so an agent file rewritten without the key keeps its numbers, rather than an unrelated edit silently releasing them. To remove a channel, write the list without it; to remove the last one, write an explicit `"voice": []`.

## JSON schema

Each entry of `communicationChannels.voice`:

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Channel name, shown in the builder (e.g. \"Support Line\"). This is its identity — sync matches on it, so renaming an entry that has no channelId provisions a second number."
    },
    "areaCode": {
      "type": "string",
      "description": "3-digit US area code to buy the number in (e.g. \"415\"). Omit to take any available US number — omit unless the user named a city/area code. FIXED at creation."
    },
    "firstMessage": {
      "type": "string",
      "description": "Opening line the assistant speaks when the call connects (e.g. \"Thanks for calling Acme, how can I help?\")"
    },
    "language": {
      "type": "string",
      "description": "Call language code — \"en\" or \"he\". Set it when the user's app is not in English."
    },
    "voiceId": {
      "type": "string",
      "description": "Text-to-speech voice id. OMIT IT: the platform picks the right default voice for the language. Only ever keep a value that was already in a seeded file, or one the user chose in the builder UI — voice ids are opaque provider ids and an invented one breaks the call."
    },
    "allowOutboundCalls": {
      "type": "boolean",
      "description": "When true, the agent can also place outbound calls from this number. Default false — set it only when the user wants the agent to call people."
    },
    "preAssistantAction": {
      "type": "string",
      "description": "App action to run before the assistant answers, by action artifact `name`. It receives the call context (e.g. the caller's number) and its output personalizes the conversation — use it to look the caller up. Must be an action that exists in artifacts/actions/. Empty string clears it. MUST BE FAST: the caller is waiting on the line and the whole pre-answer step has a ~6s budget, so this action must be a quick deterministic lookup (read a table, one fast API call). NEVER give it an LLM/AI step, a SendAgentMessage / AgentCall node, or anything that waits on a person — the call blows the budget, falls back to the generic assistant config, and the personalization is silently lost."
    },
    "phoneNumber": {
      "type": "string",
      "description": "READ-ONLY. The provisioned number in E.164 form, written by the platform. Never author or change it."
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
      "description": "READ-ONLY identity of an existing channel. Keep it exactly as-is when editing a seeded entry — it is how sync knows to update this channel instead of buying a second number."
    }
  }
}
```

## Protection — who may reach the agent

A channel entry may carry an optional `protection`. Absent means open. Every inbound call is checked before the agent runs; a refused caller hears one fixed line and the call ends.

```jsonc
"protection": {
  "mode": "allowlist",   // "open" | "allowlist" | "blocklist"
  "entries": ["+14155550100", "+1415*"]   // phone numbers in E.164, or a trailing-* prefix
}
```

- **Offer it, do not impose it.** Set it only when the user asks, or the request implies a restricted audience ("only our staff should use this line"). Then ask which numbers to allow or block; never guess.
- **It is channel configuration.** Never filter senders in the agent's instructions or system prompt, or in a pre-action; the platform enforces `protection` before the agent runs.
- Both restricting modes refuse a sender whose identity cannot be read (withheld caller ID). An `"allowlist"` needs at least one entry.
- Edit in place: keep `channelId`, write the new `protection`. Clear it with `{ "mode": "open", "entries": [] }`. Omitting it leaves the live setting unchanged.

## Rules

- **The owning agent and `areaCode` are fixed at creation.** The channel keeps the number it was provisioned with, so sync cannot move an existing channel to another agent or to another area code — it reports an error instead of silently ignoring the change. Moving a line to a different agent means deleting the entry and creating a new one on that agent, **which yields a different phone number**. Tell the user that before doing it.
- **Everything else is editable in place.** Keep the entry's `name` and write new `firstMessage` / `language` / `voiceId` / `allowOutboundCalls` / `preAssistantAction`, and sync updates the live channel.
- **Never touch `phoneNumber` or `channelId` on a seeded entry**, and never rename a seeded entry without keeping its `channelId` — losing that identity provisions a second paid number.
- **Removing the entry from the list releases the number permanently.** Sync tears the channel down: the number goes back to the carrier and the app cannot get it back. Only remove a voice channel when the user asked for it explicitly. Deleting the whole agent file takes its channels down with it, for the same reason — the agent is gone, so its lines go too.
- **Prefer `Edit` over a full rewrite of an agent file.** Dropping the key no longer releases numbers, but a rewrite that drops the rest of the entry's fields (`channelId`, `phoneNumber`) still loses the channel's identity. `Read` the file and `Edit` the field you mean to change.
- **Sync error "channel … no longer exists (deleted outside the builder)"** means the user removed that channel from the builder UI while its entry stayed behind. Sync refuses to buy a replacement number. Delete the stale entry — only drop its `channelId` instead if the user explicitly wants a brand-new line (and a new number).
- **Sync error "Voice channels are not enabled for this account"** means the account lacks the voice-channel entitlement. Nothing you can fix from here: say so, don't retry, and remove the entry you just wrote so it doesn't retry on the next turn.
- **Voice channels have no frontend binding.** They produce no `product-types.ts` export and nothing to render — a caller uses a phone. If the UI should advertise the line, pass the number from `phoneNumber` to the `frontend` agent as plain copy.
- Whenever the agent needs to read or write app data during a call, give the **agent** the relevant table tools — same as for chats.

After any voice-channel change, run **`pnpm gen:types`**.
