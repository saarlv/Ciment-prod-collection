# Account administration

## Roles in the account

- **Admin**: manages members, billing, security and account settings. An account always keeps at least one admin.
- **Member** (team member): builds and uses apps according to each app's access.
- **External**: logs in to specific apps only (`sharing-and-access/users-and-seats.md`).

Per-app access (**Can access** / **Can manage** / **Can build**) is separate and set in each app's **Share** dialog.

## Members (Account → Members)

- Tabs: **Members** and **External**. A status filter: **All**, **Active**, **Invited**, **Inactive**.
- Someone who was invited and hasn't accepted yet shows **Invited** (on both tabs), not **Active**. That's per account: a person already using Blocks in another account still shows **Invited** here until they accept this account's invite.
- Each person shows their email, then their **Job title** if they set one in **My profile**, then their local time ("3:40 PM local time") when their clock reads differently from yours. Local time follows the **Time zone** in their **My profile**; it's left out for you, and for anyone whose time zone isn't known yet.
- **Invite members** (on the **Members** tab) → **Invite by email** invites a **team member**. The **External** tab has no invite button: external users aren't invited here, add them to an app with **Share → Publish → External access** or the app's **Settings → Members** (`sharing-and-access/app-login.md`).
  - A full plan shows "Team limit reached".
- Change someone's type with the role badge (**Member** ↔ **Admin**). Only admins can, and the last admin can't be demoted.
- Each person's actions (admins only; members don't see them):
  - **Resend invitation** (while **Invited**): emails a fresh invite link. Invite links expire after a day, so resend rather than remove and re-invite. For an external user it's greyed out here: resend it from the app, in **Share** or the app's **Settings → Members**.
  - **Convert to member** / **Convert to external**
  - **Deactivate user** / **Activate user**. A deactivated external user can't be activated here; adding them to an app again reactivates them.
- **Users can't be deleted, only deactivated.** Deactivated users lose access to every app in the account, and it's reversible. You can't deactivate yourself.
- An invite must be **accepted from the invited inbox**. If someone signs up separately instead, they get a separate, empty account.

## Changing your login email (or handing over an account)

The email can't be edited in **My profile**. Do this instead, in this order, so the account always has an admin:

1. **Account → Members → Invite members**: invite the new email.
2. Accept the invite from the new inbox.
3. Change the new user to **Admin**.
4. Log in with the new email (login link or Google) and check you can reach the apps.
5. From the new login, **Deactivate** the old email.

External users aren't affected. The billing email has to be changed separately by support. If builder access looks wrong afterwards, contact support.

## Multiple accounts

- One email can belong to several accounts (usually through invitations). Use **avatar menu → Switch account**.
- You can't sign up a second, separate account with an email that already has one.
- "My apps are gone": almost always means logging in with a different email than the one that owns them. Login is purely by email; try the other addresses you use.

## How builders log in

- **Email login link** or **Continue with Google**. There are no passwords.
- **Continue with Google** always opens Google's account chooser, so you can pick a different Google account even if you're already signed in to one.
- **SSO** (**Account → Security center → Single sign-on**): verify your email domain and connect your identity provider. Once active, members sign in through SSO.
  - An invitation to an account with SSO active joins through SSO too: the invite link opens the company's sign-in, and the invite is accepted once they sign in there. Someone the identity provider doesn't know can't join. External (app-only) users can't join an SSO account by invite.
- **Two-factor authentication**:
  - Personal 2FA is under **User → Two-factor auth**, using an authenticator app or SMS, with recovery codes.
  - Admins can require it for everyone under **Account → Security center → Two-factor requirement**.

## Sessions: where you're signed in [flag: session-management]

- **User → Sessions** lists every browser, desktop app and phone you're signed in on, in all your accounts: **This device** first, then **Other sessions**. Each shows the device and browser, approximate location and IP address, and when it was last active; the arrow opens when and how it signed in, where it started, and when it expires.
- **Sign out** on a row signs out that one session; **Sign out N other sessions** signs out everything except the device you're on. A signed-out browser tab leaves to the login page right away; the phone app signs out the next time it's opened.
- A **New country** badge means the session was signed in from a country none of your other sessions were used from; **Country changed** means it was used from a different country than where it signed in. Neither signs anything out by itself.
- **Sign-in alerts**: Blocks emails you when your account is signed in from a device you haven't used before, or a session moves to another country. **Not you? Sign out that session** in the email opens a page that signs out just that session (no login needed); then review the rest under **User → Sessions**.
- **Admins: Account → Security center → Member sessions** shows every member's sessions in this account, grouped by member with flagged ones first, with search and a filter (**Flagged**, **Active now**, **Browsers**, **Desktop app**, **Mobile app**). Admins can sign out a single session, a member everywhere (**Sign out everywhere**), or **Sign out everyone** (everyone but themselves).
- **Idle timeout** (same page): sign members out of a session that hasn't been used for 1, 7, 14, 30 or 90 days (default **Never**). It applies the next time that session is used.
- Location is approximate (from the IP address): a VPN or a mobile network can show a different city.

## IP allowlist: limit access to approved networks [flag: account-ip-allowlist]

