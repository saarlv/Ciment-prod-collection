---
name: agent-tool-approval
description: Making an agent stop and ask a person to approve in the chat before it runs a tool — tool approval, sign-off, confirmation, a check before the agent acts. Load this BEFORE you write an agent file whenever the user asks for approval, confirmation, sign-off or a check before an agent runs a tool, updates, creates or deletes data, places an order, or sends email or notifications ("check with me before you change anything", "make sure I approve every order", "always confirm before emailing a customer"), or wants to turn that off for a tool, or labels what a workflow or code action does to data. Covers `toolEffect` on action artifacts, `askBeforeRunning` and `tools[].approval` on the agent artifact, and the chats where no approval is ever asked. Not for a step the agent card's human loop approves, which is the mini-app's Approve action (`agentic-apps`).
user-invocable: false
---

# Approval before a tool runs (`toolEffect`, `askBeforeRunning`, `tools[].approval`)

The platform can make an agent stop and ask a person in the chat before it runs a tool. Three fields decide it; you never build this chat approval yourself.

The agent file's schema and every other field are in `app-artifacts/agents/agents.md`; the action file's are in `app-artifacts/actions/actions.md`. This skill adds these fields.

## Which tool asks

1. A tool a channel manages (the WhatsApp or email reply, a voice channel's call tool) never asks.
2. Otherwise a tool's `approval` on the agent decides: `"ask"` always asks, `"auto"` never asks.
3. With no `approval`, the agent's `askBeforeRunning` decides, by the tool's `toolEffect`:
   - **`"nothing"`** (or absent): no tool asks. This is the default.
   - **`"destructive"`**: tools labelled destructive ask.
   - **`"all-changes"`**: tools labelled mutation or destructive ask.

A sub-agent follows its own `askBeforeRunning` and `approval`, not the calling agent's.

## `toolEffect` on an action (workflow or code action)

What the action does when an agent calls it:

- **`"read-only"`**: changes nothing (gets, lists, searches, calculates).
- **`"mutation"`**: creates or changes something without permanently removing anything. Updates and sending a message (email, WhatsApp, notification) are mutations.
- **`"destructive"`**: permanently removes something: delete, cancel, revoke.

- Set `toolEffect` on every workflow and code action you create or edit, judged by everything the action does, its worst step wins. When unsure between two labels, pick the more severe one.
- **Keep an existing `toolEffect` as it is** when you rewrite an action, unless you changed what the action does so the label no longer fits.
- No label counts as destructive, so an action without one asks wherever destructive tools ask.

## `askBeforeRunning` on the agent

Set it only when the user asks for approval before an agent acts, or asks to stop it:

- "check with me before it deletes anything" -> `"destructive"`.
- "check with me before it changes anything" -> `"all-changes"`.
- "stop asking" -> `"nothing"`.

Tell the user which tools now ask (the ones whose label fits). Make sure the actions those tools run carry a `toolEffect`.

## `approval` on one tool

`approval` sits on one entry of the agent's `tools` list and overrides the agent setting for that tool:

```json
{
  "name": "OrdersAgent",
  "askBeforeRunning": "destructive",
  "tools": [
    { "actionTypeId": "createOrder", "approval": "ask" },
    { "actionTypeId": "deleteOrder", "approval": "auto" },
    { "actionTypeId": "getOrders" }
  ]
}
```

- **`"ask"`**: always asks, whatever the label.
- **`"auto"`**: never asks.
- **no `approval`**: follows the agent setting.

Write it only when the user names tools ("never ask before sending the daily digest" -> `"auto"` on that tool; "make sure I approve every order" -> `"ask"` on the order tool, unless that step is in the agent card's human loop — then it is the deep dive's Approve, see "When you build a new agent"). To go back to following the agent setting, drop `approval` from the tool.

## Keeping and changing values

- Never set `askBeforeRunning` or `approval` on your own initiative, and never because you labelled an action.
- **Keep `askBeforeRunning` and every `approval` already on the agent exactly as they are when you rewrite its file**: they are seeded from the agent, and the builder may have set them on the agent page. The tools list you write replaces the stored one, so a dropped `approval` turns that tool back to following the agent setting. Change one only when the user asks; that is the exception to the keep-as-is line under "Update & delete" in `app-artifacts/agents/agents.md`.
- Turning approval on or off changes only these fields. Leave the agent's instructions as they are, including any check the agent does in its own words, unless the user asks you to change them.

## Where approval is never asked

- Approval cards need a chat that stays open and keeps its conversation history. No approval is asked, and the tools run without asking, on phone calls, in a one-off AgentCall node, and in chats that keep no conversation history (an agent chat with `isPersistent: false`). Don't promise approval there; say the tools run without it.
- An app whose agent chat was built before approval cards existed can't show them: a tool that asks waits there with no card, and the user's next message rejects it. Before relying on approval in such an app, update its agent chat to the latest version.
- When the agent answers on WhatsApp or email, a waiting approval goes to the contact on that channel (Approve / Reject buttons on WhatsApp, an email asking them to approve or reject) only when the channel's `protection` is an `allowlist` whose entries are all exact numbers or addresses (no `+1415*` prefix, no `@domain`), and the approval is a single call whose details fit in the message. On any other channel the contact never sees it: it is decided from the owner's notification or the agent chat's conversation list (filter by **Waiting for response**). To let the people writing in approve, limit the channel to listed numbers or addresses.

## When you build a new agent

Label every action you write with `toolEffect`. A step the agent card puts in the human loop is a draft plus the mini-app's Approve action (`agentic-apps`, step 4), never tool approval. Otherwise, if the agent-builder discovery (area 6 or any answer) asks for sign-off before the agent itself runs a tool, set `askBeforeRunning` (or `"approval": "ask"` on the named tools) to match: in a chat the card shows there, and in a run a workflow, WhatsApp or email started it waits in the agent chat's conversation list. Don't add either unless the user asked.
