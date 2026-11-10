# "Can Blocks do X?" — capabilities and known limitations

When the answer is "not built in", say so plainly, then offer the closest thing that works.

## What apps can do (all buildable by asking Ella)

- **Pages and UI**: dashboards, forms, tables, kanban boards, calendars and appointment schedulers (drag and drop), charts (line, bar, area, pie, radar, scatter), and file and PDF previews.
- **Data**: built-in database tables, views, file uploads, CSV import/export, and reading Excel or CSV files users upload. Company data via Brain [flag: brain-enabled].
- **Logic**: workflows, schedules, data triggers, integration triggers, webhooks, approvals, and custom code steps.
  - At runtime the app itself can schedule one of its actions to run later or on repeat (for example, a follow-up a user picks a date for), and agents can set reminders for themselves. These are listed in **Settings → Schedules**.
- **AI**: agents with tools and knowledge, AI text, image and video generation, AI web search, and document reading. Phone [flag: agent-voice-channel], WhatsApp [flag: agent-whatsapp-channel] and email channels.
- **Documents**: generated **PDFs** (quotes, invoices, receipts, statements) to preview, download or email. Plus filling PDF forms, merging and parsing PDFs, and e-signatures.
- **Messaging**: email (built-in sender or your own Gmail/Outlook/SMTP) and SMS.
- **Web automation**: code steps that drive a cloud browser to scrape pages or download files.
- **Payments**: taking payments inside the app with your own Stripe account.

## Mobile and devices

- Apps are **responsive web apps**: they work in any modern phone, tablet or desktop browser. Use the Mobile and Tablet preview sizes to check.
- An app can't be published to the App Store or Google Play as an app of its own, and there's no offline mode. Team members can open every workspace app in the **Blocks mobile app** (`navigation/mobile-app.md`); external users use the app's link in their browser.
- People can add the app to their home screen as a shortcut:
  - **iPhone Safari**: Share → **Add to Home Screen**.
  - **Android Chrome**: ⋮ → **Add to Home screen**.
  - **Desktop Chrome/Edge**: ⋮ → **Install page as app**.
- Old browsers such as Internet Explorer aren't supported.
- **Finding apps in the Blocks mobile app**: the **Apps** screen has filter and sort buttons at the top right. **Filters** has the same filters as the web (access, who created it, active or deleted, tags), and the filter icon fills in while any filter is on. To switch accounts, go to **Settings** → **Current account**.
- **Light and dark in the Blocks mobile app**: an app opened in the Blocks mobile app follows the phone's light or dark mode, and switches live when it changes. To force one, use the mobile app's **Settings** → **Appearance** → **System**, **Light** or **Dark**. This replaces any light/dark toggle the app itself has each time it opens. Older apps without a theme always show in light.
- **Tablets and landscape in the Blocks mobile app**: the mobile app also runs on iPad and Android tablets, and turns with the device on phones and tablets alike. On recent iPad versions, the main tabs such as **Apps** and **Settings** sit in a bar at the top of the screen instead of the bottom.
- **Moving around an app in the Blocks mobile app**: the bottom bar switches between the app's pages and agents, and each one comes back on the page you left it on (tap the one you're on to go to its main page). Opening a record stays inside the app: the top-left button is **Back** below a page's main screen and the close button (X) on it, which returns to **Apps**. On iPhone you can also swipe from the left edge to go back; on Android, use the back button. Switching away doesn't keep a page's scroll position or a half-filled form.
- **Links in the Blocks mobile app**: a link to another Blocks app in the workspace opens that app. Email and phone links open the phone's mail or phone app.
  - **Android**: other web links, in an app or in Ella's chat, open in a browser inside the Blocks app; tap the close button to come back. To use the phone's default browser instead, turn off **Settings** → **Open links in Blocks**.
  - **iPhone and iPad**: Blocks pages open in a browser inside the Blocks app (tap **Done** to come back), or in the default browser with **Settings** → **Open links in Blocks** off. Other websites always open in the default browser.

## Code and ownership

- **You own what you build.**
- **Full code download isn't available to regular builders.**
  - **Open code** shows and edits the app's source inside Blocks.
  - **Git Sync** [flag: git-sync] syncs the app's code to your GitHub.
- Apps run on Blocks hosting. Logic steps and data depend on the Blocks platform, so an app can't simply be moved to another host. Data can always be exported as CSV.

## Accounts and apps

- **Transferring an app to another account**: support can copy the build. The data doesn't move with it; export and re-import it.
- **Merging two apps or two accounts**: not possible. Apps can share tables and actions through **Settings → Dependencies**.
- **Selling an app or charging people to use it** through Blocks: not available. Payments inside your app via your own Stripe are fine.

## Known limitations (current)

Not available → closest alternative:

- Importing Excel straight into a table → save as CSV, or have Ella build an Excel upload feature
- Word (.docx) document generation → PDF generation
- A webhook that returns the workflow's result to the caller → the workflow calls the other system back
- Automatic retries of failed workflows → raise **Tries per step** on the action's **General** tab (`building/logic-world.md` → "Retries and pausing on failure"), or ask Ella to add error handling
- Workflows longer than 30 minutes → a long-running action (up to 72 hours, `building/logic-world.md`)
- A single code step longer than 15 minutes, even in a long-running action → split the work into smaller items or runs
- A workflow step whose input is over 10 MB (for example a large file passed as base64): the step fails with **Input too large** and isn't retried → pass the file's link instead of its content, or skip files over about 7 MB
- Ella creating schedules more often than hourly → set the faster schedule yourself in the trigger's **Repeat**
- Running a code step with more access than the user who triggered it → adjust row policies and table access
- Hand-written `robots.txt` or `sitemap.xml`, and `/.well-known/` files → a proxy such as Cloudflare in front of the custom domain; for a public app, **Crawlable Pages** generates `robots.txt` and `sitemap.xml` and handles redirects [flag: app-seo-crawlable-pages] (`app-settings/domain-and-branding.md`)
- Page content in the first response for search engines that don't run JavaScript → per-page titles and descriptions in **Crawlable Pages** [flag: app-seo-crawlable-pages], else app-wide **Search Engine** and **Social Sharing** settings
- Phone numbers outside the US; voice languages beyond English and Hebrew → no alternative
- Agents answering Microsoft 365 shared mailboxes, or mailboxes other than Gmail and Outlook (IMAP) → forward the mail to a Gmail or Outlook inbox the agent answers
- Writing back into Brain company data → store edits in an app table
- Usernames and passwords for login → email login link, Google, or SSO
- Deleting a user (only deactivating) → **Deactivate user** in **Account → Members**
- Deleting a chat → start a **New chat**
- Adding or renaming pages or table columns by hand → ask Ella
