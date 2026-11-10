# Platform layout (outside an app)

## Left rail

The rail is on the left by default. In Hebrew or Arabic [flag: platform-language] the whole platform reads right to left and the rail is on the right (see "Language" below). Without that flag, **Layout direction** → **Right to left** does the same in English (see "Layout direction" below).

From top to bottom:

- **Account row** — the account's logo and name. Clicking it opens a menu with **Search**, which jumps to **Search apps…** on **My apps** from any page outside an app.
- **Collapsing and resizing the rail** — while it's open, the button at the account row's right end (**Collapse sidebar**) narrows it to icons. The rail's right edge is a line that lights up on hover: clicking anywhere along it opens or closes the rail, and dragging it makes the open rail wider or narrower (within limits). Dragging it most of the way toward the icons collapses the rail. The rail keeps the width you leave it at. On mobile the rail opens from **Open navigation** and closes with its ✕.
- **My apps** — every app in the account (see below).
- **New app** — "What shall we build?": describe the app or AI agent and Ella starts building.
- **Brain** — the account's company data, under **New app** [flag: brain-enabled]; see `app-capabilities/brain-company-data.md`.
- **Academy** — lessons on using Blocks, under **Brain** [flag: academy]; see `navigation/academy.md`.
- **Integrations** — every connection in the account. Tabs: **All integrations**, **My connections**, and, for admins only, **Other connections**.
- **User** — **My profile**, **Notifications** (your notification settings and desktop notifications; see `navigation/notifications.md`) [flag: notifications-center], **Two-factor auth** and **Developer settings**.
- **Account** — the account's admin pages (see below).
- **Notifications** — a bell with your unread notifications, at the bottom right above your avatar [flag: notifications-center]; see `navigation/notifications.md`.
- **Avatar menu** at the bottom (see below).

The new rail has no Marketplace or Templates entry. If someone asks for "the marketplace", say templates are shared as links or install links (see `app-settings/settings-sections.md` → Distribution).

## Language

[flag: platform-language] The platform speaks **English**, **עברית** (Hebrew), **العربية** (Arabic), **简体中文** (Simplified Chinese), **Español**, **Français**, **Português**, **Русский**, **Deutsch**, **日本語** (Japanese) and **한국어** (Korean); each is listed under its own name. The language is a setting, not the browser's: everyone sees English until they or their account choose otherwise.

