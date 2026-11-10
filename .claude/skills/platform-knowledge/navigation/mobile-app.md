# Blocks mobile app

The Blocks mobile app runs on iPhone, iPad, and Android phones and tablets. Team members use it to open the workspace's apps, chat with Ella to change them, get notifications and manage their workspace from their phone. It's called **Blocks** on the phone. It's free to download, and nothing is sold in it.

External users (customers, vendors and other app users) don't sign in to it. They open the app's own link in their phone's browser (see `app-capabilities/capabilities-and-limits.md`).

## Getting it

- **iPhone and iPad**: search **Blocks** in the App Store.
- **Android**: search **Blocks** in Google Play.
- Sign in with the same login as on the web. Your apps, workspaces and settings are the same in both places.

## Signing in

- **Continue with Google** goes straight to Google's sign-in in a secure sheet inside the app, then back into the app.
- **Continue with email** opens the Blocks login page in that sheet. Enter your email, tap **Send login link**, and open the email **on the same phone**. The link takes you back into the app. Single sign-on (work email) starts here too.
- If you opened the email on a computer, that computer gets signed in, not the phone. Request a new link from the phone.
- **Continue with Apple** (iPhone and iPad only): the button on the login screen.
  - With your real email, it signs you in to the Blocks login that uses that email.
  - With **Hide My Email**, Apple gives Blocks a private relay address. That becomes a separate, new Blocks login with its own workspace. To reach an existing workspace, sign in with the email that workspace knows, or ask an admin to invite the relay address.
  - Signing in with Apple isn't on the web or Android. On the web, log in with the same email address.
- Two-factor authentication works in the app: after the login page, the app asks for the code.
- **Company single sign-on (SSO) isn't supported in the mobile app yet.** People whose company requires SSO use Blocks on the web.
- The app stays signed in. **Settings** → **Log out** signs out. **Settings** → **Current account** switches workspaces.

## What you can do in the app

