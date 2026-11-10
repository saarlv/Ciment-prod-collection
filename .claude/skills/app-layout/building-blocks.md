# Layout Building Blocks

> **Headless by design:** this doc covers the PLATFORM wiring — hooks, helpers, branching logic, and behavior contracts. It deliberately does not show how to install or compose UI components (dropdowns, avatars, toggles, sidebars): that knowledge lives in the **`shadcn` skill** — search/install via the CLI, pull component docs with `pnpm dlx shadcn@4.23.0 docs <component>`, and follow its composition and base-vs-radix rules. Component APIs differ between the `base` and `radix` bases and change between registry versions, so pull the docs rather than composing from recall.

**`src/root.tsx`** is the app-wide root layout. **Section layouts** are per-folder `layout.tsx` files under `src/routes/` (e.g. `routes/concerts/layout.tsx` wraps everything in that folder) — same `<Outlet/>` contract as root. See the `pages-and-routing` skill for folder → URL mapping.

```tsx
import {
  getLoginUrl,
  getRouteUrl,
  logOut,
  useThemeMode,
  useUser,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import { Outlet, Link } from 'react-router';
```

## Auth-Aware Layout Branching

`src/root.tsx` is the right place to branch on auth state — a minimal shell with a sign-in prompt for guests, the app for signed-in users. (The example's `<AppSidebar/>` in root is for an app whose only mini-app is at `/`; with mini-app folders, the nav lives in each folder's `layout.tsx`.)

```tsx
import { Outlet } from 'react-router';

export default function RootLayout() {
  const user = useUser();

  if (!user.isAuthenticated) {
    return (
      <>
        <header className="border-b p-4 flex justify-end">
          <Link to={getLoginUrl()}>Sign In</Link>
        </header>
        <main>
          <Outlet />
        </main>
      </>
    );
  }

  return <AuthenticatedShell />;
}

function AuthenticatedShell() {
  return (
    <div className="flex min-h-svh">
      <AppSidebar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
```

- Render `<Outlet/>` in every branch, including the unauthenticated one — a custom login route has to render there. The one exception: a mini-app may render a denial state — or a plain chat — instead, for people the brief keeps out of its shell (the `roles-and-authentication` skill, "Where the role gate lives").
- Sign-in links go to `getLoginUrl()` (the platform login at `/auth/login`, where unauthenticated visitors are redirected anyway, so this branch is mostly a graceful fallback). A **public** app with a custom login route at `/login` uses `<Link to="/login">` instead — see the `public-app` skill, and don't reference that URL unless the route exists.
- Never redirect from the layout; let the platform or the mini-app's index route do it.
- Treat an unknown auth state as signed out, not as `null`.

## Role-Based Layout Variants

When the app has roles, each can get its own shell — different nav, structure, even accent color. They can share one root layout and differ only in nav items and available actions.

```tsx
if (!user.isAuthenticated) return <PublicShell />;
if (user.role === 'Admin') return <AdminShell />;
if (user.role === 'Manager') return <ManagerShell />;
return <DefaultShell />;

// Each shell renders <Outlet /> for route content
function AdminShell() {
  return (
    <div>
      <AdminNav />
      <Outlet />
    </div>
  );
}
```

For a portal where each user sees only their linked entity's data, branch on role **and** linkage — see the `roles-and-authentication` skill.

## User Menu

A control in the header or sidebar footer showing the signed-in identity and offering sign-out. Build the UI (typically an avatar-triggered dropdown) per the `shadcn` skill; this is the wiring it must carry:

```tsx
const user = useUser(); // identity source — render nothing when !user.isAuthenticated

// Display data: user.name, user.email, user.profileImageUrl (may be absent).
// Avatar fallback when there is no image — initials from the real user:
const initials =
  [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || '?';

// The sign-out item's action is always logOut() — nothing custom.
```

## Theme Mode Switcher

The platform owns theme mode — the SDK hook is the only correct wiring:

```tsx
import { useThemeMode } from '@blocksdiy/blocks-client-sdk/reactSdk';

const { themeMode, setThemeMode } = useThemeMode();
// themeMode: 'light' | 'dark' | 'system' — drives the control's selected state
// setThemeMode('light' | 'dark' | 'system') — call on selection
```

