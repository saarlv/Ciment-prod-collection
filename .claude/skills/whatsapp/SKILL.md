---
name: whatsapp
description: Building WhatsApp conversation UI — chat views, message history, template pickers, and delivery status indicators. Only use when the app's frontend explicitly displays WhatsApp conversations, message lists, or template management. Do NOT use for apps that only send WhatsApp messages in the background via workflows.
user-invocable: false
---

# WhatsApp UI

Backend workflows own every WhatsApp API call. The frontend reads entities, triggers workflows, and displays results.

The frontend never writes to the Conversations or Messages entities — backend workflows rewrite them as messages are sent and received, so a frontend write is overwritten and desyncs the thread.

## Entities

- **Conversations** — one row per customer: `senderPhone`, `senderName`, `lastMessageAt`, `lastMessageId`, `lastMessageText`, `lastMessageType`, `phoneNumberId`
- **Messages** — per-message history: `messageId`, `senderPhone`, `direction` (inbound/outbound), `type`, `body`, `status`, `timestamp`, `mediaUrl`
- **TemplateStatusUpdates** — status change log: `templateName`, `templateId`, `event`, `category`, `reason`

Read them with `useEntityGetAll` / `useEntityGetOne`; for action results use `useExecuteAction`.

## Templates are configured on the workflow, not in the app

Template names, phone numbers, and variable mappings live on the workflow action node — set either by the backend agent (which can call `WHATSAPP_GET_PHONE_NUMBERS` and `WHATSAPP_GET_MESSAGE_TEMPLATES` to resolve them) or by the user in the node's sidebar. Build in-app template management only if the user insists their end users need it: a list from the "Get Templates" workflow showing `name`, `category`, `language`, status badge, and BODY preview, optionally with a create form and a `TemplateStatusUpdates` feed.

## The 24-hour window

Meta allows `WHATSAPP_SEND_MESSAGE` only within 24h of the customer's last inbound message; `WHATSAPP_SEND_TEMPLATE_MESSAGE` works anytime. The backend rejects violations, so the UI doesn't enforce it — it just adapts. Estimate client-side from `lastMessageAt` (approximate; the backend is the source of truth):

- **Within 24h** — free-form text input, optionally with a "use template" button.
- **Outside 24h, or no prior conversation** — disable the input, explain that the messaging window expired, and show the template picker.

The picker lists every template from the "Get Templates" workflow but only APPROVED ones are selectable; render the rest disabled with their status badge. Show `name`, `category`, `language`, and a BODY preview, then a full preview with parameter inputs for any `{{1}}`, `{{2}}` placeholders on selection.

### Starting a new conversation

With no existing Conversations row, take a phone number and immediately show the chat panel in a local pending state — a synthetic `{ senderPhone: enteredNumber, senderName: '', lastMessageAt: null }` — rather than waiting on the DB. No 24h window is open, so only the template picker is available. After the send, the backend workflow creates the row and it arrives through the SDK's real-time sync with no manual refetch; swap the synthetic object for the real one then.

## Rendering messages

Render by `msg.type`: `text` and `template` are plain `body` text; `image` uses `mediaUrl`; `document`, `audio`, `video`, `location`, `contacts`, `interactive`, `button`, `reaction`, and `sticker` each get a compact stand-in built from `body`. Always keep a default branch — new types appear.

Template messages look like ordinary text because the backend reconstructs the body; an empty `body` on a template message means the workflow has a bug.

`status` on outbound messages progresses `sent` → `delivered` → `read`, or `failed`. Phone numbers are stored bare (`14155551234`) and displayed formatted, alongside `senderName`.
