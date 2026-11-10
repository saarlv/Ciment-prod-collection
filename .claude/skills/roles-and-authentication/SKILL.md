---
name: roles-and-authentication
description: Authentication state, role-based access control, protected pages, sign-in/out, and user-aware UI — using useUser(), useChangeUserRole(), getLoginUrl(), and logOut(). The platform ships a built-in login page, so login is never "missing." Load this skill whenever the task involves logout, protecting pages, sign-in links, showing different UI per user role, or anything that depends on who the current user is. (Building a custom branded login/signup page is a public-app concern — see the public-app skill.)
user-invocable: false
---

# Roles and Authentication

## The platform owns login

The platform ships a login page at `/auth/login` and redirects unauthenticated visitors there before they reach the app. A normal app has no custom login route and nothing is missing — don't add one to fill the perceived gap.

- Link to sign-in with `getLoginUrl()` (returns `/auth/login`).
- A custom login route (`src/routes/login.tsx` → `/login`) is right only in a **public** app — building it is the `public-app` skill's job, and only when `artifacts/app.json` has `"isPublic": true`.
- Sign out with `logOut()`. It clears the token **and** navigates to `/auth/logout`; a hand-rolled sign-out that only clears local state leaves the platform session open, so the next page load is signed in again.
- Because the platform already redirects, most pages need no auth guard. Add one only when a page should bounce to login itself, pointed at whichever login URL the app uses.

## Hooks

```tsx
import {
  getLoginUrl,
  logOut,
  useUser,
  useChangeUserRole,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
```

`useUser()` returns the current user, read-only. Every field except `isAuthenticated` is optional — guard before use:

```ts
interface User {
  id?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role?: string; // only when the app has role artifacts; matches a role name
  permission?: 'build' | 'manage' | 'use'; // 'build' edits the app; 'manage' manages users and roles
  accountId?: number;
  isAuthenticated: boolean;
}
```

`useChangeUserRole()` returns `{ changeUserRoleFunction({ userId, role }), isLoading, isEnabled, error }`. `isEnabled` is true only when the signed-in user has `permission` `'build'` or `'manage'` (the SDK's `canManageUsers(user)`).

`useGoogleLogin()` / `useSendLoginLink()` belong to a custom login page — see the `public-app` skill.

## User records are read-only from the frontend

The server owns user records, so `UserEntity` rejects writes: `useEntityCreate(UserEntity)` and `useEntityUpdate(UserEntity)` leave the UI showing a control that silently does nothing. `role` is the single exception, only through `useChangeUserRole`, and only for a `'build'` or `'manage'` user assigning _another_ user's role (a manager can't change a builder's role) — an admin user-management screen, which lists the members with `useEntityGetAll(UserEntity)` and falls back to plain read-only text when `isEnabled` is false.

So: no user create/edit forms, no picker that changes the current user's own role, no "View as…" / "Act as…" / "Switch to Manager view" toggle, and never hold `role` in component state.

## User menu

Any identity control wires the same contract; compose the dropdown, avatar, and trigger per the `shadcn` skill.

- Signed out → a sign-in link to `getLoginUrl()` (or `/login` in a public app with a custom login route).
- Signed in → identity from `useUser()`: `name` or `firstName` + `lastName`, `email`, and `profileImageUrl` for the avatar image, falling back to the user's initials when it is absent.
- The sign-out item calls `logOut()` — nothing custom.

## Roles

`user.role` exists only when the app has role artifacts, and most apps have none — don't check it in a single-role app. Two or more roles mean genuinely different personas (Buyer and Seller, Admin and Member), so branch on `user.role` wherever the experience differs: navigation, page content, and the actions offered inside shared components. Role decides _what_ a user sees, not whether they may sign in.

**Where the role gate lives.** When the brief says a mini-app is for some people only, the root `routes/index.tsx` sends those roles to it (the `pages-and-routing` skill's rule 0) and the mini-app **denies everyone else in place**: its `layout.tsx` renders a "not available for your account" state _instead of_ `<Outlet/>` — the sanctioned exception to rendering the outlet on every path, so individual pages never gate themselves. The denial carries the user menu; never an automatic redirect. The orchestrator lists the same roles in that mini-app's `roles` in `artifacts/app.json`, so the platform's rail and landing hide it from everyone else — hiding is not access control (a direct URL still opens the mini-app), so the layout's denial stays.

**Portals and scoped apps** — client portal, tenant dashboard, patient portal — always carry an Admin persona plus an end-user one, with a linkage table (e.g. `ClientUsers` mapping email → clientId) scoping each end-user's data. Branch on role _and_ linkage: an Admin with no linked entity gets the admin experience, not the "not configured" dead end meant for end users. For whole-organization isolation the orchestrator passes the `multi-tenancy` skill's frontend implications in your brief.

For auth-aware `src/root.tsx`, load the `app-layout` skill.
