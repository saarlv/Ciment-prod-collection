---
name: public-app
description: 'Public apps — apps published for anonymous/external visitors (artifacts/app.json "isPublic": true). Covers public landing pages for signed-out visitors and building a custom, branded login/signup route with useGoogleLogin() and useSendLoginLink(). Load this skill when the app is public and the request involves a landing page, sign-up/sign-in experience, or a custom login route. For private apps, do NOT load this — they use the platform''s built-in login.'
user-invocable: false
---

# Public App

## First: confirm the app is public

Check `artifacts/app.json`.

- **`"isPublic": true`** — anonymous visitors open the app at its own URL and may sign up or sign in from inside it. A landing page and a custom login route both make sense here.
- **`"isPublic": false` or absent** — private app. Only invited users reach it and the platform's built-in login (`/auth/login`) already handles them. Link sign-in to `getLoginUrl()` and build no login route; see the `roles-and-authentication` skill.

`isPublic` is a read-only snapshot of the app's publish setting (Invite & Share → Publish) — code can't change it. If the user asks to "make the app public", tell them it's that Publish setting, then build the public UI they want.

## What "public" means for the UI

Signed-out visitors can land on any route, so routes branch on `user.isAuthenticated`: public/marketing content for guests, the real app for signed-in users. Guest fields on `useUser()` are absent, not empty — guard before reading them. Both `useSendLoginLink()` (email magic link) and `useGoogleLogin()` (Google OAuth) double as sign-up for new visitors. A self-signed-up user gets the app's **default role** — the one set in App Settings → General, or, until a builder sets one, whichever role the sync created first. Artifacts can't choose it, so when the app has roles, build the public mini-app's signed-in experience for the public audience's role and name that role in your report as the default the user must set.

**Where guests land.** The root sends anonymous visitors to the first declared page mini-app (the `pages-and-routing` skill's rule 0); its home is the guest landing: the mini-app's real home page with a sign-in / "Get started" CTA to `/login` — never an immediate bounce to the login screen. A hero is for an app with nothing to show before sign-in; a catalog or a booking flow shows itself.

## Custom login / signup route

Build it at **`src/routes/login.tsx`** (URL `/login`). Compose the card, inputs, and buttons per the `shadcn` skill; this is the auth wiring:

```tsx
import {
  useUser,
  useGoogleLogin,
  useSendLoginLink,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';

const user = useUser();
const navigate = useNavigate();
const googleLoginUrl = useGoogleLogin(); // a URL to LINK to, not a callback
const { sendLoginLink, isLoading } = useSendLoginLink(); // sendLoginLink({ email })

// Send already-signed-in visitors on to the app — without this they sit on the
// login route with no way forward.
useEffect(() => {
  if (user.isAuthenticated) {
    navigate('/'); // the root redirect (or root-mounted home) takes it from there
  }
}, [user.isAuthenticated, navigate]);

if (user.isAuthenticated) return null;
```

The route renders a "Continue with Google" link to `googleLoginUrl`, a divider, and an email form whose submit calls `sendLoginLink({ email })` — input and button disabled while `isLoading`, with the button label reflecting the sending state. There is no password: the platform has no password auth to call.

### Wiring it up

- Sign-in links and redirects across the app (root layout, user menu, protected routes) point at **`/login`** instead of `getLoginUrl()`.
- `src/root.tsx` must render `<Outlet/>` on the login route so the page shows for signed-out visitors — see the `app-layout` skill's auth-aware branching.
- Confirm the sent link with the shadcn `toast` component: `toast.add({ title, type: 'success' })`, with `<Toaster />` rendered once in the root layout (legacy `radix` apps use `toast.success()` from `sonner`).
- Never build user CRUD, role switchers, or "change role" UI — see `roles-and-authentication`.

**Migrated apps** may still have `src/routes/Login.tsx` (URL `/Login`) from the old flat-pages model — use that URL consistently if it exists; don't create a second login route.
