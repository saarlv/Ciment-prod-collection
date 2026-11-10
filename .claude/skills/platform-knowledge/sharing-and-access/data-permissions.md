# App roles and data permissions

## App roles

- Roles give different people different experiences in the same app, e.g. Manager, Staff, Client. **Ask Ella to create or change roles.** Spelling out each role works best.
- Review them in **Settings → General → App roles**. Pick the **Default role** there. It's given to people who sign themselves up, and pre-filled when inviting. Anyone with no role of their own (including the app's creator) counts as having the default role.
- Assign a role per person in **Share** (Team Members or Publish tab) → **Edit access**.
- Preview each role with **View as role** on the canvas toolbar.
- Roles shape the app's screens, and can limit which of its mini-apps people see in the app's content list (`navigation/builder-layout.md`). What data each person can _reach_ is controlled by the data permissions below.

## Who can see what data

Everything is in **Settings → App permissions → Data Permissions**, or for one table, **Data → table → Settings → Access**.

**1. Table access**: what signed-out visitors may do with each table. Options:

- **Only authenticated users can view and submit**
- **Anyone can view, only authenticated users can submit**
- **Anyone can submit, only authenticated users can view** (public forms)
- **Anyone can view and submit** (use with care)
- **Only users from accounts that installed the app can view**

Table access only matters once the app has signed-out visitors, i.e. when it's **Public**. In a Private app everyone is logged in.

**2. Row policies**: which rows each logged-in user can read or write.

- Open them with the **+** at the end of a table's row in Data Permissions.
- Each table can have one **All** policy, or one **Read** plus one **Write**.
- Per-operation policies [flag: app-data-access-rules]: instead of **Write**, separate **Create**, **Update** and **Delete** policies (one policy per operation), e.g. everyone in a project can edit tasks but only Admins delete them. An **Update** policy also checks the new values, so nobody can move a row somewhere they couldn't create it.
- The classic "users only see their own records" recipe:
  - Operation **All**
  - Column **created_by** (filled in automatically)
  - **=** `{{user.id}}`
- You can also match on `{{user.email}}`, `{{user.role}}`, `{{user.firstName}}` or `{{user.lastName}}`.
- Every condition needs a value: the grey "Value" in an empty box is only a placeholder. A condition with a column and an operator but no value can't be saved ("Every condition needs a value. To check for an empty cell, use IS NULL."), and a table policy with one shows **Missing a value**; **Apply changes** then applies nothing and says which tables to fix ("Nothing was applied: fix the policies in … first").
- **User properties** [flag: app-data-access-rules]: custom properties per member (department, region, the groups they're in), set by people with **Can build** or **Can manage** in **Share** → **Invite** or **Edit access** (also **Settings** → **Members**) → **User properties**. Properties the app declares (Ella declares the ones its rules use) get their own field — a picker, a number, an on/off switch or checkboxes; anything else is a free name/value row (separate several values with commas). An app can also have its own admin screen that sets them for builders and managers. Policies use them as `{{user.data.department}}`; a list matches any of its values. A member never edits their own, and sees only their own (in the app's user list, other members' properties are empty to anyone without **Can build** or **Can manage**).
- **Membership rules** [flag: app-data-access-rules]: "people only see their team's / project's rows" when a person can be in several teams. The app keeps a members table (e.g. ProjectMembers: project + user), and the policy checks it on every request, so adding or removing a member takes effect immediately. Ask Ella to set this up; the Data Permissions dialog shows such a condition as "checks membership in …" and only Ella edits it.
- More conditions [flag: app-data-access-rules]: **List includes** matches rows whose list column (e.g. watcher emails) includes the user, and `{{now}}` gives time-limited access (e.g. `visibleUntil > {{now}}`).
- When Ella builds an app with more than one kind of user (several roles, a client or member portal) or personal data, she decides who may see, create, change and delete each table, and scopes a portal's data with a rule rather than only hiding pages. She runs a data access check (open membership tables, rules that let everyone through, tables with no rule) and fixes what it finds; she asks before opening data up to more people [flag: app-data-access-rules-ella].
- Live updates in an app never carry another person's data: an open page learns that rows changed and reloads only what that person may see.
- If a policy uses something the user doesn't have (no user property of that name, or not signed in), the policy hides every row from them rather than guessing [flag: app-data-access-rules].
- **No policy means every logged-in user can read and write every row.**
- Users with **Can build** or **Can manage** skip row and column policies. Test with a second account that has **Can access**.
- Policies are enforced by Blocks' data service, so they can't be bypassed from the browser. Code actions run with the triggering user's permissions too.

**3. Column policies**: hide specific columns from some users. With **Restricts** [flag: app-data-access-rules] a column policy can instead make columns read-only (**Changing**: people see the value but can't set or change it, e.g. only Admins edit a budget), or both (**Seeing and changing**).

**4. Multi-tenancy**: separate _organizations_ (companies, clinics, clients) inside one app.

1. **Enable multi-tenancy**, then pick the **Tenant table**.
2. Set each table to **Private to tenant**, **Shared across tenants** or **System-level**.
3. Assign each **Can access** user to a tenant in **Share** → **Edit access**.

Builders and people with **Can manage** see every tenant; test with a real customer login. For per-_person_ separation, use row policies instead.

**Ella sets it up while building** [flag: app-data-access-rules-ella]: describe who should see what ("each clinic sees only its patients", "people only see their projects' tasks", "only Admins delete") and Ella builds the tenant table, row and column policies and membership tables with the app. They show up in Data Permissions like hand-made ones. Assigning people to tenants and setting their **User properties** stays in **Share** → **Edit access**. Before any change that opens data up to more people (removing a rule, a rule covering fewer actions, unhiding or unlocking columns, making a tenant's table shared), Ella asks in a question card ("Yes, open access as described" / "No, keep access as it is") and changes nothing until you approve it there; editing the rules yourself in **Data Permissions** needs no approval.

**Changes are staged**: click **Apply changes** (or **Reset changes**). A setting you set by hand isn't overwritten later, except that Ella's later changes to a table's own access rules replace that table's rules [flag: app-data-access-rules-ella].

## Public submission forms (common setup)

1. Set the table to **Anyone can submit, only authenticated users can view**.
2. If logged-in users should only see their own submissions, add a Read policy: `created_by = {{user.id}}`.