Never add a ThemeProvider, `next-themes`, or custom toggling on top of it. Semantic tokens (`bg-background`, `text-foreground`, …) already adapt, so no manual `dark:` overrides.

## RTL Support

For Hebrew, Arabic, or other RTL languages — three pieces, all required:

1. **`rtl: true` in `components.json`** — set by passing `--rtl` to `shadcn init` (see the frontend brief's "Theme & shadcn setup"). With it, the CLI installs components with logical classes (`ms-*`, `start-*`) and direction-aware animations; without it, every install bakes in LTR-only physical classes that no direction attribute can fix. On an app inited without it, run `CI=1 pnpm dlx shadcn@4.23.0 migrate rtl -y` — it sets the flag and converts everything under `src/components/ui/`.
2. **Direction is stamped automatically — you own `lang`.** With `rtl: true`, the build stamps `dir="rtl"` onto `document.documentElement` before the app mounts. The document element is the ancestor of everything, portals included, so dialogs, selects, menus, tooltips, and toasts inherit direction with no per-component wiring — a wrapper `div dir="rtl"` never reaches portaled content, and the known `tw-animate-css` issue with logical slide animations resolves for the same reason. Set `document.documentElement.lang` from a layout effect; `dir` and `lang` are the only things on `<html>` an app may touch. Never use a `direction: 'rtl'` style: shadcn's `rtl:` variants compile to `:dir(rtl)` / `[dir="rtl"]` selectors and only engage via the attribute.
3. **`DirectionProvider`** — install with `yes n | CI=1 pnpm dlx shadcn@4.23.0 add direction -y` and wrap the tree. The underlying primitives (Base UI or Radix) take direction from React context, not the DOM — the context crosses portals and drives keyboard navigation and popup opening side.

```tsx
import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { DirectionProvider } from '@/components/ui/direction';

export default function RootLayout() {
  useEffect(() => {
    document.documentElement.lang = 'he'; // dir is stamped by the build
  }, []);

  return (
    <DirectionProvider direction="rtl">
      <Outlet />
    </DirectionProvider>
  );
}
```

- `lang` is for accessibility and typography (screen readers, font selection), not direction — set it to the app's language.
- **Not auto-RTL'd by the CLI:** `Calendar`, `Pagination`, and `Sidebar`. For Sidebar that means `side="right"`; check the others' docs (`pnpm dlx shadcn@4.23.0 docs <component>`).
- Directional icons you add yourself (`ArrowRightIcon`, `ChevronLeftIcon`, …) may need `rtl:rotate-180`.
- The CLI transform covers only `src/components/ui/**` — in app code write logical utilities (`ms-*`, `pe-*`, `start-*`, `text-start`), never physical ones (`ml-*`, `right-*`, `text-left`); they render identically in LTR.

### Multilingual apps (runtime language switch)

Everything above is reactive — drive it from a variable instead of literals:

- **Language state:** a `useLanguage` hook (`src/hooks/useLanguage.ts`) holding `'en' | 'he'`, persisted to `localStorage` (per-device). If the preference must follow the user across devices, store it in a user-preferences table via the app's actions instead.
- **Strings:** a hand-rolled dictionary util (`src/utils/Translations.ts`) — `const translations = { en: { … }, he: { … } }` plus a `t(lang, key)` helper. Don't add an i18n library, and never inline mixed-language ternaries in JSX.
- **Direction follows language.** Derive `dir` once in the root layout and override the stamped default from an effect: re-apply `document.documentElement.dir`/`lang` on change, give `DirectionProvider` `direction={dir}`, and let the sidebar's `side` follow it. Nothing else needs threading — portaled content inherits from the document element.

```tsx
const { lang } = useLanguage(); // 'en' | 'he'
const dir = lang === 'he' ? 'rtl' : 'ltr';

useEffect(() => {
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}, [dir, lang]);

return (
  <DirectionProvider direction={dir}>
    <Outlet />
  </DirectionProvider>
);
```

- **Font:** one dual-script stack in the `--font-sans` token (`src/index.css`), Latin font first and script font after (browsers fall through per glyph): `--font-sans: 'Geist Variable', 'Noto Sans Hebrew Variable', sans-serif;`. The faces in that example are placeholders: choose both for the brand (the `design` skill's checks name the Hebrew options). No runtime font switching.
