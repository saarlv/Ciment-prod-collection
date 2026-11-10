# App Settings sections

**Settings** is the fourth world tab in the top bar. People who can't build the app only see **Integrations** (plus **Members** for people with **Can manage** and admins of an installed app, and **General** for admins of the account that owns the app).

## General

- **Status**: "This app is published and available to users" (Public) or "This app is private".
- **App Information**:
  - **App Name** (rename the app here)
  - **App Slug**
  - **Description**
  - **App's Favicon**
  - **Detailed Description**
  - **Cover Image**
- **Tags**: organize apps in **My apps**.
- **App roles**: the roles Ella defined, and the **Default role** picker. Change roles by asking Ella.
- **Duplicate App**: "Create a copy of this app with all its components and settings".
  - Whether table data is copied is set per table (**Copy data on app duplicate** in the table's settings).
  - The copy is not connected to the original's GitHub repo; set up Git sync on it separately if needed.
- **Delete App**: "Removes this app from your account and hides it from everyone who uses it. You can restore it anytime." A deleted app shows **Restore app**. Only builders and admins of the account that owns the app see Delete and Restore; people with **Can manage** don't.

There's **no "transfer app to another account"** button. Support can copy an app's build into another account; the data is not moved, so export and re-import it. Inviting the other person as a builder is often simpler.

## In the Blocks mobile app

Long-press an app (or tap ⋯ inside it) → **Settings**, or the **Settings** tab while building. Builders get the same sections as the web, in the same order, each on the phone. People who don't build the app get **Integrations** (their own connection), **Members** (people with **Can manage** and admins of an account that installed it) and **General** (admins of the account that owns the app: its details, **Duplicate**, **Delete** and **Restore**).

- **General**:
  - **Cover image** and **App icon**: tap the cover or the icon to pick a photo, or remove it.
  - **Who can open it** opens **App permissions**.
  - **App name** and **Description** (plus **Detailed description** for integration and tool apps): edit, then **Save** at the top (**Cancel** throws the edits away).
  - **App URL**: lowercase letters, numbers and dashes, 3–60 characters; it says whether the address is free.
  - **Tags**: tick tags on or off, or type a new tag and tap **Add**.
  - **App roles**: the **Default role** new users get; the roles themselves change through the chat.
  - **Duplicate app** and **Delete app** (a deleted app shows **Restore app**).
- **App permissions**:
  - **Who can open it** (Private / Public and their options, as in **Share**) and the app link.
  - **Landing page**.
  - **Data permissions**: tap a table to choose who can see and submit its rows; its row and column policies show there. Policies, and turning multi-tenancy on or changing the tenant table, go through **Change with AI**.
- **Distribution**:
  - **Distribution type** [flag: distributed-apps], with the install or copy link.
  - **Public app details**: name, description, cover, favicon, builder name and avatar, and screenshots (videos are added on the web).
  - **Submit for review** to the marketplace.
- **Members**: invite people, general access, and each person's access and role.
- **Integrations**: the app's integrations; pick or add the connection, **Connection type**, **Optional**, rename, **Remove from app** (the chat then removes what used it), and **Add integration**. Connecting a new account opens the provider's sign-in page; Blocks' own sign-ins (such as Google or Slack), Plaid and Pipedream connect on the web, already signed in.
- **Dependencies**: actions (and tables) from your other apps, per app.
- **Customization**: **Domains** (the app URL and a custom domain: connect, DNS records, **Check again**, **Add www**, **Remove**), **Email branding** with **SMTP connection** and **Send test email**, **Search engine**, **Social sharing**.
- **Git Sync** [flag: git-sync] and **Developer settings** (app API keys and dashboard links).
- **State**: the app's whole definition, as on the web (see **State** below).
- **Solution** (solutions only): its apps and their order, the rail and the white label.

If the app has an open draft, changes to the name, description, images, default role, landing page, integrations, dependencies and table access are saved to the draft and go live when the draft is made live. The App URL, tags, email branding, the builder details, screenshots and the marketplace listing can't be changed while a draft is open: make the draft live or discard it first. Search engine, Social sharing, Who can open it, Distribution type and the solution apply right away.

## App permissions

- **External link**: the same Private/Public choice as **Share → Publish** (`sharing-and-access/share-dialog.md`).
- **Public URL**: visitors land on the app's home page, so ask Ella to change what it shows.
- **Data Permissions**: table access, row and column policies, multi-tenancy (`sharing-and-access/data-permissions.md`).

## Members

"Members, permissions & roles". This is the app's user list, with **Invite members**, search, an **External** badge, and each person's **Edit access** / **Remove access**. Someone who hasn't accepted their invite yet shows **Invited**, and their menu adds **Resend invitation** for whoever can edit them (only an account admin can resend an account admin's invite).

In a solution, **Settings → Members** is "Solution members": everyone across the solution's apps, with **Invite to solution** and **Manage** per person (`building/solutions.md` → Members of a solution).

## Integrations

"App integrations", with **Add integration**. Per integration:

- **Connection**: pick a connected account, or **Add connection**.
- **Connection type**:
  - **Share with all app users**: "Everyone uses your account connection".
  - **Just for me**: "Each user needs their own account connection".
- **Optional**: app users aren't forced to connect it.
- "…" menu: **Manage connections**, **Remove from app**.
- **Save changes**.

See `integrations/integrations.md`.

## Features

**Enable app features**:

- **Code actions** (custom code steps)
- **Data views**
- **No code actions** (visual workflow steps)
- **Force new agent**: switches an older app (created before June 2026) to the current Ella and agent features