- **Apps** tab (the grid icon at the bottom): the workspace's apps as cards. **Jump back in** shows recently opened apps, then **Favorites** and **Solutions** (swipe sideways, **See all** for the full grid), then **All apps**. Search, **Filter** and sort are in the search field at the top, which stays at the top as you scroll. Tap an app to open it. Its pages and agents are in the bottom bar (see `app-capabilities/capabilities-and-limits.md`).
- **Learn** tab [flag: academy] (the graduation cap): the Blocks Academy on the phone, with the same lessons and progress as on the web (see `navigation/academy.md`). If there's no **Learn** tab after **Apps**, the Academy isn't enabled for this account yet.
- **Chat with Ella**: long-press an app (or tap ⋯ inside it), then tap **Build with AI** at the top of the menu. The blue **+** at the top right of the **Apps** tab starts a new app: describe it, choose **Build** or **Plan**, and send. Attach photos and files, or dictate with the mic. Some steps still hand off to the web, such as connecting integrations: tap **Continue on web**.
- **Building an app** has a bar at the bottom like the web builder's worlds: **Chat** (Ella), **Design**, **Logic**, **Data** and **Settings**. The ✕ at the top left closes the builder from any of them; the app's icon at the top right opens the app.
  - **Design** lists the app's pages (with their web address), **Dynamic pages** (pages that open from a list, like a record's page) and **Chat components**. Tap a page to open the app on it; touch and hold one for **Change with AI**.
  - **Settings** lists the app's settings in the web's order, each on the phone: **General**, **Solution** (solutions only), **App permissions**, **Distribution**, **Members**, **Integrations**, **Dependencies**, **Customization**, **Git Sync** [flag: git-sync] and **Developer settings**, plus **Activity** (what happened in the app; tap a row to see its details — why a run failed, its input and output, a row's fields or what changed). See `app-settings/settings-sections.md` for what each one changes on the phone.
  - **Logic** lists the app's workflows (with what starts each one and how its last run went), agents, tools, shared code and **Triggers**. **+** makes a **New action** (or a code action) or a **New agent**. Tap one to see its steps from top to bottom: decisions nest their branches (**If yes** / **Otherwise**, or each case), and steps that run at the same time are grouped.
    - Edit the flow by hand: **Add a step** (an agent, an action, a condition or a merge), and tap a step for its **Inputs**, connection, **Repeat for each item** and **Tries** (a condition's cases, a merge's mappings), **Add a step after**, **Next** (insert a step on a connection, remove it, **Connect to a step**) or **Delete step**. Under **Starts**, **Add a trigger** picks a schedule, a webhook, a table event or an integration's event; tap a trigger to change its settings (a schedule as **Every weekday** at a time and time zone, a webhook's address with **Copy** and **Regenerate**) or delete it.
    - **⋯** has **Settings** (name, description, icon, the step whose result it returns, who can run it, and for step-built actions tries, what happens when a step fails and **Long-running**), **Compile app** and **Delete…** (which asks Ella to remove it and everything that uses it). A code action's **Code** → **Edit** opens the code, its files and tests; its **Settings** add packages, secrets and memory.
    - **Test run** runs it for real (a workflow without inputs asks to confirm first) and the steps light up as the run reaches them; the bar at the bottom shows progress, then **Result** or **Fix with AI**. The test form can **Save as default**. Under **Runs**, each bar is a past run (color: how it ended, height: how long it took); tap one to replay it on the steps, or **See all** for the full history with **All** / **Success** / **Failed** / **Running**, each run's input and result, **Rerun** and **Load older runs**.
  - **Agents** (in **Logic**): tap an agent to edit it like on the web. Tap its photo to pick a character or **Upload a photo**; **Name**, **Job title** and **Instructions** (**Edit**) open an editor. Below: **Skills** (apps created after June 2026, or with **Force new agent**), **Knowledge** (files, folders and links; upload files from the phone), **Tools** (**+** picks the app's actions and agents, table actions and integrations; tap a tool to set fixed inputs or remove it), **Communication channels** (chat channels, plus **Voice** [flag: agent-voice-channel], **WhatsApp** [flag: agent-whatsapp-channel] and **Email**), **Sub-agents**, **Evals** and **Advanced settings** (admins, gender, memory, model and version, reasoning, recursion limit, max output tokens). Talking to the agent to test it is on the web.
  - **Data** lists the app's tables with how many records each has. A table opens as a spreadsheet (**Grid**) or a **List** (switch at the top left of the toolbar). The record's name stays on the left while the other fields scroll sideways.
    - Search with the bar at the top; **Filter** adds conditions per field (for example **Status is any of Paid**, **Amount is at least 500**), shown as chips you can remove; the status chips are quick filters. Sort from the toolbar or by tapping a field's name (**Sort A → Z**, **1 → 9**, **oldest first** and so on, **Filter by this field**, **Hide field**, **Field settings**). **Fields** shows or hides fields, with the **Built-in** ones (**Created at**, **Created by**, **Updated at**, **Updated by**) listed apart. The phone remembers each table's view.
    - Big tables work the same: search, filters, sorting and counts run on the server, and records load as you scroll.
    - Edit in the grid: tap a checkbox to toggle it, tap a field with set values to pick one, tap any other field to edit it. Typed values are read as on the web (`1,234.50`, `50%`, `31/01/2026`, `2:30 pm`). Touch and hold a cell for **Copy**, **Edit** that field, **Open record**, **Open** the linked record, **Only** that value, **Duplicate record**, **Select** or **Delete record**.
    - **+** opens **New record**; required fields are marked with a red **\*** and **Add** waits until they're filled. **⋯** has **Select records** (then **Export** or **Delete** several at once), **Import CSV** (match the file's columns to the table's), **Export CSV** (only the records shown when a search or filter is on), **Download CSV template**, **Table settings** (name, display column, unique key, duplicates, copying data when the app is duplicated, access) and **Change with AI**. Views are read-only; **View settings** edits a view's name and query.
    - Tap a record's name to open it: linked records open with a tap, emails, phone numbers and websites act on tap, and the records of other tables that point at it are listed underneath. **Edit** edits it in place (**Save** in the top corner once something changed, **Done** otherwise), with **Delete record** at the bottom. **⋯** beside **Edit** has **Copy record ID**, **Duplicate record** (opens the copy) and **Delete record**. Computed fields are read-only.
    - **Company data**, **Saved queries** and **Search indexes** [flag: brain-enabled] are listed as on the web: a company table shows its sync state, a preview, **Sync now**, its recent syncs and its schedule; **+** adds company data, **⋯** has **Fetch data…** and the **dbt project** (edit, **Check** and **Deploy** saved queries). Connecting a data source is on the web.
  - **Change with AI** (the sparkles button) asks Ella to make a change in the chat, from any workflow, step, agent or table. A failed test run has **Fix with AI**.
- **Notifications** tab (the bell, in the middle of the bottom bar, with the unread count) and phone notifications: see `navigation/notifications.md`.
- **App settings** on the phone: long-press an app (or tap ⋯ inside it) → **Settings**. Builders land on the builder's **Settings** tab; people who don't build the app get **Members** (admins of an account that installed it) and **Integrations**. See `app-settings/settings-sections.md`.
- **Workspace and profile**: **Settings** has your profile, members and invitations, integrations, two-factor authentication, appearance, push notifications and **Open links in Blocks**.
- **Sessions** [flag: session-management]: **Settings** → **Where you're signed in** lists your sessions (this phone first) and signs out one or all the others. Account admins also get **Settings** → **Member sessions**: every member's sessions with **All** / **Active now** / **Flagged**, sign-out per session, per member (**Sign out all**) or **Sign out everyone**, and **Idle timeout**. See `account/account-admin.md`.
- **App lock**: **Settings** → **App lock** asks for Face ID or Touch ID (on Android, your fingerprint or face unlock) each time Blocks opens.
- **Shortcuts**: press and hold the Blocks icon on the home screen for **New app**, your recent apps and **Search apps**.
- **Links**: links to Blocks apps open in the app when it's installed.

## What stays on the web

- **Plans and billing**: **Settings** → **Billing** (account admins) shows the plan, the included credits and usage only. Running out in the chat shows "You're out of builder credits" and when they renew, with no button. Plans, payment details and invoices can't be changed in the mobile app. An account admin manages them on the web (see `billing/subscription-management.md`). When the user is in the mobile app, don't tell them to buy or upgrade there.
- Creating a solution, row and column data policies, turning multi-tenancy on, and connecting some integrations (see `app-settings/settings-sections.md`). On the phone, policies and multi-tenancy go through **Change with AI**.
- In the builder: talking to an agent to test it, connecting a data source for company data, the flow canvas (on the phone a flow is edited as its list of steps), and the app's knowledge base and user uploads pages in **Data** (an agent's **Knowledge** can still pick and upload files).

