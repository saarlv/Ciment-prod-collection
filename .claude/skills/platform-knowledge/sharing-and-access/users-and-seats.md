# Team members vs external users, and seats

This is the most common source of confusion in support. Get the distinction right first.

**Team member**

- **Who:** people in your Blocks account (workspace)
- **Sees:** the Blocks workspace and the apps their access allows
- **Can build with Ella:** yes, with **Can build** on that app
- **Added via:** **Account → Members → Invite members**, or Share → Team Members
- **Counts against:** the plan's **team member** seats

**External user**

- **Who:** customers, vendors, partners — anyone outside the team who logs in to an app
- **Sees:** only the specific apps they were given, at the app's own link
- **Can build with Ella:** never
- **Added via:** Share → **Publish** → External access, the app's **Settings → Members**, or self sign-up. Not from **Account → Members → Invite members**, which invites team members only.
- **Counts against:** the plan's **external user** seats

- External users only ever get **Can access** on an app, never **Can manage** or **Can build**.
- Someone removed from an app can't rejoin it by reopening it; they must be added again. The exception is an app where people sign themselves up (**Anyone with the link can log in** or **Anyone can log in to restricted parts**): logging in on the app's link brings them back with **Can access**.

## How external users are counted

- **Logging in counts; viewing doesn't.** Anonymous visitors to public pages never count, so a fully public app can be shared with anyone.
- Each person counts **once per account**, however many apps they're in.
- **Pending (not yet accepted) invites count.** Removing someone's access frees their seat right away.
- **Forms and surveys** sent to many people: if respondents must log in, each one becomes an external user. Let the form accept submissions without login instead. The data permission "Anyone can submit, only authenticated users can view" is made for this.
- **Seats come with the plan.** Extra seats aren't sold separately; a bigger plan has more. When full you see "Users limit reached — upgrade to add more" or "Team limit reached".

## One person, one type

A person can't be a team member and an external user in the same account at the same time. Admins can switch someone with **Convert to member** / **Convert to external** in **Account → Members**. To check what an external user sees, use **View as role** instead of a second login.

## Deactivating a team member

- Admins use **Account → Members → ⋯ → Deactivate user**. The person loses access to the account; **Activate user** brings them back later.
- Workflows (with their triggers and schedules) run as the person who built them. If the person owns apps, workflows or agents, the dialog asks who gets them: **Transfer … to** an active team member (the admin is preselected), or **Don't transfer**. Transferred apps stay with the new owner even if the person is reactivated.
- Not transferring leaves their workflows running as a deactivated user, so they can fail. The **Members** page then shows "A deactivated user still owns apps and automations"; **Show these users** lists just the deactivated users who still own something (the **Inactive, owns apps** status filter, admins only), and **⋯ → Transfer apps and automations** on a deactivated user hands everything over later.
- The transfer finishes in the background, usually within a minute; a notification follows it. When it's done it either confirms, names the workflows that couldn't restart for the new owner, or says it stopped (anything it didn't move still belongs to the deactivated user; transfer again from their menu).
- Their **personal connections** (not shared with the account or an app) are disconnected. Workflows that used one need a new connection: open the workflow and choose a connection. That's the usual reason a workflow couldn't restart after a transfer.

## Common access problems

- **"We don't have you in our platform yet" on the Blocks login page:** the person is an external user. They should open the app's own link, or an admin converts them to a team member.
- **"You haven't been invited to <app>" email:** they tried to log in to an app that doesn't allow sign-up, with an email that isn't on its user list. Invite that exact email. On an app installed from another account, sign-up is always off: the installing account invites that exact email from its copy of the app.
- **No Ella or Design tab on an app:** their access to that app is **Can access** or **Can manage**, not **Can build**. A builder changes it in **Share → Team Members**.
- **App or workspace missing after logging in:** they used a different email than the one invited. Login is by email, and signing up with a new email creates a new, empty account. If they belong to several accounts, use **avatar menu → Switch account**.
- **Everyone is asked to log in suddenly:** the app was switched to **Private**.
