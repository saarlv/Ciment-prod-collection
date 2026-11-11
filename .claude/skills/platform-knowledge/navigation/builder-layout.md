# Builder layout (inside an app)

## Builder rail (left)

- **Account row** (top) — the account's logo and name, or the solution's (`building/solutions.md`). Clicking it opens **Back to my apps**, **New app**, **Brain** [flag: brain-enabled], **Integrations** and **Search** (⌘K). Inside an app there's no **My apps** row, so this menu is the way to those pages. Collapsing and opening the rail work as outside an app, and so does the **Language**: in Hebrew or Arabic [flag: platform-language] the whole builder is mirrored, the rail on the right, then the chat, the side panel and the canvas on the left (`navigation/platform-layout.md` → Language).
- **Builder** (hammer icon, ⌘B) switches between building the app and using it like an end user would.
  - People without build access see **Settings** here instead, which covers the app's integrations, and members for people with **Can manage** and admins of an installed app.
- **Content list** — the app's agents first, then its pages ("mini-apps"). An app without separate sections shows a single **Home page** row.
  - A mini-app can be meant for some app roles only (ask Ella). People see only the rows meant for everyone or for one of their roles, and the app opens on the first of those. Someone whose roles have no mini-app at all gets a **404 Not Found** page instead of the app.
  - Builders see the rows of the role shown in **View as role** (their own role until they pick another), so the list matches what the app shows for that role; pick a different role there to see its list. A builder with no role sees every row.
  - Hiding a row isn't access control: someone with the link can still open the page, and the app's own screens decide what they're shown there. Protect data with data permissions (`sharing-and-access/data-permissions.md`).
  - Each agent's avatar carries a small status mark, updated live from its conversations: a **red dot** when a conversation is waiting for a person's answer (an approval or a question), a **blue spinner** while the agent is working, a **red ring** when a conversation ended with an error, and the usual green dot otherwise. Waiting outranks working, and working outranks an old error. The mark is the only place the status shows: hovering the row in the collapsed rail shows just the agent's job title and name (and, in a solution, its app's name). To act on it, open the agent and filter its conversations (`app-capabilities/agents-and-channels.md`).
- **Footer**, in order:
  1. **View app as** — switch which account you're viewing as. Only on installed or distributed apps. You can only switch to an account you're a member of; the others are greyed out with "Not a member". An account whose invite you haven't accepted yet shows "Invite pending": picking it says to open the link in the invitation email, or, if it expired, to ask an admin of that account to resend it. If a switch is refused, you stay where you are and see "You're not a member of <account>. Ask an admin of that account to add you.".
  2. **Integrations** — the integrations icon with a dot. Shown only while the app has integrations still waiting to be connected; it opens **Connect your account(s)**.
  3. **Share** — the sharing and publishing dialog (`sharing-and-access/share-dialog.md`). Builders only.
     Support is not a rail row: it is in the avatar menu (`navigation/platform-layout.md`).
  4. **Notifications** — a bell with this app's unread notifications, right above your avatar (the same spot as on the platform pages) [flag: notifications-center]; see `navigation/notifications.md`.

## Top bar

- **Chat** (⌘J) — opens Ella. It shows a spinner while Ella works and a check mark when she's done.
- **World tabs**: **Design · Logic · Data · Settings**.
  - Shortcuts: ⌥⌘1–4 on Mac, Alt+1–4 on Windows.
  - Clicking the current tab opens or closes its side panel; on hover its icon turns into a ☰ to say so.
