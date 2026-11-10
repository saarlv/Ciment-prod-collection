// The document of a framework build (bundle contract 3), the same for every Blocks app. The platform
// restores it at every build, so an edit here is never saved: app-wide providers, chrome and
// <Toaster/> go in src/root.tsx.
import type { ReactNode } from 'react';
import { Links, Meta, Scripts, ScrollRestoration, type LinksFunction, type MetaFunction } from 'react-router';
import { normalizePath, pageMetadata } from './app-render/crawlable.js';
import { BlocksFrameworkApp, setBlocksHost } from '@blocksdiy/blocks-client-sdk/app';
import AppRoot from '../src/root';
import { seo } from './seo';
import '../src/index.css';

declare const __BLOCKS_APP_ID__: string;
declare const __BLOCKS_APP_NAME__: string;
declare const __BLOCKS_IMPORT_MAP__: { imports: Record<string, string> } | null;

/** The modules every page starts with, fetched alongside the app's entry rather than after it. */
const PRELOADED_RUNTIME = [
  'react',
  'react/jsx-runtime',
  'react-dom/client',
  'react-router',
  'react-router/dom',
  '@blocksdiy/blocks-client-sdk/app',
  '@blockscom/app-render/hosted',
];

// At build time there is no host page: the page renders as a signed-out visitor sees it, for the
// app the build is for. In the browser, the client entry starts app-render's host before this runs.
if (typeof window === 'undefined') {
  setBlocksHost({
    config: { baseUrl: '', googleBaseUrl: '' },
    app: { id: __BLOCKS_APP_ID__, name: __BLOCKS_APP_NAME__, compiledAt: 0 },
    themeMode: 'light',
  });
}

/**
 * Every page's title, description, canonical address and sharing tags, from the app's settings
 * (Crawlable Pages' per-page values first), rendered into each prerendered page and kept current
 * as the visitor navigates. A route's own `meta` replaces these unless it merges `matches`. None in
 * the fallback document (only the root matched), which serves every path not prerendered: the edge
 * writes that path's own tags into it.
 */
export const meta: MetaFunction = ({ location, matches }) => {
  if (matches.length <= 1) {
    return [];
  }
  const page = pageMetadata(seo.data, seo.host, normalizePath(location.pathname));
  const address = seo.host
    ? [
        { tagName: 'link', rel: 'canonical', href: page.canonical },
        { property: 'og:url', content: page.canonical },
        { name: 'twitter:url', content: page.canonical },
      ]
    : [];
  const image = page.ogImage
    ? [
        { property: 'og:image', content: page.ogImage },
        { property: 'og:image:alt', content: page.ogTitle },
        { name: 'twitter:image', content: page.ogImage },
      ]
    : [];
  return [
    { title: page.title },
    { name: 'description', content: page.description },
    { name: 'robots', content: page.robots },
    ...(page.themeColor ? [{ name: 'theme-color', content: page.themeColor }] : []),
    ...address,
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: page.ogTitle },
    { property: 'og:description', content: page.ogDescription },
    { property: 'og:site_name', content: page.siteName },
    { property: 'og:locale', content: page.locale },
    { name: 'twitter:card', content: page.twitterCard },
    { name: 'twitter:title', content: page.ogTitle },
    { name: 'twitter:description', content: page.ogDescription },
    ...image,
  ];
};

export const links: LinksFunction = () => {
  const { favicon } = pageMetadata(seo.data, seo.host);
  return favicon
    ? [
        { rel: 'icon', href: favicon },
        { rel: 'apple-touch-icon', href: favicon },
      ]
    : [];
};

/** "fr_FR" → "fr". */
const lang = (pageMetadata(seo.data, seo.host).locale.split('_')[0] || 'en').toLowerCase();

const chatComponentRenderer = Object.values(
  import.meta.glob('../src/components/ui/agent-chat-code-component.tsx', { eager: true }),
)[0];

export function Layout({ children }: { children: ReactNode }) {
  return (
    // The host sets the theme class (light/dark) before the page hydrates.
    <html lang={lang} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* The platform's runtime (React, the router, the SDK, the host), fetched with the page; its
            import map is written ahead of the <head> by the server entry */}
        {__BLOCKS_IMPORT_MAP__
          ? PRELOADED_RUNTIME.map((id) => (
              <link key={id} rel="modulepreload" href={__BLOCKS_IMPORT_MAP__.imports[id]} />
            ))
          : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        {/* app-render's host tree (theme, title, the builder's bridge), mounted by the client entry */}
        <div id="blocks-host" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return (
    <BlocksFrameworkApp chatComponentRenderer={chatComponentRenderer}>
      <AppRoot />
    </BlocksFrameworkApp>
  );
}

// The page's own HTML stays out of a private app's build: its pages render once the viewer signs in.
export function HydrateFallback() {
  return null;
}
