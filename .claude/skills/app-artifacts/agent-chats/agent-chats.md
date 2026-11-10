# Agent Chat Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating an agent-chat. A chat needs an agent — see [agents](../agents/agents.md).

An agent-chat is the chat UI surface that talks to an agent persona. Define each as `artifacts/agent-chats/<Name>.json` — e.g. `SupportChat.json`. **Required for every user-facing agent** — create one per surface (below) alongside the agent artifact and its mini-app, in the same turn. **Instructions and tools live on the agent, not the chat:** create the agent first (see [agents](../agents/agents.md)) with the instructions and tools it needs, then attach a chat to it via `agentId`. The chat artifact carries only welcome copy, first-run prompt, and UI flags. After changes, run **`pnpm gen:types`**.

## JSON schema

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": { "type": "string", "description": "Agent chat name" },
    "agentId": {
      "type": "string",
      "description": "Agent to attach this chat to. PREFER the agent artifact `name` (e.g. \"APOpsAgent\") — it's stable and resolves to that agent's block on sync. A raw block id also works but is fragile (easy to point at the wrong agent). To attach to an EXISTING agent, use its artifact `name` from artifacts/agents/ — do not invent a name. If omitted, the app's sole agent (or, if several exist, the first app agent) is used."
    },
    "initialMessages": {
      "type": "array",
      "description": "Static messages shown when the chat opens",
      "items": {
        "type": "object",
        "required": ["content"],
        "properties": {
          "content": { "type": "string", "description": "Message content" }
        }
      }
    },
    "initialPrompt": {
      "type": "object",
      "description": "Prompt sent to the model on first open",
      "properties": {
        "content": {
          "type": "string",
          "description": "Visible prompt content"
        },
        "hiddenContent": {
          "type": "string",
          "description": "Hidden prompt content (not shown to the user)"
        }
      }
    },
    "isPersistent": {
      "type": "boolean",
      "description": "Whether chat history persists across page reloads"
    },
    "hideToolsUi": {
      "type": "boolean",
      "description": "Whether to hide internal tool activity rows in the chat UI"
    },
    "disableGeneratingDynamicChatComponent": {
      "type": "boolean",
      "description": "Whether to disable the generate_dynamic_chat_component tool"
    },
    "disableAttachments": {
      "type": "boolean",
      "description": "Whether to disable attachments for this chat"
    },
    "isAdmin": {
      "type": "boolean",
      "description": "Whether this chat backs an agent mini-app's layout (AgentLayout), whose conversation index is shared across everyone in the account. Set true ONLY for the layout's own chat block; false for every other surface. Set it explicitly on every agent-chat artifact."
    },
    "allowRunningActions": {
      "type": "boolean",
      "description": "Whether the agent may discover and run the app's own actions and the actions of its connected integrations from this chat. Never set it to true, and never change a value that is already there — a person turns this on from the builder UI, and it is seeded here so it survives. On a new chat write false."
    }
  }
}
```

## Rules

- Whenever the agent needs to read from or write to app tables, give the **agent** the relevant table tools.
- **Attach to an existing agent — don't spawn a new one for a chat.** Check `artifacts/agents/` first (see [agents](../agents/agents.md)) and point `agentId` at the agent that already does this job. Users name agents by persona `title` ("Ron" is the agent whose `title` is "Ron", not a new `RonAssistant`) — resolve that to the existing agent's `name`.
- **"Replace / change the agent behind a chat" means editing this chat's `agentId`** to the target agent's `name`, not deleting the current agent or creating a replacement. Repoint the chat; leave the agents intact.
- **One agent-chat artifact per chat surface** — a block's settings apply to every surface using it. The agent mini-app's layout gets its own block (e.g. `SupportChat.json` → `SupportChatAgentChat`), **lean**: `agentId`, `isPersistent: true`, `"isAdmin": true`, `disableAttachments`/`hideToolsUi` per use case, and **neither `initialMessages` nor `initialPrompt`** — the layout has its own welcome hero and a fresh thread per new chat, so `initialMessages` would replace the hero in every thread and `initialPrompt` would fire on every new chat. Any other surface (a plain chat for people who don't get the layout, a dashboard widget) is its own artifact with its own settings and **`"isAdmin": false`** — welcome in `initialMessages`, a first-run `initialPrompt` is fine there. Never point two surfaces at one block.
- **`isAdmin` marks the layout's block, and only it.** Set it explicitly on every agent-chat artifact you write: `true` on the one block an agent mini-app's `layout.tsx` passes to `<AgentLayout agentChat={…}>`, `false` on every other one. It turns on the admin experience (feedback, the admin tools) for the agent's admins in that chat — right for the people who run the agent, wrong for anyone else. Which conversations a chat shows is not the block's: every chat of an agent shows the same conversations (the `blocks-client` skill → agents.md → Conversations). Getting it wrong on a chat a non-admin reaches is the mistake this flag exists to make visible.
  `isAdmin` marks the CHAT; who among its users gets the admin experience (feedback, the admin tools) is the **agent's** `adminRoles` — see [agents](../agents/agents.md).

- **`allowRunningActions`: never grant it, never revoke it.** With it on, the agent gets generic tools to list, describe and run any of the app's own actions and any action of its connected integrations, instead of needing each one wired onto the agent as a tool. That is a capability a person grants deliberately, in the builder UI (the agent's Chats section), on a chat that is already `"isAdmin": true`. **You never set it to `true`**, even when asked directly in chat — if the user wants it, tell them it is a checkbox on the chat in the builder. Equally, **never change a value that is already in the artifact**: it is seeded from the live chat, so a `true` you find there is a person's decision and rewriting it to `false` would silently undo them. Write `false` only on a chat you are creating from scratch. It would not cover table CRUD in any case: table access is granted by giving the **agent** the table tools, which remains how you give an agent what it needs.

After any agent-chat change, run **`pnpm gen:types`**.
