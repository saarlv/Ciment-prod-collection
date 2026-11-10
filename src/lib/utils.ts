// The platform helpers, re-exported for this app's code that imports them from '@/lib/utils'.
// Import them from '@blocksdiy/blocks-client-sdk/reactSdk' in code you write, and when you edit a
// file that imports them from here, move that import to '@blocksdiy/blocks-client-sdk/reactSdk'.
// Keep this line while any file still imports them from here; put it back if `shadcn init`
// rewrites this file.
export { getLoginUrl, getPageUrl, getRouteUrl, logOut } from './platform';

// `cn` is the compiled clsx + tailwind-merge replacement shadcn's base preset installs; it accepts the
// same inputs (strings, arrays, objects, falsy) so existing `cn(...)` call sites are unchanged.
export { cn } from 'cn';