- **Plan** or **Memories** tab — after the world tabs, while the chat's plan or Ella's memories are open on the canvas (from the chat's **More (…)** menu); no world tab is selected then. Their side panel opens with them (not on a phone); clicking the tab closes or reopens it (blue while open; ☰ on hover). Its **×**, Esc, or any world tab closes it. See `building/chat-with-ella.md`.
- **Files** tab — after the world tabs, while a file attached in the chat is open on the canvas (from its chip in the chat). Its side panel lists the chat's files; it closes the same way as the **Plan** tab. See `building/chat-with-ella.md`.
- **HIPAA Settings** — a red pill, on HIPAA accounts only.
- **Activity log** (pulse icon, ⌘U) on the right, beside the version switcher — a dot means there's unread activity. See below.
- **Version switcher** on the right — **Live**, **Draft**, or a branch name. See `building/versions-and-publishing.md`.

There is no separate Code tab: code opens from **Open code** on the canvas. Memories are opened from the chat's **More (…)** menu, not from the world tabs.

## Resizing the chat and the side panel

- The chat and a world's side panel open beside the canvas. Drag a panel's right edge to make it wider or narrower (within limits); drag it past about half its narrowest width to close it. Each panel keeps the width you leave it at.
- While building, the canvas's left edge also works the side panel: click it to open or close the panel, or drag it to pull the panel out to the width you want.
- When using the app (not building), only the left rail resizes. On mobile, the chat and the side panel take the whole screen and don't resize.

## Canvas toolbar (floating, bottom of the preview)

- **View as role** — preview the app as one of its roles, including which content-list rows that role sees. Shown only if the app has roles.
- **Edit theme** — preset, colors, fonts, radius and shadow. See `building/design-world.md`.
- **Edit the page directly** — click any element to change its text, colors or spacing by hand, then **Save**.
- **Open code**.
- **Desktop / Tablet / Mobile** preview sizes. Tablet is 768×1024 and Mobile is 390×844, and both have **Rotate**.
- **Preview theme** — **Light**, **Dark** or **Match platform**. It only changes the preview, never the app. It also decides which mode's colors the Theme panel edits; the panel's **Colors** line has the same switch.

The preview has **no refresh button, address bar or "open in new tab"**. To open the real app in its own tab, go to **Share → Publish → Open link**.

## Settings tab sections

**General**, **App permissions**, **Distribution**, **Members**, **Integrations**, **Features**, **Dependencies**, **Customization**, plus **Git Sync** [flag: git-sync] and **Developer settings**.

There's no gear icon any more: Settings is the fourth world tab. Details are in `app-settings/settings-sections.md`.

## Activity log

Open it with the **Activity log** button at the top right, beside the version switcher (⌘U). It's in the builder's top bar, so it's there while you build (⌘B), for people with build access; outside the builder it isn't shown and ⌘U does nothing.

- Filters: **All**, **Builder**, **Logic** and **Data**, plus **Search activity…**.
  - **Data**: rows inserted, updated or deleted in tables.
  - **Logic**: actions and workflows started, completed or failed, with their inputs and **Output**. A code action's entry also has **Logs**: what the run printed (its last ~32 KB), on a successful run and a failed one. Ella reads the same logs when you ask why an action failed. A code action starts keeping logs once it's next changed and deployed; a run that timed out has none.
  - **Builder**: changes Ella made, grouped per build as "Builder changes (N)".
- Each entry has **Open in builder**.
- [flag: data-revert] Data changes can be undone:
  - A change to many rows at once (an import, a bulk update or delete, a change Ella or an agent made) is one entry, such as "1,200 rows updated in Orders".
  - Hover a Data entry and click **Revert this change** (the undo arrow). A dialog says how many rows go back and which stay as they are, and why: rows changed again later, rows whose unique value another row now has, or rows that no longer exist. **Revert N rows** confirms.
  - Reverting a change that created rows deletes them; reverting a delete brings the rows back; reverting an update puts the earlier values back.
  - The revert shows as its own entry ("Reverted a change to …"), and the original entry is marked **Reverted**. Reverting the revert redoes the change.
  - Only for changes to the live app's data made after the feature was switched on (earlier versions are kept with no time limit). Draft changes, **delete all rows**, and very large changes (tens of thousands of rows) can't be reverted. Reverting doesn't run the app's data triggers.
  - A record's own changes are also listed under **View history** in the record panel (`building/data-world.md`).
  - A whole table can also be seen as it was at an earlier time, and put back to it, from the data editor's **See this table at an earlier time** button (`building/data-world.md`). That restore shows here as "Restored Orders to Nov 3, 2026, 10:00 AM (N rows)", and reverting it undoes the restore.
- Recovering deleted records: filter **Data** and search "delete" to see what was removed, then re-enter it. There's no automatic data undo, unless the revert above is available [flag: data-revert].
