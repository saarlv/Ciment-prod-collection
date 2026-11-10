# Chatting with Ella

Open the chat with **Chat** in the top bar (⌘J). It closes with **Close Chat**.

## Planning

On the web there is no mode selector. Ella decides per message whether to answer, build, or plan first,
and plans first for a new app, a big change, real trade-offs, or when discovery material is
attached.

- To get a plan for a request Ella would build straight away, ask in words ("plan this
  first"). There is no plan switch.
- Ella asks her questions as one numbered round on a single card, with her recommended answer preselected for each. Change any you like and press **Continue**.
- **Demo or production** — Ella builds a new app either as a demo (built fast on sample data, with
  a **Demo control** page to reset the data and simulate incoming emails or messages, and nothing
  sent to real customers) or as a production app (the real app, built as usual). She works it out
  from the request ("a demo for Tuesday's meeting", "our team uses it daily") and asks only when it
  isn't clear. Production is the default. The plan states which one she chose, so you can correct
  it, and Ella remembers it for the rest of the app's chats.
- **The plan card** — Ella presents the plan as a card: its title, what it's for, and **What's in
  this plan** to expand the highlights. **Review plan** (**Open plan** once it's settled) opens it
  on the canvas, beside the chat; **Accept** builds it without opening it; **Discard**
  (confirm with **Discard plan**, or **Keep it**) keeps it in history and lets the next message
  build directly. A settled card shows its state (**Accepted**, **Built**, **Discarded**); an
  older revision says **Revised in revision N** and opens at that revision. A
  card from an earlier plan in the same chat says **Replaced by a new plan** and has no buttons.
  While Ella is still writing the plan the card shows **Preparing the plan…**; if presenting fails
  it says **The plan couldn't be presented.** — ask again. For a brand-new app the first plan
  opens by itself.
- **The plan on the canvas** — the plan takes the canvas, where the app's preview or a world's page
  usually is, and the chat stays open beside it. The top bar shows a **Plan** tab after the world
  tabs (no world is selected while it's open). The plan can include diagrams of the data, the page
  flow and each automation; a plan with agents lists each one with its goal, tools, skills, limits
  and the example cases it will be tested on (its evals). Until it's accepted the plan says
  **Proposed · not built yet**.
- **The look, in the plan** — **Pages & UI** opens with the **Design brief**: the app's look as
  Ella researched it from the company's website (or, with no brand of its own, designed for the
  app, informed by leaders in its industry) — the cover (logo or the app's name, direction, why,
  feel) and the **Colors**, **Type** and **Interface** rows, in the brand's own colours and
  fonts; each page below is sketched by its kind (board, calendar, list, chart, form or chat) in
  the same colours, with who uses it in the header. The build follows it, so ask for changes
  before accepting ("warmer", "use our navy", "less generic"); comparing revisions, each side
  shows its own look. When Ella can't read the site, the brief says so and she asks for the
  logo, brand colours and fonts.
- **The plan's side panel** — opens with the plan (not on a phone, where it would cover the plan).
  Click the **Plan** tab to close or reopen it (the tab turns blue while it's open; on hover its
  icon turns into a ☰). At the top, the revision picker (**Revision N**,
  newest first, **Latest** marked) switches revisions; under it, the plan's sections (Understanding,
  Decisions, Data and so on). The section you're reading is highlighted as you scroll, and clicking
  one scrolls to it. From the second revision on, a section that changed has a green count beside it.
- **The bar at the bottom of the plan** — a floating bar:
  - From the second revision on, the plan marks what changed since the previous revision (added
    text highlighted in green, removed text struck through; a section or diagram tagged **New**,
    **Updated** or **Removed**), as a **Single page** or **Side by side** (**Before** next to the
    new revision), picked from the bar's view menu (not on a narrow screen). There's no switch to turn the marks off.
  - The change counter (**0/3** before you start, then **1/3**, **2/3** as you step through) with its up/down arrows
    (**Previous change** / **Next change**) jumps from one change to the next and highlights it.
  - While the plan awaits you: **Change** opens the chat with **Make a change to the plan:** started
    in the message box and the cursor after it — say what to change and send; the next revision
    shows what changed — and **Accept** builds it.
    The chat then shows **You accepted the plan · revision N** as a quiet line rather than a message
    from you (another builder's accept shows **Plan accepted · revision N**). Otherwise the bar says
    where the plan stands (**Built**, **Accepted**, **Closed for a new plan**, **Discarded**,
    **Earlier revision** on an older one, a spinner while Ella revises it).
  - The **…** menu has **Download** (the revision as a Markdown file), **Copy link** (anyone who
    builds the app can open it), **Start a new plan…** and, while the plan is open, **Discard plan…**.
    Each asks first and says what happens: discarding changes nothing in the app, keeps the plan in
    the chat's history, and makes the next message build directly; starting a new plan closes this
    one the same way and makes the next message plan from scratch. Both then return to the chat
    with a note saying so (the bar on a closed plan reads **Discarded** or **Closed for a new plan**).
    On a plan that's already built, the item reads **Plan the next change** and just makes the next
    message plan first.
  - On a narrow screen the bar's labels shrink to icons.
- Typing a question keeps the plan open and just answers it. Typing "ok, build it" accepts it.
- **Leaving the plan** — the **×** on the **Plan** tab, Esc, or clicking any world tab returns to
  where you were. A chat without a plan shows **No plan in this chat yet** with **Plan the next
  change**.
- **Getting back to a plan** — the chat's **More (…) → Plan**, or a plan card in the chat. Plans
  belong to the chat they were made in.
- While a plan is open, nothing in the app changes until it is accepted. Memories Ella writes
  while planning are kept.
- Planning messages cost the minimum builder credits (see `billing/credits.md`).

## Modes (Blocks mobile app)

The mobile app's chat still has a mode picker (`navigation/mobile-app.md`). It's locked while Ella is working.

- **Build** — "The AI changes your app."
- **Plan** — "The AI proposes a plan first." Nothing changes; Ella writes a plan card. Accepting it switches to Build and builds it.
- **Ask** — "Questions and live app data, no changes."
- **Product discovery** — "A discovery interview, then a full plan."

- **Typing "ask" or "plan" in a message doesn't change the mode.** Switch it in the picker.
- Ella may suggest switching with a **Switch to X mode?** card.
- **Plan** and **Ask** messages always cost the minimum builder credits (see `billing/credits.md`).

## Composer

- **Enter** sends and **Shift+Enter** adds a new line (inside a code block, Enter adds a line and **⌘/Ctrl+Enter** sends).
- **@ mentions**: type **@** (or click the **@** button beside **+** under the message box, which types it where the cursor is) to pick one of the app's blocks (pages, components, tables, workflows, agents), one of Ella's memory files, one of the app's user uploads, a team member or an integration; the pick lands in the message as a mention — its name, highlighted (the **@** only opens the menu) — so Ella knows exactly what — or who — you mean, even when a page and a table share a name (a mentioned integration or tool is one Ella is to use for that message). The menu lists everything, loading more as you scroll, and typing narrows it; the tabs at its top — **All**, **Design**, **Logic**, **Data**, **Uploads** (the app's 100 most recent user uploads, refreshed each time the menu opens), **Memories**, **Team**, **Integrations** — show just that part (click one, or press **Tab** / **Shift+Tab**). On the **New app** page only team members and integrations are offered (the app has no blocks yet). Backspace before a mention selects it; Backspace again removes it whole. Type more than one word to narrow (`@task card`, `@don n`). Hover a mention — in the composer, your messages, or Ella's replies, plans and version summaries — for a card with what it is (a block's type and description, a teammate's email, an integration's description); the card's **Open** arrow button goes to a block's page (with the chat still open) or opens an integration's window. Ella mentions blocks, integrations and teammates the same way in her replies and plans; a name she mentions that the app no longer has shows as plain text. Mentioning a team member tells Ella who you mean; it doesn't notify them.
- **/ commands**: type **/** at the start of a line for the composer's own actions — add files, add integrations, chat settings — without leaving the keyboard.
- **Formatting**: the message is light markdown. Type `**bold**`, `*italic*`, `` `code` ``, `- ` or `1. ` for a list, `> ` for a quote, ` ``` ` for a code block — they format as you type; ⌘/Ctrl+B, I and E toggle bold, italic and code, and selecting text shows a small Bold / Italic / Code toolbar. The message shows formatted in the chat, its mentions marked as they were in the composer.
- The **+** menu has three options:
  - **Add files or photos**.
  - **Add integrations**: the integrations store; an integration or tool picked there lands in the message as a mention, the same as one picked with **@**. A link that opens the chat with integrations or tools picked (for example from an integration's page) mentions them the same way.
  - **Select on page**: click an element in the preview to point Ella at it. It lands in the message as a mention, named by its text (or its kind, like "Button"); hover it to see its page and line, and **Open** goes to its code there.
- **Ask in chat…** appears in the "…" menu of pages, workflow nodes, files and page elements (and on a file's line in the code editor). It adds that item to the end of your message as a mention, so Ella knows exactly what you mean; a toast confirms it, or says it's already there.
- **Attachments**:
  - Pick, paste or drag files in: drop them anywhere on the chat, its messages too. Any file type is accepted.
  - **5 MB per file**, with no limit on how many files.
  - **Larger files are skipped without warning**, unless every file is too big. If Ella "didn't see" a file, check its size.
  - Images and PDFs work well as design references.
  - **Previewing a file**: click a file's chip — in the message box before sending, or above a message you sent — to open it on the canvas, beside the chat, like the plan (or pick **Files** in the chat's **More (…)** menu for the chat's first file). The top bar shows a **Files** tab; its side panel lists the chat's files under **Not sent yet** and **Sent** (hover a **Not sent yet** file for its **×**, which takes it out of the message, as the chip's own **×** does; a **Sent** file's **…** menu has **Ask in chat...** and **Download**); the bar at the bottom moves to the previous or next file (or press ← and →), zooms the file (**−** and **+**, or pinch on a trackpad — it grows past the canvas, which then scrolls, or shrinks on it; the percentage between them fits it to the page again) and has **Download**; the header at the top of the canvas gives the file's name, and **Not sent yet** for a file still in the message box; images and PDFs sit straight on the canvas, an image's transparent parts over a light checkerboard, while documents, tables and text show on a page; a file sent while it is open stays open, now as sent; for a file already sent the bar at the bottom also has **Ask about this file in chat**, which adds the file to your message as a mention. Images, PDFs (every page), Word documents (.docx — their text, lists, tables and images, not Word's fonts or page layout), Excel workbooks (.xlsx up to 2 MB — a tab per sheet, laid out as in Excel: right to left for a Hebrew sheet saved that way, its own column widths, long text running on over empty cells; the first 500 rows and 50 columns, formulas by their last saved result), RTF, CSV, Markdown (formatted, with its headings, lists and tables) and text files (notes, JSON, code; Hebrew CSVs saved by Excel show correctly), audio and video show in the preview; other files (PowerPoint, the older .doc and .xls, zip, iPhone HEIC photos, TIFF, video the browser can't play) show **No preview for this file type** with **Download**, a password-protected PDF shows **This file is password-protected**, and a larger workbook **This file is too large to preview**. A link to a file from another chat shows **This file isn't in the open chat**, with **Show this chat's files**. The **×** on the **Files** tab, Esc, or any world tab closes it.
  - What Ella reads: images, PDFs and text files directly; Word (.docx), Excel (.xlsx) and RTF files — and text or CSV files saved in an older Windows encoding, such as a CSV from Hebrew Excel — through a text copy made for her when the message is sent — a document's text, lists and tables (not its images), each sheet's values (the first 2,000 rows and 100 columns). PowerPoint and the older .doc and .xls may not come through fully: save them as PDF (or as .docx / .xlsx) and attach that.
- **Dictation**: the **Dictate** mic button records up to **90 seconds**. Choose **Add to prompt** or **Send**; **Esc** discards. Not available on HIPAA accounts. If the mic is blocked, allow it in the browser's site settings.

## Chats and history

- **Chat picker** — click the chat name above the conversation to switch chats, start a **New chat**, or **Rename chat**. Chats are titled automatically.
- **A new chat starts with no memory of the conversation in other chats.** Ella still sees the whole app and its **Memories**. To keep the thread of a conversation, continue in the same chat.
- After **4 hours idle**, opening the builder starts a fresh chat and offers **Continue "…"** to go back.
- **Legacy chat** is read-only history from before the builder redesign.
- **Chats can't be deleted or archived.**
- **More (…) menu**:
  - The menu is **Chat**, **Plan**, **Files**, **Memories** and **Version history** (see `building/versions-and-publishing.md`). **Files** is the chat's files on the canvas (see "Previewing a file" above), with how many there are; pick it again to close them. **Memories** are notes Ella saves about the app; you can read and edit them, and correct them if Ella "remembered" something wrong. **Plan**, **Files** and **Memories** open on the canvas beside the chat, each with a tab after the world tabs (see "Planning" above and `navigation/builder-layout.md`). **Memories** there shows one memory file at a time, as a document you can edit, with the side panel open beside it (not on a phone) listing the files; search them, or use a file's **…** menu for **Ask in chat...**. Click the **Memories** tab to close or reopen the panel. Edit a file in place; the floating bar at the bottom has the view menu (**Rich text** or **Markdown source**), asks about the file in the chat, and has **Save** (or ⌘/Ctrl+S; it says **No unsaved changes** while there is nothing to save). A file with unsaved changes shows a dot beside its name, in the list too; switching files keeps the edits, and leaving the memories (the tab's **×**, Esc, a world tab) asks first — **Keep editing** or **Discard changes**. While the cursor is in the document, the first Esc leaves the text and the next one leaves the memories. You can also just tell Ella in the chat what to correct. **Version history** is a view of the chat panel (the chat's name becomes a breadcrumb; the back arrow returns to the chat) that lists newest first with a sort switch.
  - **Export chat** — admins only.
- Each chat belongs to Live/Draft, or to one Git branch. Switching branch switches the chat list.

## While Ella works

- The send button turns into **Stop**. A stopped message is marked **Stopped** and isn't charged; a failed one is marked **Run failed** and isn't charged either.
- **Only one Ella turn runs per app at a time.**
  - If another chat or teammate is mid-turn, the composer shows **Working in another chat**.
  - A message sent while Ella is finishing is queued and sends itself.
- **Very large requests can pause partway.** One message has a step limit (higher with **Visual QA** on, and higher again on your own Claude subscription: `building/chat-settings-and-own-key.md`). When Ella reaches it, she stops and ends her reply with "I've reached the step limit for a single message, so I'm pausing here." Nothing is lost: everything built so far is saved, and replying **continue** picks up where she left off. It isn't an error, and the paused message counts like any other message.
- **Closing the tab doesn't stop Ella.** The turn finishes and is saved; only **Stop** cancels it. Reopening shows the progress.
- **Notifications from Ella.** The person who sent the message is notified when Ella finishes, asks a question, needs input (a plan to review, a mode switch, a mailbox, a phone number or integrations to connect), or couldn't finish. A stopped message sends nothing. Each one opens the chat; you can't reply to Ella from the notification. What each one says: `navigation/notifications.md` → **Notifications from Ella**.
  - The phone gets them in the Blocks mobile app with notifications on: **Settings** → **Push notifications** → **Allow notifications**. Tapping one opens that chat with Ella, switching account first if needed.
  - There's no banner while that chat is open in the mobile app. On a computer, a chat you're looking at marks its notifications read as they arrive, which clears their desktop alert.
- **Ella keeps the app's built-in pieces up to date** (agent chat and pages, markdown text, PDF viewer, calendar, file preview, form). A required update (a fix, or something the platform needs) comes first the next time a **Build** message has her working on the app's pages; an optional one when she's changing that piece anyway. She keeps your changes to those pieces and says what she updated in her final message. An update stays applied; to go back, **Restore** an earlier version from **Version history** (`building/versions-and-publishing.md`), and a required update comes back on the next **Build** message. It's part of that message's work; **Plan** and **Ask** messages update nothing.
- Status lines such as "Just a moment, setting things up..." are explained in `building/troubleshooting.md`.

## Getting good results (support's standard advice)

- One change per message, then test it. Big unrelated changes in one message go wrong more often.
- A structure that works well: **Context / Change / Don't touch / Done when**.
- Point at the exact thing using **Select on page** or **Ask in chat…**, rather than describing where it is.
- After switching subject, add "No other changes needed" so Ella doesn't revisit finished work.
- Verify it yourself: click the button, submit the form, wait for the email. Don't rely on "done".
- Connect the integrations Ella asks for when she asks; a build that needs one can't finish without it.
- Very large apps (dozens of tables) are slower and harder for Ella. Splitting into a few apps that share data through **Dependencies** helps.
