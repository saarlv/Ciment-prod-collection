# AI agents inside apps, and their channels

**Agents are not Ella.** Ella builds the app. Agents are AI assistants that live _inside_ the app and work for its users: a support agent, a lead researcher, an intake assistant.

## What an agent has

Open an agent from **Logic → Agents**.

- **Profile**: a character avatar (or **Upload Image**, under 5 MB), name, job title and **Instructions**.
  - Ella can change these too. Ask her for a man or a woman, or give the agent a name of the other gender ("call her David"), and she switches it to a matching character: photo, intro video, voice and gender all change together, under the new name. Attach an image in the builder chat and ask her to use it as the agent's picture, and she sets it as the agent's photo (the agent keeps its voice, and the intro video is removed).
  - When Ella creates an agent from a name, she picks a fitting character without asking; she asks only when the name could be either a man's or a woman's.
  - **Talk to <name>** opens a test chat (text only), where the agent can edit itself.
  - An agent that edits itself (from that test chat, or from an admin chat) can change only its instructions, which of the app's existing tools it uses, its skills, and its evals. It says so up front when asked for anything else — a new tool, a connected integration, a different model — and points to the app's builder; those changes are made in the builder chat.
  - Before it changes itself, the agent may ask one short question about why you want the change (usually with a few likely reasons to pick from), so it can apply the general rule rather than just the one example. It then says the change in one line before making it.
  - In an admin chat, an admin can just say what was wrong. The agent acts on nothing until it's clear what you want: a clear request is done right away; if you only point out a mistake, it says what it understood and asks whether to fix that case, remember the rule for next time, or both, and asks for missing details when it needs them.
  - Every such change shows a card, **Remember this rule?**, with a one- or two-sentence summary of the change, written by the agent in plain words, and **Reject** / **Approve** under it. **Show details** opens the full change the agent will apply, so the summary can be checked against it. The summary can't be edited on the card: to change what's applied, **Reject** it and tell the agent what you want instead. Nothing changes until it's approved, and the card shows the same summary after a page reload.
  - On **Approve** the change continues in a new **feedback** conversation (listed under **Feedback** in the conversation list, titled with the summary); once approved the card shows the summary and **Open** to the feedback conversation. The original conversation is free to continue. A further approved change inside a feedback conversation runs in place, with no new thread.
  - The approved change is applied in the background: its card in the feedback conversation shows **Running in background** until the change is applied, and the agent reports the outcome there when it's done. You can keep chatting in the feedback conversation meanwhile. Only one such change runs at a time for an app: a second one started while one is running fails, and the agent says nothing was changed. Each run appears in the app's activity log as an **Agent configuration change** entry.
  - A thumb with a comment works the same way, about that reply: **Add comment** sends a normal message about it, answered in the same conversation. A thumb with **Send** and no comment just records the rating.
  - Apps built before this change keep the old **Feedback** button until they are rebuilt.
  - **Open in app** goes to the agent's page, if it has one.
  - **Activity** (the pulse icon beside **<name>'s Job**) opens a window listing the agent's chats, newest first, with what needs a look (**Waiting for input**, failed steps, thumbs down). Columns: **Chat** (its title), **Source**, **Input** (the last thing it was asked), **Output** (the last reply), **Runs**, **Cost** in usage credits, and **Last active**. In a narrow window Input, Output, Source, Runs and Cost give way first, and the last reply shows under the title.
    - Narrow the list with **All**, **Failed steps**, **Waiting for input** or **Thumbs down**, a source (**Chat**, **Message**, **Feedback**, **Configuration**), a tool the agent used, or **Search chat titles**.
    - The list's cost counts the agent's own model calls; a chat's header shows its full cost, helper agents included. Hover any cost to see it in dollars, at the model providers' list prices.
    - Open a chat to read it as **Chat** (the default: each message, a **Worked** line saying how long the agent worked and how many model calls, tools and helper agents it used and how many failed, then its reply) or as **Steps** (each run, **Run 1**, **Run 2**…, with its model calls and tool calls, time, tokens and cost; click one to see what went in and came out, as **Formatted** or **JSON**). Clicking a step in a **Worked** line, or **Steps** under a reply, opens it in **Steps**; **View in chat** goes back.
    - The header shows **Runs**, total **Time**, a **Typical run**'s time, tokens (and how many were cached), cost, and thumbs up and down. A thumb and its comment show on the reply they rate.
    - **Find in this chat** narrows to what mentions the text. Keys: **j** / **k** move through runs or steps, **[** / **]** go to the previous or next chat, **/** jumps to find. **Copy link** copies a link that reopens this chat and view. **Open in app** (when the app has a page for this agent) opens the chat in the app's agent page, at the run picked here.
    - Durations for tool calls made together are shared, a step that waited for an approval or an answer shows no duration, and a chat run from a workflow step shows only its run's total time, not each step's. Very long inputs and outputs are cut short. Chats from before this change show **Input** once they get a new message.
    - On an agent step of a workflow, **Activity** has two tabs: **Threads** (the same chats) and **Events** (that step's runs, filtered by status).
  - Ella can read every conversation an agent has had too, not only chats in the app: WhatsApp and email, messages a workflow sent it, and agent steps of a workflow, including each run's model calls and tool calls. Ask her why the agent did something ("why did Ron say the order wasn't found?", "look at the chats with a thumbs down") or paste a link to the chat, and she finds it and checks what actually happened before suggesting a change. Very long tool inputs and outputs reach her cut short.
- **Skills**: reusable know-how the agent can call on. Apps created after June 2026 only; older apps can switch with **Settings → Features → Force new agent**.
- **Knowledge**: files, folders and web pages the agent can draw on. Indexing for search is [flag: rag].
- **Tools**: app actions and integrations the agent may use. **An agent only knows what its instructions, knowledge and tools give it.** If it invents results, it's probably missing a tool.
  - **Ask before running**: an agent setting with three choices: **Nothing** (default), **Destructive only** ("Asks before Destructive tools") and **All changes** ("Asks before Mutation and Destructive tools"). A tool that asks makes the agent stop and ask for approval in the chat before every run of it. See "Approvals in the chat" below.
  - Every tool has a label for what it does: **Read-only** (changes nothing), **Mutation** (creates or changes something without permanently removing anything; updating a record or sending a message are mutations) or **Destructive** (permanently removes something: delete, cancel, revoke). The tool list is grouped in sections **Destructive**, **Mutation** and **Read-only**, each with a count, and an **Ask** chip marks the tools that will ask under the current setting. A tool with no label counts as Destructive. Table tools and integration actions come labelled; for your own workflows and code actions, see "What this tool does" in `building/logic-world.md`.
  - To change one tool: its **⋯** menu → **When <agent name> uses this tool** → **Follow agent setting** (default), **Always ask** or **Never ask**. The choice overrides the agent setting for that tool only.
  - Tools that a channel manages (like the WhatsApp or email reply) never ask.
  - A sub-agent follows its own settings, not the calling agent's.
  - The tool list of a one-off AI step in a workflow has no approval settings: that step never asks.
  - Ella can set this up too: "check with me before the agent deletes anything", "check with me before the agent changes anything", or "make sure I approve every order" (when approving orders is the agent's job, Ella builds an Approve button on each order's page instead). Ella labels the workflows and code actions she builds, but changes the agent's setting or one tool's choice only when you ask.
- **Communication channels**: **Chat**, plus **Voice** [flag: agent-voice-channel], **WhatsApp** [flag: agent-whatsapp-channel] and **Email**.
- **Sub-agents**: other agents it can hand work to.
- **Evals**: test cases and grading for checking an agent's answers. You can view eval runs; starting one is done from this screen. Every run uses usage credits: the agent answers each test case and a model grades it (`billing/credits.md`).
- **Advanced settings**:
  - **Admins** (first item): which app roles' users are this agent's admins (see "Agent admins" below).
  - **Model**: a family (default **Smart select**). After choosing a family, two more controls appear: **Version** (**Latest - updates automatically**, or a specific one) and **Reasoning effort**. Neither shows under Smart select. See "Models" below.
  - Limits on output length and steps.
  - **Reminders and check-ins**: lets the agent schedule reminders and recurring check-ins for itself (see "Reminders and check-ins" below). Off by default.
  - **Notify people** [flag: notifications-center]: lets the agent send notifications on its own — to the person it's talking with, the app's builders, or everyone in the app (`navigation/notifications.md`). Off by default; never in chats with visitors who aren't signed in.

## Task agents

- A **task agent** is an agent with a job, not a face: only workflows and other agents (as a sub-agent) call it, so nobody chats with it directly. Examples: an "Invoice Extractor", a "Lead Classifier".
- It has a functional name, an icon matching its job instead of a character photo, and a **When to use** sentence where a user-facing agent's job title is. The sentence shows under its name, and an agent that uses it as a sub-agent reads it to decide when to hand it work.
- It has no **Communication channels**, no gender setting and no page of its own in the app. Instructions, tools, skills, knowledge, model, memory, evals and **Talk to <name>** work as for any agent.
- Ella decides by herself whether a new agent is a task agent, and makes one only when no person will ever talk to it; when in doubt she makes a user-facing agent. Agents you create yourself are always user-facing agents, and existing agents stay as they are.
- To switch an agent's kind: **Advanced settings → Agent type** (User-facing agent or Task agent), or ask Ella. An agent with any chat or channel (WhatsApp, email, voice) can't become a task agent until those are disconnected. Becoming a task agent removes its character photo, voice and gender. Turning a task agent back into a user-facing agent keeps its name and icon (until you pick a character) and shows its channels again; when Ella does it, she also gives it a character.

## Reminders and check-ins

With **Advanced settings → Reminders and check-ins** on, an agent can set reminders for itself while it talks with someone: "remind me Friday at 10 to send the report", or a recurring check-in like "every Monday morning, ask me for my weekly numbers".

- By default a reminder fires in the same conversation: the agent picks it back up at that time and writes there. For a standalone recurring job ("every morning, brief me on today's tasks") the agent can instead start a new conversation each time it fires, so one conversation doesn't keep growing; people can ask for either. On WhatsApp or email, a reminder that starts fresh no longer has that conversation, so the agent writes down who to reach when it sets it.
- In an in-app chat, the reminder's message appears the next time the chat is opened or refreshed; the agent's own full-page chat and its floating chat show it right away. The person also gets a notification in their inbox (tuned under **Messages from agents** in notification settings, `navigation/notifications.md`).
- In an in-app chat, a line above the agent's reply says what started it: **Reminder** (or **Scheduled**, for one the app's builders set up) and the reminder's title, with a repeat icon for a recurring one (the time shows when hovering over the reply). It's there whenever the conversation is opened again. An app built before this line existed shows it once its agent chat is updated.
- In the conversation, people can ask the agent what reminders it has set and ask it to cancel one.
- Times follow the person's time zone. A recurring check-in runs at most once an hour.
- A conversation can hold up to 20 reminders at once, and an app up to 500 schedules in all.
- Each time a reminder fires, the agent's turn uses usage credits like any other message (`billing/credits.md`).
- The app's builders see and cancel every reminder in **Settings → Schedules** (`app-settings/settings-sections.md`).
- While the setting is off, the agent can't set reminders and the ones it already set don't fire; a one-time reminder that comes due meanwhile is dropped. Recurring ones pick up again when it's turned back on, unless cancelled in **Settings → Schedules**.

## Agent admins

- On the agent's page, **Advanced settings → Admins** picks the app roles whose users are admins of this agent. Roles are the app's own (see `sharing-and-access/data-permissions.md`).
- **Builders** (people with **Can build** access) and people with **Can manage** are always admins, whatever is selected.
- **No roles selected** (the default) means every signed-in user is an admin. Visitors who aren't signed in never are.
- A selected role that was since renamed or deleted shows as **Role not found**; remove it and pick the current one.
- Admins get the admin experience only in chats that have **Admin chat experience** turned on (the agent's **Chats** section): sending feedback (thumbs under the agent's replies, or just saying what was wrong in the chat) and the admin tools. Everyone else using that chat gets a normal chat with no feedback controls.

## Ways users reach an agent

- An agent's own mini-app in the app's sidebar (signed-in users only): the agent's chat and conversation list, plus a **work board** — every item the agent handles, by stage, with items waiting on a person in red — and an item page where a person approves or corrects the agent's recommended action, or asks the agent about it. Ella builds these two pages for every agent that handles work items.
- An in-app chat on a page (signed-in users only). In any chat in the app, the agent knows the user's time zone (from their browser), so "tomorrow at 9" means 9 where they are.
- After an app's next build, conversations held in its older chat no longer show; the chat opens on the agent's greeting.
- A floating chat panel: a page can offer a button that opens a conversation in a small panel at the corner of the screen, so people keep working on the page while they talk (signed-in users only; a bottom sheet on phones). On a computer the panel can be resized by dragging its edges, and **Open the full conversation** takes it to the full page — for a new chat with nothing sent yet, the agent's new-chat page (in an older app the button shows only once the first message is sent). On a computer, the full conversation page has **Minimize to the floating chat** at the right of its title when there is a page to go back to: the conversation moves into the panel, over the page where **Open the full conversation** was pressed, or else the first page in the agent's list (an older app gets the button with its next build). In an agent's mini-app, picking a conversation from the list while on one of its pages opens it in that panel on a computer; an older app opens the full conversation page instead until its next build. In the panel the agent also knows what the page's address holds — the record it names and its filters — and which records the page is showing (the lists and items it loaded), so "these" or "this one" need no explanation; a page can also share more with the agent, such as what is selected, when the app was built to share it.
- A new chat from the app's sidebar in Blocks: hovering an agent's row shows a chat bubble at its end (in the collapsed sidebar, a round button beside the row's tooltip). Clicking it opens the floating chat panel on a new conversation with that agent. From Logic, Data or Settings the click first lands on the app's home (the design home inside the builder, the view home outside it), then opens the panel. On the agent's own conversation page the bubble puts the cursor in that page's message box instead (an older app opens the panel over that page until its next build). If the app was built before the floating chat existed, the bubble opens the agent's own new-chat page instead, and the floating chat arrives with the app's next build; if the app has the floating chat but does not offer that agent in it, the bubble opens the new-chat page too — ask Ella to add the agent to the floating chat.
- **Conversations are shared across the app by default.** An agent's conversations belong to the agent, not to one chat: every chat with that agent in the app (a page chat, the full chat with a conversation list, the floating panel) shows the same conversations, and everyone who uses the app sees all of them in the conversation list. Signed-in users pick up their own latest conversation when they open a chat; visitors who aren't signed in start a new conversation each time.
  - To show each user only their own conversations, ask Ella to make the agent's conversation list private. This only changes what the list shows; it is not a permission that stops someone from reaching another user's conversation. For apps where users must not see each other's conversations (for example with health information), turn it on and keep the app **Private**.
  - A chat can also be tied to one record (one conversation per order or ticket); ask Ella for that.
- From workflows: a step that sends the agent a message or runs a one-off AI step. AI steps can take a minute or more, so apps shouldn't run them on page load.
  - An agent works on one message at a time per thread. If a workflow's **Send message to agent** step reaches a thread the agent is already working on, the message waits in line and the agent answers it when it's free; the step finishes right away with "The agent is busy, so your message was added to its queue." instead of the answer. WhatsApp and email channels still reply to the contact, because the agent sends its reply itself.
  - [flag: agent-live-turn-stream] The agent's reply keeps going if you refresh the page or close the tab. Reopen the thread to see it, live if the agent is still answering.
  - [flag: agent-live-turn-stream] Replies to a workflow's **Send message to agent** step or to a scheduled reminder stream live into any open chat on that thread. While the agent is answering a message sent from a chat, the send button turns into **Stop**, in any open tab on that thread; stopping keeps the part of the reply already written, marked **Stopped**. Replies to workflow steps and reminders can't be stopped.
  - [flag: agent-live-turn-stream] The agent works on one message at a time per thread, as described above for queued workflow messages.
- Channels (below).

## Files users give an agent

- Users can attach files in an agent chat, and workflows can pass files to an agent step.
- The agent can work with any file type, including spreadsheets (Excel, CSV), PDFs (scanned ones included), Word, PowerPoint, images, JSON, XML, logs and zip archives. It extracts exact values by running code on the file, so large spreadsheets, long PDFs and big logs work too.
- Very large files can be too big to hand over whole. The agent says so and works from a preview.
- Files the agent creates while answering are kept only until that reply ends; they are gone on the next message.
- In an app's agents, the agent can hand back files it made (a report, cleaned data, a chart) as a download link in its reply.
- If an answer from a file looks wrong, ask the agent to check its work against the file. It can count rows and re-read exact values.

## Approvals in the chat

When an agent wants to use a tool that asks (a tool set to **Always ask**, or one the agent's **Ask before running** setting covers), it stops and asks in the chat.

- A card shows the tool's name (for example "Insert items to orders table"), a **Show details** link with every detail the tool will receive, and **Approve** / **Reject**.
- The card's status reads **Waiting for approval**, then **Approved** or **Rejected**. After a decision the card stays in the conversation and can't be changed.
- **Reject** means the tool never ran. The agent is told and carries on without it.
- Several tools at once: one card each. The agent continues once every card has a decision.
- Typing a message instead of deciding: every waiting card is rejected, any question the agent was waiting on is skipped, and the agent answers your message.
- A new message from a workflow's send-message step does the same: waiting approvals are rejected, waiting questions are skipped, and the agent answers the new message.
- On WhatsApp and email, the agent asks the person it's talking with directly (see "Questions and approvals on WhatsApp and email" below), and their reply answers it.

## Questions and approvals on WhatsApp and email

- When the agent needs the contact to answer a question, it pauses and sends the question on the channel, then continues once they answer.
  - WhatsApp: up to 3 short options appear as tappable buttons, up to 10 as a list to choose from; other questions (more options, or "pick several") arrive as text with numbered options.
  - Email: a reply on the same thread, with the options numbered.
  - The contact can tap an option or just type an answer.
- Approvals for tools that ask go to the contact only when **Who can reach this agent** is limited to listed numbers or addresses, every entry a full number or address (not a prefix like +1415… or a whole domain): Approve / Reject buttons on WhatsApp, or an email asking them to approve or reject (a plain-words yes approves; any other reply, such as a no with a reason or a question about it, rejects it and goes to the agent as a message, so it can answer and ask again).
- The contact also never sees an approval for several actions at once, or one whose details are too long to show in full. Anywhere else (open to everyone, everyone except listed ones, or a list with prefixes or domains), the contact never sees approvals: they wait for the person the agent runs for, as in the chat, and a new message from the contact rejects them.
- The person the agent runs for still gets a notification for each pause and can answer it there too; whichever answer comes first counts.
- A channel created before this keeps working as before (questions and approvals wait for the person the agent runs for). A WhatsApp channel turns it on the next time its settings are saved; an email channel once it is removed and added again.
- A conversation nobody is watching (from a workflow, WhatsApp or email) that stops for an approval or a question also notifies the person it runs for, who can **Approve** / **Reject** or answer right from the notification (`navigation/notifications.md`). With **Notify people** on, agents can also send notifications themselves, for example to escalate to the app's builders. [flag: notifications-center]
- To find conversations that are waiting, including ones from WhatsApp or email, filter the agent chat's conversation list by **Waiting for response** (signed-in users only), open the conversation and approve or reject there. While any conversation is waiting, the agent's row on the app's rail shows a red dot (`navigation/builder-layout.md`).
- Reloading or reopening the conversation brings back waiting and decided cards for signed-in users. For a visitor who isn't signed in (a public chat), the cards don't come back after a reload. There is no time limit, and anyone who can open the conversation can decide. The card doesn't show who decided or when.
- No approval is asked on phone calls, in a workflow's one-off AI step, or in chats that don't keep conversation history; there the tools run without asking. Some older app chats can't show approval cards. A tool that asks waits there with no card until the user sends a new message, which rejects it. Updating the app's agent chat to the latest version adds the cards.

## Models

- Apps can use models from Anthropic (Claude), OpenAI (GPT), Google (Gemini), DeepSeek and xAI (Grok).
- **Smart select** (the default; "Blocks picks the model for this agent"): the agent runs an OpenAI GPT model chosen per request. Everyday requests run a fast, low-cost one. When the instructions, conversation and attached files together get very long, that request runs a more capable one instead, and may answer at greater length than the agent's output limit. Smart select runs without extended reasoning; choose a family to control version and reasoning effort.
- In a workflow's AI step, **Model** left on **Smart select** means "use the agent's own model, including a pinned version". Blocks only picks when the agent itself is on Smart select. Choosing a family on the step overrides the agent's choice entirely.
- In the agent's settings, **Max output tokens** caps each reply, the model's reasoning included. Left empty, it's 32,000 for models with a reasoning effort setting and 8,192 for others; a cap that's too low for a long task can end in a cut-off or empty reply. **Recursion limit** caps the steps (each model reply or tool use) in one run. Left empty, it's 300; the highest allowed is 1,000. A run that hits it stops with "I had trouble completing this task — it took too many steps."
- Every AI call uses **usage credits**; bigger models and long prompts cost more, so a very long Smart select request costs more than a short one. See `billing/credits.md`.
- Long documents: a PDF or Word file over 50 pages isn't sent to the model whole. The agent gets the original file, extracts its text, searches it and reads the pages it needs, so it can answer questions about a long report and cite page numbers (the PDF's own page count, which can differ from the numbers printed on the pages). Shorter files are sent whole, so the agent also sees their charts and layout.
- A run that fails with **Input too large** or **File too big** sent more than the model accepts in one request. Shorten the conversation or attachments, trim the knowledge, or choose a family with a larger context window.

## Channels (each behind its own flag; if missing, offer an in-app chat instead)

**Email**: the agent answers a connected **Gmail** or **Outlook** (Microsoft 365) mailbox.

- To add one: the **+** next to **Communication channels** → **Email**, choose **Gmail** or **Outlook** under **Mailbox**, pick the connected account (or **Add Connection**), then **Create email channel**. Ella can also set it up from chat; she asks which mailbox to use.
- It must be a mailbox someone signs in to. Microsoft 365 shared mailboxes (a team address nobody signs in to) aren't supported yet: forward their mail to a regular inbox and connect that one.
- New Outlook mail reaches the agent within seconds; Gmail is checked about every 2 minutes.
- Blocks doesn't create email addresses.
- The agent replies within threads; starting new emails is opt-in.

**WhatsApp** [flag: agent-whatsapp-channel]: the agent answers a WhatsApp Business number you already own (Meta Cloud API).

- Customers can send text, voice notes, images and files (such as PDFs). The agent hears a voice note as its transcription and reads an image or file directly; a caption sent with it becomes the message text. Files over about 7 MB reach the agent without the file. Videos and stickers aren't read.
- The agent's conversation shows a customer's image inline on their message, and any other file as an attachment to open or download.
- A WhatsApp channel created before images and files were supported picks them up the next time its settings are saved.
- Meta's rules apply: free-form replies only within **24 hours** of the customer's last message.
- After that, only templates pre-approved in Meta Business Manager can be sent.

**Phone (Voice)** [flag: agent-voice-channel]: Blocks **buys a real US phone number** for the agent.

- You can choose the area code.
- Removing the channel releases the number permanently.
- Calls are in **English or Hebrew**.
- Outbound calling is opt-in.
- Calls use usage credits.

**Who can reach this agent**: open to everyone, or limited by phone numbers or prefixes, email addresses or domains.

## Saving credits with agents (support's advice)

- Don't use an AI step for arithmetic, sorting or copying data. A code or visual step is cheaper and exact.
- Hourly or daily schedules that run an agent add up quickly. Lower the frequency or use non-AI steps where possible.
- An agent must never have an action that runs itself as one of its own tools; that loops and burns credits.
