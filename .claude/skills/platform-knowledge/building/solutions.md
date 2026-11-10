# Solutions

A **solution** brings several of the account's apps together under one name, so people use them as one product: they move between the apps from one rail, the way they move between one app's mini-apps.

## Creating one

- In **My apps**, **New** (top right) → **New solution**.
- Give it a **Name**, then tick the **Apps** it brings together, in the order people should see them (the numbers show the order; the list stays in name order, and **Search apps…** narrows it). A solution holds up to 50 apps. **Create with N apps** opens the solution.
- Only the account's own apps can join — not apps it installed from someone else, and not another solution.
- A solution is an app too: open **Builder** in it and ask Ella for its own pages, typically a home page that introduces the solution and has a card per app. Ella knows the solution's apps and can link to them.
- **The solution's own row** heads the rail's list: its tile with a second tile behind it, and its name, with a line under it setting it apart from its apps. Clicking it opens the solution: its home page, or its overview while it has none. A solution with a single page has no separate row for that page: the solution's row is it. With several pages, they're listed under the row (the line comes after them), and clicking the row opens the first. The row stays highlighted while the solution is what's open (with several pages, the open page's row is highlighted instead), so **Settings** (or **Builder**) at the top of the rail are the solution's. **Settings** always belongs to what's open: the solution when its row is highlighted, otherwise the open app. Inside a solution, the settings page's title names it (its tile and name, then the section, e.g. "Finance › Members"), and the rail highlights the same row. Its **⋯** (on hover) offers **Add a home page** (its builders, until it has one), **Members** (whoever builds or manages it) and **Solution settings** (its builders). The row shows for the solution's builders and managers, and for everyone once it has a home page.
- A solution with no pages of its own: its builders and managers open it on its overview ("<name> has no home page yet"), with **Add a home page** (builders: opens the solution's builder with the chat), **Manage members** and **Settings** (builders), and its apps. Everyone else opens it on its first app with pages. Once it has pages, they open there, and **Builder** on the solution opens the solution's builder.

## Inside a solution

- **The rail** shows the solution's row first (with its pages under it when it has several), then each app: by default its name and square icon, with its mini-apps under it. In the collapsed rail the square icons mark where each app starts. By default clicking an app's name opens it, and an app with no mini-apps still shows its name. How apps are named, what their names do and whether people can fold them are set under **Rail** below. The list and its order are the same on every app of the solution; only the highlighted row changes.
- The rail shows each person only the apps they can open: apps they're a member of, and apps whose General access is open to the account. An invitation-only app they aren't in (or were removed from) is left off, even when it allows installation. To show it to someone, invite them to it (the solution's **Settings → Members**). If they open such an app from a link, they see "You don't have access to this app" ("Ask someone who manages it to invite you"), and the rail keeps the solution's other apps, so they can move on.
- The solution itself has no **Share** row on the rail: its people are invited on its **Settings → Members**. Each of its apps keeps its own **Share** row for the people who manage that app's members.
- With many mini-apps the rail switches to **one row per app**: only the open app's mini-apps unfold under its name (see **Rail** below).
- **The top of the rail** shows the solution's name and icon instead of the account's, unless **Solution branding** is off.
- **The Notifications bell** covers the solution and every app in it; each notification names its app.
- **Search** (⌘K / Ctrl+K) also lists the other apps' mini-apps, under each app's name.
- An app can belong to more than one solution; it shows the solution the person entered last.

## Settings → Solution

In the solution's **Settings → Solution** (builders only). From any of the solution's apps, **Builder** → **Settings** → **Solution settings** opens it:

- **Apps**: the apps in their rail order.
  - **Add an app…** adds one of the account's apps; **New app** starts a new app that joins the solution once it's created.
  - The arrows move an app up or down; the **×** removes it from the solution (the app itself is untouched). To keep an app off the rail, remove it from the solution.
  - "No pages yet" means the app has no pages: the rail shows its name alone (and skips it when app names are hidden). **Not installable** means the solution allows installation but that app doesn't — accounts that install the solution won't get it; turn on installation in that app's **Settings → Distribution**.
- **Rail**:
  - **App names**: **Icon and name** (each app's icon and name, its mini-apps indented under it), **Name only** (each app's name as a small title over its mini-apps; the collapsed rail still shows each app's icon, since it has no room for names), or **Hidden** (every mini-app in one list, as if the solution were one app; apps with no mini-apps leave the rail).
  - **Layout**: **Automatic** (every mini-app while the rail stays short, one row per app once it wouldn't), **Every mini-app**, or **One row per app** (only the open app's mini-apps show). Doesn't apply while app names are hidden.
  - **Clicking an app's name**: **Opens the app**, or **Nothing, it's a title**. A title still folds and unfolds the app's mini-apps wherever apps fold (with **One row per app**, or when people can fold apps).
  - **Let people fold apps**: a chevron by each app's name folds or unfolds its mini-apps. Each person's choice is remembered on their own device, and the app they're in always opens when they load or move into it.
- **White label** — make the solution feel like its own product. Everything here applies to everyone inside the solution, builders included; builders keep **Builder** and **Settings**, so they can always switch an option back:
  - **Solution branding**: show the solution's name and icon at the top of the rail instead of the account's.
  - **Solution in the browser tab**: the tab shows the solution's name, and its icon if it has one (set in the solution's **Settings → General**), instead of Blocks'.
  - **Hide My apps**: no **Back to my apps**, **New app**, **Brain** or **Integrations** in the menu at the top of the rail, so no way out of the solution from it.
  - **Hide notifications**: no notifications bell on the rail.
  - **Hide Activity log**: no Activity log button in the builder's top bar, and ⌘U doesn't open it.
  - **Hide Blocks in the user menu**: the avatar menu leaves out **Upgrade**, **Support**, **Book a demo**, **Share & earn** and **Download desktop**.
- Changes save at once and are never part of a draft: they apply to the live solution right away.

## Members of a solution

Each app in a solution keeps its own members, permissions and roles. People are managed for all of them in one place: the solution's **Settings → Members** ("Solution members").

- The list shows everyone who can open the solution or any of its apps, one row per person, with the icons of the apps they're in (hover an icon for their permission and role there) and how many apps they have ("All apps", "2 of 3 apps").
- **Invite to solution**: add people (account members by name, or a new email, seats permitting), then tick the apps they get. Each ticked app has a permission (**Can access**, **Can manage**, **Can build**) and, when the app has roles, a **Role**, preset to the app's default role. **Invite** adds them to every ticked app at once. Someone already in an app keeps the access they have there.
- **Manage** on a person's row: tick or untick apps, and change their permission or role in each, then **Save**. Unticking an app removes them from it. Nobody changes their own access here.
- An app greys out when you can't manage its members, or when the person's access there is above yours. Apps that split their members by tenant take new members on their own **Settings → Members**, where the tenant is picked; external users are also managed on each app's own page.
- An app's own **Settings → Members** says "This app is part of <solution>" with a link to the solution's members.

## In the Blocks mobile app

- **Apps** lists solutions in their own **Solutions** section, below **Favorites** and above **All apps**; a solution's tile has a second tile peeking out behind it. Solutions can't be favorited.
- Tapping a solution opens its own pages, or, without any, its first app that has pages. If none of its apps has a page yet it says **Nothing to open yet**; its builders get **Build solution home**, which opens Ella in the solution.
- Inside any app of a solution, the title at the top is the solution's name and icon over the app's name (just the app's name when **Solution branding** is off), with a down arrow. Tapping it lists the solution's pages, then each app and its pages, laid out and named as the solution's rail is (**Layout**, **App names**, **Clicking an app's name**; an app whose name is only a title unfolds when tapped). Tapping another app or page switches to it, and the close button (X) still returns to **Apps**. The bottom bar shows the open app's own pages.
- The bell at the top right covers the solution and all its apps, and each notification names its app.
- A link on a solution's page to one of its apps opens that app.
- Creating a solution and **Settings → Solution** are on the web only, and the mobile app keeps no folded apps (**Let people fold apps** is web-only).

## Sharing and installing

- Share a solution like an app (`app-settings/settings-sections.md` → Distribution): its share link opens the same install page, where a signed-in person gets **Install**. Someone without an account who signs up from a solution's link gets an account with the solution installed and set as its **Home page** (**Account → My account**), so they open in the solution right after signing up and every time they sign in. An admin can change that there. Installing a solution installs its apps that allow installation (apps the account already has are left as they are). Uninstalling it removes all of the solution's apps from that account, including ones the account had installed on its own.
- In **My apps**, solutions get their own **Solutions** section, below **Favorites** and above **All apps**; an app in a solution says "in <solution name>" on its card.
