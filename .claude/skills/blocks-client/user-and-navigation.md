# Current user, theme mode, and navigation

## User & authentication

The platform authenticates users automatically: it serves a built-in login page at `/auth/login` (link to it with `getLoginUrl()`) and redirects unauthenticated visitors there — so login is never "missing" and you don't build one. **Public apps** (`artifacts/app.json` `isPublic: true`) may build a custom login route — see the `public-app` skill. For auth state, roles, and protected routes, see `roles-and-authentication`.

```tsx
import {
  getLoginUrl,
  logOut,
  useUser,
  useChangeUserRole,
  useThemeMode,
} from '@blocksdiy/blocks-client-sdk/reactSdk';

const user = useUser();
// id, email, firstName, lastName, name, isAuthenticated, role,
// permission ('build' | 'manage' | 'use'), profileImageUrl (optional — use with
// AvatarImage, initials fallback)

// Sign-in link → platform login, or '/login' for a custom login route
<Link to={getLoginUrl()}>Sign In</Link>;

logOut(); // clears the token and redirects to /auth/logout

// Role management — 'build' and 'manage' permission users only
const { changeUserRoleFunction, isEnabled } = useChangeUserRole();
await changeUserRoleFunction({ userId: 'user-123', role: 'Manager' });

const { themeMode, setThemeMode } = useThemeMode(); // 'dark' | 'light' | 'system'
```

User records are server-owned: the app reads them and cannot write them. For extra per-user fields, use the extension-entity pattern in [entities.md](./entities.md).

## Navigation

Use `<Link to>` / `useNavigate()` from `react-router` with real URLs. For dynamic routes, use `getRouteUrl(pattern, params?, searchParams?)` from `@blocksdiy/blocks-client-sdk/reactSdk`.

```tsx
import { Link, useNavigate } from 'react-router';
import { getRouteUrl } from '@blocksdiy/blocks-client-sdk/reactSdk';

// Static routes — real paths
<Link to="/dashboard">Dashboard</Link>;

// Dynamic routes — getRouteUrl
<Link to={getRouteUrl('products/:id', { id: '123' })}>Product</Link>;
// → /products/123

const navigate = useNavigate();
navigate('/thanks');
navigate(getRouteUrl('orders/:id', { id: orderId }));
```

Don't use `window.location` or a raw HTML `<a>` for internal navigation — both force a full page reload, which drops the app out of the platform shell and loses client state. URL structure and conventions: the `pages-and-routing` skill.

A full URL that leaves the app (in an email, SMS, or a third party's redirect/callback) is built by a code action with `client.getAppLinks()` (backend-code-actions): pass the action the path, not `window.location`.