- **Account → Security center → IP allowlist** (admins only; it reads **Coming soon** until the feature is turned on for the account): add the addresses the account may be used from — a single IP (203.0.113.7) or a range (203.0.113.0/24), IPv4 or IPv6, with an optional label like "Office". The page shows the IP you're connecting from, with **Add my IP address** when it isn't listed.
- **Only allow listed IP addresses** turns the restriction on. While on, every request using the account from any other address is refused: signing in to the web, desktop and mobile apps, the account's apps, API keys and AI connectors (the MCP server). The person sees **You don't have access from here**.
- The work Blocks itself runs for the account's apps keeps working from anywhere: code actions, browser tasks, voice agents answering calls, and Ella checking an app in its own browser.
- Blocks won't let an admin lock themselves out: turning it on, or removing an entry while it's on, is refused if your own current IP wouldn't be covered. Turning it off always works.
- Someone who is blocked should ask an account admin (working from an allowed network) to add their address. If every admin is locked out, contact support (`account/support.md`).
- Incoming webhooks that start a workflow (for example from Stripe or Zapier) keep working from any address.
- Signed-in app users and outside systems using the account's credentials from other networks (for example Zapier or a server calling the API with an API key, or Claude or ChatGPT on the web using the MCP server) are blocked too: add their addresses, or leave the restriction off. Visitors of a public app who aren't signed in aren't affected.

## Blocks support access

- To help with a support request, Blocks staff can open time-limited access to the account. They join as their own named Blocks support user (for example "Dana (Blocks Support)"), with an admin's access, and they don't take a seat or need the account's SSO. Workflow webhook URLs they set up keep working after the access ends; API keys their support user creates stop with it.
- To debug what one particular user sees, a staff member can instead **sign in as that user** (an admin or member of the account) for at most 8 hours. Nothing about the user changes: their own sessions, membership and settings stay as they were, and the access ends on its own. API keys and workflow webhook URLs they create there are your account's and keep working after the access ends.
- **Admins: Account → Security center → Member sessions** [flag: session-management], section **Blocks support access**: who from Blocks has access now, why, the ticket, whether they joined as their **Support user** or **Signed in as** one of your users, and until when, each with **Revoke access**. Past access is under **Past access**. Their sessions also show in the sessions list with a **Blocks support** badge and the same **Revoke access** (signing out one browser alone would leave the access open). There is no other page for it.
- **Revoke** ends an open access right away and signs that person out of the account. Access also ends on its own when its time runs out, or when the staff member ends it.
- Everything they do while inside is recorded in the account's activity: under their support user's name, or, when signed in as a user, under that user's name with the staff member recorded behind it. Their avatar shows a **Support** badge (signed in as a user, the avatar menu says "Blocks support, signed in as <name>"), and they end the access from the avatar menu.
- They can invite people (not Blocks staff), remove members (not admins), set up SSO and sign members out to help you. They can't change the plan and billing, 2FA enforcement, HIPAA exceptions, allowed integrations or Privacy & Access, delete the account, rename members, change the signed-in user's own profile, 2FA or sessions, or switch to other accounts from that session.

## Account settings for admins

- **My account**: account name and logo, the **Home page** everyone lands on after signing in, and the **Language** [flag: platform-language] (one of eleven languages for everyone; Hebrew and Arabic read right to left; members can choose their own on **My profile**), or, without that flag, the **Layout direction** (**Right to left** puts the rail on the right for everyone; members can override it on **My profile**) (see `navigation/platform-layout.md`).
- **Account URL** (**Account → My account → Account URL**) [flag: account-custom-subdomain]: the address the team signs in at. Every account starts on `b-<number>.blocks.diy`; an admin can pick a name instead, so it becomes `<name>.blocks.diy`.
  - Lowercase letters, numbers and hyphens, 3 to 63 characters, not starting or ending with a hyphen. Some names are reserved, and each name can belong to one account only.
  - **Save URL** moves you to the new address straight away. Sign-in links, account switching and emails then land there.
  - Changing it signs everyone out of the previous address; they sign in again once at the new one. The admin who changed it is moved there already signed in.
  - The `b-<number>` address redirects to the current one. A previous custom name redirects people who were signed in on it; anyone else sees a login page there, and another account can take the name.
  - **Use default URL** goes back to the `b-<number>` address.
  - Links an app builds to itself inside the platform (a **Copy link** for teammates, links in messages it sends) use the account URL too.
- **App settings**: defaults for new apps.
- **Allowed integrations**: see `integrations/integrations.md`.
- **Privacy & access** (**Account → Security center → Privacy & access**): rules such as locking whether apps can be public, and only allowing approved external users (an admin approves an external user by adding them to an app).

## Deleting the account

1. **Account → My account → Danger zone → Delete account**. Admins only. In the Blocks mobile app: **Settings → Delete account** (`navigation/mobile-app.md`).
2. **Cancel the subscription first**; deletion is blocked while one is active.
3. **30 days later the account is closed**: every member and app user loses access, connected integrations and sessions are cut off, and people who aren't in another Blocks account have their name, email and photo erased. Until then, **Undo delete request** in the same place cancels it.
4. Closing the account doesn't erase the apps' stored data on its own. To have it erased too, contact support (`account/support.md`). Don't promise when or how it happens.

If the reason is a technical problem, suggest contacting support first.

Deleting a single **app** is different: it's reversible from **Settings → General → Restore app**.
