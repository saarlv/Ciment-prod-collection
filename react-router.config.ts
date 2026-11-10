import type { Config } from '@react-router/dev/config';

// A framework build (bundle contract 3): static files only (no server at runtime). A public app's
// pages with a fixed address are rendered to HTML at build time, so search engines and link
// previews read them; a private app's build holds only the fallback document every path serves.
const prerenderPages = process.env.BLOCKS_PRERENDER === '1';

export default {
  appDirectory: '.blocks',
  buildDirectory: 'build',
  ssr: false,
  ...(prerenderPages
    ? {
        async prerender({ getStaticPaths }) {
          // Every fixed-address page except the platform's sign-in paths (`/auth`, `/auth/*`; not
          // a page such as `/authors`)
          return getStaticPaths().filter(
            (path) => path !== '/auth' && !path.startsWith('/auth/'),
          );
        },
      }
    : {}),
} satisfies Config;