The account-wide defaults for new apps are in **Account → App settings**.

## Dependencies

Use tables and actions from your other apps in this one. This is how two apps share data. Apps can't be merged, and two-way editing across apps is limited.

## Schedules

The reminders and recurring runs the app and its agents set for themselves while people use the app — an agent's reminders and check-ins (`app-capabilities/agents-and-channels.md`), and actions the app schedules to run later or on repeat. These are not the schedules you set on a workflow's trigger in Logic; those stay on the trigger.

- Each row shows the schedule's name, whether the **App** or an **Agent** set it, how often it runs (**Once** or its repeat), its next run, and what it runs.
- **Pause** stops it from running until **Resume**. **Cancel** removes it for good; only the app or the agent can set it again.
- A one-time schedule disappears from the list after it runs.
- Builders of the app see this section. It lists the schedules of the version being viewed (live or the draft).
- Limits: at most once an hour for anything that repeats, up to 500 schedules per app, and up to 20 reminders per conversation.

## Customization

**Domains**, **Email Branding**, **Search Engine** and **Social Sharing**. See `app-settings/domain-and-branding.md`.

## Distribution

How others can get a copy of this app:

- **Not distributed**: "No one can duplicate or install this app."
- **Template: allow duplication**: others get their own editable copy from the share link.
- **Allow installation**: other accounts install it as-is from the share link.

Both shared modes show the same share link under the options (**Copy** / **Open link**). It opens the app's install page: an installable app offers **Install**, a template offers **Duplicate**; someone without an account signs up first and lands in the app. The owner's own link says the app is already in their workspace.

The distribution type options are behind [flag: distributed-apps]. Selling an app, or charging people for access, isn't available through Blocks; an app can take payments inside itself with your own Stripe account.

## Solution

Only in a solution: its apps (order, remove, **Not installable**) and its **Rail** (**Layout**, **Solution branding**). See `building/solutions.md`. An app inside a solution has **Solution settings** here instead, which opens its solution's **Settings → Solution**.

## Git Sync [flag: git-sync]

1. Connect GitHub under **Account → GitHub**.
2. In the app, pick the repository, branch (default "main") and optional folder, then **Connect repository**.
3. Use **Push to Git** / **Pull from Git**.

Unlocks branches in the version switcher (`building/versions-and-publishing.md`).

GitHub connections:

- Connecting a GitHub account that another Blocks account already connected is refused: "This GitHub account is already connected to another Blocks account. To use it here too, ask an admin of that account to share the connection with this account." The fix is for an admin of the account that owns the connection to share it, not reinstalling on GitHub.
- Sharing: an admin of the account that owns a GitHub connection can share it with another account where they are also an admin or a member (not an external user). Under **Account → GitHub**, the connection shows "Shared with N accounts" or "Not shared"; click it to expand. Each share has **Edit** and **Stop sharing**, and **Share with another account** adds one: pick the account, then **All repositories** or tick specific repositories. Stopping asks for confirmation ("Its apps stop syncing on their next operation.").
- Members who are not admins of the account see no sharing controls, and cannot **Remove** a shared connection.
- The receiving account sees the connection under **Account → GitHub** with a **Shared by <owner account name>** badge and the repositories it can use ("All repositories" or a named list). It has no **Disconnect** and no **Manage on GitHub**; to change the repositories, ask an admin of the owning account. An admin of the receiving account can **Remove** it (confirm: "Apps using it stop syncing on their next operation.").
- In **Settings → Git Sync**, a shared connection lists only its allowed repositories. Connecting a repository outside the allowed list is refused: "This account is not allowed to use <owner>/<repo>. Ask an admin of the account that shared this GitHub connection."
- If sync shows "Access to this repository was removed. Ask an admin of the account that shared this GitHub connection.", the repository was removed from the share or the share was stopped or removed. The app's code and Git Sync settings are kept, and sync resumes once access is restored.
- If a repository that was shared is renamed on GitHub, reconnect it in **Settings → Git Sync**.
- Disconnecting a GitHub connection you own stops sync for every app using it, including apps in accounts it is shared with, from each app's next sync.

In the Blocks mobile app: long-press the app → **Settings** → **Git Sync** [flag: git-sync]. **Connect a repository** picks the GitHub account (only if the workspace has several), the repository, the branch and an optional root folder; adding a GitHub account itself happens on the web (**Open GitHub settings**). Once connected, the same screen lists the branches and has **Disconnect repository** (`building/versions-and-publishing.md`). Apps on the older block model show "Block model v2 required".

## State

The app's whole definition as one JSON document, for builders who want to read or change it by hand.

- It opens on **View**: a tree you can fold open and closed, with **Search keys and values** at the top (or press `/`) to find a key or a value; Enter and the arrows step through the matches, and ⌘C / Ctrl+C copies the value you're on. The expand button beside the search opens or closes everything.
- **Edit** switches to a code editor. Change the text and **Save** (nothing is saved until then); a version that is locked, or an import in progress, keeps it read-only.
- **Export as** downloads the definition (**App state**, a `.blck` file) or the app's code (**Code**, a `.zip`). **Import as** rebuilds the app from such a file. Uploaded files aren't part of either.

A single element has the same pair of views: **Advanced** in its **⋯** menu, or **Advanced — edit JSON** at the top of its settings panel, opens **Block JSON** — **View** to read and search it, **Edit** to change it and **Save** (**Reset** throws the edit away). A connection drawn on the Logic canvas can't be edited this way: delete it and draw it again.

## Developer settings

App-level API keys for the Blocks public API. See `account/api-and-mcp.md`.