## Deleting your account

- **Account admins**: **Settings** → **Delete account**, type the account's name, then **Delete account**. This closes the whole account (workspace) for everyone in it, the same as on the web (see `account/account-admin.md` for what happens).
  - Everything keeps working for 30 days. After that the account is closed: every member and app user loses access, and people who aren't in another Blocks account have their personal data erased.
  - Until then, any admin can tap **Cancel deletion** on the same screen, or cancel it on the web.
  - An account with an active subscription can't be deleted until the subscription is cancelled on the web.
  - If it's your only Blocks account, you're logged out.
- **Members**: only an admin can delete the account. To delete just your own login and personal data (name, email, phone and photo), tap **Email support** on the same screen and send it from the address you log in with. Support confirms by email when it's done.

## Reporting content

- **Report** a reply from Ella: tap the flag under the finished reply.
- **Report** an app: tap ⋯ inside the app (or long-press it on the **Apps** tab), then **Report** at the bottom of the menu.
- Pick a reason, add details if you like, and tap **Send**. The report goes to the Blocks support team, who review every report and may reply to you by email. Reports don't go to the app's builder.

## Privacy and help

- **Settings** → **About** has **Privacy policy**, **Terms of service** and **Help & support** (the Blocks Help Center).
- The first time you open the chat with Ella or start a new app, **AI data use** explains what is sent (messages, including dictation turned into text on the phone, attached photos and files, and the app you're working on) and that Anthropic, OpenAI and Google process it. **Continue** agrees, on that phone. After **Not now** the chat is off until you tap **Review AI data use** and continue.
