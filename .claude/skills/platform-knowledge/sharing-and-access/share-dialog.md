# The Share dialog

Open it with **Share** at the bottom of the left rail. Builders and people with **Can manage** see it. A solution itself has no **Share** row: its people are invited on its **Settings → Members** (`building/solutions.md`); each of its apps keeps its own. Other ways in:

- **Settings → Members → Invite members**.
- **Settings → App permissions**, which shows the same Private/Public cards.

The dialog has three tabs: **Team Members**, **Publish** and **Embed**.

## Team Members tab (people in your Blocks account)

- **General access** sets what everyone in the account can do with this app:
  - **Can access**: "View & interact".
  - **Can manage**: "Invite people & set roles". Everyone in the account who opens the app gets **Can manage**.
  - **Can build** (the default for new apps): "Build, edit & interact".
  - **Invitation only**: only people added below can open it.
- **Member access**: type a name or email in **Add by email**. A new email is invited to the account as a team member.
  - Each person gets **Can access** ("Access only"), **Can manage** ("Access, invite and set roles") or **Can build** ("Access and edit").
  - If the app has roles, also pick a **Role**. If it's multi-tenant, also pick a **tenant**.
  - Team members use plan seats. When the account is full: "Users limit reached — upgrade to add more".
- Each person's "…" menu has **Edit access** and **Remove access**. You can't remove yourself or lower your own access; someone else has to do it.
- Someone who hasn't accepted their invite yet shows **Invited** next to their name (on both tabs), and their "…" menu adds **Resend invitation**, which emails a fresh link (an external user gets the app's invite). Only an account admin can resend an account admin's invite. Invite links expire after a day. If they've joined meanwhile, it says they already accepted.
- People with **Can manage** invite and edit people as **Can access** or **Can manage**, including their role and tenant. They can't give **Can build**, and builders' rows are read-only for them. They don't see **General access** and can't change **Private**/**Public**.
- Only builders and admins of the account that owns the app can change **General access** and **Private**/**Public**, and delete or restore the app. People with **Can manage** can't.
- Someone removed from an app can't rejoin it by reopening it; they must be added again. The exception is an app where people sign themselves up (**Anyone with the link can log in** or **Anyone can log in to restricted parts**): logging in on the app's link brings them back with **Can access**.
- Inviting someone as a **team member gives them the whole workspace**, not just this app. To give someone only this app, invite them as an external user on the Publish tab.

## Publish tab (people outside the account, and the link)

**External link**: choose one card and one option under it.

- **Private** — "Login required to access"
  - **Only invited users can log in** (default) — only emails you invite can log in. For client, vendor and partner portals.
  - **Anyone with the link can log in** — anyone with the link can sign themselves up with their email.
- **Public** — "Everyone with the link can access"
  - **All content is public** — no login at all. Forms, landing pages, surveys.
  - **Invited users can log in to restricted parts** — public pages, plus login-only pages for invited people.
  - **Anyone can log in to restricted parts** — public pages, plus login-only pages anyone can sign up for.

- On HIPAA accounts the Public card is red: "Once public, this app isn't covered by your HIPAA agreement."
- An account admin's **Privacy & access** rules (**Account → Security center**) can lock these choices. If so, the user sees a message to contact an admin.
- Which _pages_ are public versus login-only is decided by the app itself, so ask Ella. Which _data_ anonymous visitors can see or submit is set per table (`sharing-and-access/data-permissions.md`).
- If everyone is suddenly asked to log in, check whether the app was switched to **Private**.

**External access (N)** (hidden when "All content is public"):

- **Add by email** accepts many addresses at once (Enter, comma, space, or paste a list) and **CSV** upload. Then click **Invite N** and choose their **Role** (and tenant) for the group.
- External users only ever get **Can access** on an app, never **Can manage** or **Can build**.
- External users can only _use_ the app: no Ella, no editing, and no Blocks workspace.
- They're limited by the plan's external-user seats. See `sharing-and-access/users-and-seats.md`.

**Footer**:

- **App permissions** (shortcut to Settings).
- **Copy public link**.
- **Open link** — this is how to open the app in its own tab.

## Embed tab

- **Copy code** gives an `<iframe>` snippet whose source is the app link plus `?embedded=true`. Paste it into any website.
- Use this snippet. A plain iframe of the app URL without it renders blank.
- The app's Private/Public setting still applies inside the embed.

## The app link

- `https://{app-slug-or-id}.blocks-app.diy` (`.blocks-apps.com` with [flag: use-alternate-apps-domain]). Set a memorable **App Slug** in **Settings → General** or **Customization → Domains**; "This slug is already taken" means pick another.
- An app installed into another account gets its own prefixed link. Logging in on that link signs people into the installing account. Only people the installing account invited or added can log in there, even when the app's owner set **Anyone with the link can log in**. Someone the installing account removed can't log back in. That account invites its own users from its copy of the app.
- A connected custom domain works alongside the default link (`app-settings/domain-and-branding.md`).
- Links and QR codes the app shows on screen use whichever domain the app was opened on. Ask Ella if you want one to use your custom domain.
- Links in emails and messages the app sends use the app's own address: the custom domain once it is fully set up, else the default link.
