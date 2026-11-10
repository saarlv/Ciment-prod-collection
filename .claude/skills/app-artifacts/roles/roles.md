# Role Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating a role.

Roles define distinct user personas. **Most apps have zero roles** — all users share one experience. Define each as `artifacts/roles/<Name>.json` — e.g. `Admin.json`, `Editor.json`.

## When to create roles

- **One role means no roles.** A single role artifact adds complexity with no benefit.
- Create roles only when the app serves **2+ different personas with different experiences** — a marketplace needs Buyer and Seller, hiring needs HR and Interviewer, not one side of the story. Each role gets distinct workflows, navigation, and features; reuse components where sensible, but the journeys must feel meaningfully different.

### Portals & scoped apps — always 2 roles

If each user only sees content tied to their own entity (client portal, tenant dashboard, patient portal), the app needs a **linkage table** (e.g. `ClientUsers` mapping users↔entities) and two roles: **Admin** (the app owner who manages entities and links users) and the **end-user**. Create both even if the user only described the end-user side, and include an Admin management page to add/edit entities and link users rather than requiring manual DB edits. The layout branches by role: Admin → admin nav; end-user with a linkage → scoped experience; end-user without a linkage → "access pending", never a dead-end. Roles come from `UsersEntity.role` — never store roles in app tables.

## JSON schema

```json
{
  "type": "object",
  "required": ["name", "description"],
  "properties": {
    "name": { "type": "string", "description": "Role name" },
    "description": {
      "type": "string",
      "description": "Role description — who this persona is and what they can do"
    }
  }
}
```

## Notes

- Role artifacts are synced to blocks: each new role (matched by name) is created. Roles are **create-only** — they cannot be edited or deleted via artifacts, and re-syncing an existing role name is a no-op. For role-aware UI behavior, the frontend uses the `roles-and-authentication` skill and the platform's user role (`UsersEntity.role`).