- **For everyone in the account**: an admin sets it under **Account → My account → Language**; **Update account** saves it.
- **Just for you**: **My profile → Language** overrides the account's. **Same as account** (the default) follows the account, and shows which language that is. **Update profile** saves it.
- Saving a different language reloads the page in it. The Blocks mobile app stays in English for now.
- Hebrew and Arabic read **right to left**, everywhere: the rail moves to the right, menus and side panels open toward the page, and inside an app the builder is mirrored (rail, chat, builder panel, then the canvas).
- Code, formulas and editors always read left to right. What people type (chat messages, record values) shows in the direction of its own text, whatever the platform's language.
- The whole platform is translated. The marketing website stays in English, left to right. Emails, and the apps users build, are not affected by this setting (an app's own language is up to its builder). Text from the user's own data (app, table and record names) shows as it was written.
- The **Academy** has its own language menu for its lessons (see `navigation/academy.md`).
- Accounts that set the earlier **Layout direction** to **Right to left** read Hebrew.

## Layout direction

While the Language setting isn't available (the `platform-language` flag is off), the platform is in English and this setting takes its place, in the same spots.

- **Right to left** mirrors the layout: the rail moves to the right side of the screen, on **My apps**, the settings pages and inside every app. Text still reads in English.
  - Inside an app the builder runs right to left too: rail, then the chat, then the builder's side panel, then the canvas on the left. Menus and tooltips open toward the page, and toasts appear at the bottom left.
- **For everyone in the account**: an admin sets it under **Account → My account → Layout direction** (**Left to right** or **Right to left**); **Update account** saves it.
- **Just for you**: **My profile → Layout direction** overrides the account's. **Same as account** (the default) follows the account, and shows which direction that is. **Update profile** saves it.
- Saving a different direction reloads the page in it.

## Home page

- Signing in, or opening the account's address on its own, lands on **My apps** by default.
- An admin can pick another landing under **Account → My account → Home page**: one of the account's apps, one of its solutions, or **My apps**. **Update account** saves it, and it applies to everyone in the account. Clicking **My apps** on the rail still opens My apps.
- A link to a specific page, or a sign-in that started from one, still opens that page.
- If the chosen app or solution is uninstalled or deleted, the account lands on **My apps** again.
- An account created through a solution's share link starts with that solution as its home page (see `building/solutions.md`).

## My apps

- The toolbar: **Search apps…**, **Filter**, the sort (**Last edited**, **Created** or **Name**, newest or oldest first, or A → Z), grid or list view, and **New**.
- **Filter** opens one menu with **Access** (**All access**, **Public**, **Team**, **Invitation only**), **Creator**, **Tags** (several at once; only when the account has tags) and **Status** (**Active** / **Deleted**). **Filter** shows how many are in force, and each shows as a chip under the toolbar: click it to change it, **×** to remove it, or **Clear all**.
- **New** (top right) opens **New app** (the "What shall we build?" page) and **New solution** (see `building/solutions.md`).
- The page's address holds your view, sort and filters (including **Deleted**), so a refresh, a bookmark or a shared link opens the same list, and **My apps** on the rail opens it fresh. Search isn't kept. The mobile app remembers its sort and filters (access, creator, tags) on that device instead.
- Star an app (**Add to favorites**) to pin it under **Favorites**.
- The Blocks mobile app's **Apps** tab matches this page: the same sections and sort, and the funnel shows how many filters are on, with a chip above the apps for each one (tap it to change the filters, **×** to remove it, or **Clear all**). It has no grid/list switch, and **New solution** is on the web only; its **+** starts a new app.
- The page reads top to bottom: **Favorites**, **Solutions**, then **All apps**, each sorted the same way — by **Last edited**, newest first, until you change it; see `building/solutions.md`.
- Deleted apps are listed under **Filter → Status → Deleted** and can be restored from the app's **Settings → General** by builders and admins of the account that owns the app.
- Search: type in **Search apps…**, or pick **Search** from the account row's menu on any page outside an app.

## Avatar menu (bottom-left)

In order:

- Your name and email.
- **Upgrade** — the plans page. Account admins only.
- **Support** — a chat with the Blocks team.
- **Book a demo**.
- **Share & earn** — the referral program (bonus builder credits; see `billing/credits.md`).
- **Download desktop** — the Mac and Windows app (see `navigation/desktop-app.md`). Not shown inside the desktop app.
- **Theme** — System, Light or Dark. This changes the platform's look, not the app's.
- **Profile** and **Account** — shortcuts to the settings pages.
- **Switch account** — only shown when you belong to more than one account.
- **Log out**.

## Account settings pages

**Admins see:**

- **My account** — account name and logo, the **Home page** (see below), the **Language** [flag: platform-language] (see above; without the flag, the **Layout direction**), the **Account URL** the team signs in at [flag: account-custom-subdomain] (see `account/account-admin.md`), and the **Danger zone** for deleting the account.
- **Members** — team members and external users.
- **App settings** — defaults for new apps.
- **Allowed integrations** — limit which integrations, actions and triggers the account can use, and turn code actions on or off.
- **GitHub** — connect a GitHub account for Git Sync [flag: git-sync].
- **Billing**, **Plans**, **Usage** — see `billing/`.
- **Security center** — every account security setting on one page, grouped by what it protects, each showing whether it's on (**On**/**Off**, **Required**/**Optional**, or how many of its switches are on, like **1 of 2 on**) with a count of protections on at the top. **Single sign-on** and **HIPAA** read **Not on your plan** when the account's plan doesn't include them (and they aren't already on); they still open their page, and they don't count toward the protections. Each row opens that setting's own page, whose header leads back with **Security center ›**:
  - **Sign-in**: **Single sign-on**; **Two-factor requirement** (require 2FA for everyone); **SCIM provisioning** shows **Coming soon**.
  - **Access**: **Member sessions** (also where admins review and revoke **Blocks support access**) [flag: session-management]; **Privacy & access** (who can make apps public, and only allowing approved external users); **IP allowlist** shows **Coming soon**.
  - **Compliance**: **HIPAA**.
  - **Incident response**: **Emergency controls** shows **Coming soon**.

**Non-admins see** only **Account admins** (who the admins are, to ask them for changes) and **Members**.

Billing, Plans, Usage and **Upgrade** are hidden from non-admins. If a member asks about billing, tell them an account admin has to do it, and that they can find their admins under **Account → Account admins**.

## Profile

**My profile** holds your full name, **Job title**, phone, **Time zone**, **Language** [flag: platform-language] (the platform's language for you; see "Language" above; without the flag, **Layout direction**, see "Layout direction") and profile picture. The job title (optional, up to 100 characters; clear the field to remove it) shows next to your email on the **Members** page. The time zone is filled in from your browser the first time you sign in; change it there (each zone shows its offset from UTC, e.g. "UTC+02:00"; search by city or offset). Notification working hours follow it (see `navigation/notifications.md`). The login email can't be edited here; see `account/account-admin.md` for how to change it.
