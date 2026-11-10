import tailwindcss from '@tailwindcss/vite';
import { reactRouter } from '@react-router/dev/vite';
import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { defineConfig, type Plugin } from 'vite';
import componentDebugger from 'vite-plugin-component-debugger';
import {
  blocksPageRoutes,
  blocksRouteConfig,
} from './blocks-framework-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The packages a framework build takes from the platform: the SDK, its client and app-render's host. */
const PLATFORM_PACKAGES = [
  '@blocksdiy/blocks-client-sdk',
  '@blocksdiy/blocks-client-api',
  '@blocksdiy/react-common',
  '@blockscom/app-render',
];

/**
 * native-dev (`BLOCKS_WORKSPACE_DIR`, the repo): the platform's packages from the repo's checkout,
 * resolved as the repo's own files resolve them, so the build runs the code on the branch.
 */
const workspacePackages = (workspaceDir: string): Plugin => {
  const importer = path.join(workspaceDir, 'apps/app-render/package.json');
  return {
    name: 'blocks-workspace-packages',
    enforce: 'pre',
    async resolveId(id) {
      if (
        !PLATFORM_PACKAGES.some(
          (name) => id === name || id.startsWith(`${name}/`),
        )
      ) {
        return null;
      }
      return this.resolve(id, importer, { skipSelf: true });
    },
  };
};

/**
 * Code highlighting in chat replies, with the languages apps' chats show and the themes the chat's
 * markdown (streamdown, through CopilotKit) asks for, rather than shiki's 250-odd languages, its
 * themes and its WebAssembly engine, which every build would otherwise bundle and upload. Code in
 * any other language shows as plain text.
 */
const SHIKI_LANGUAGES: Record<string, string> = {
  javascript: 'javascript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  json: 'json',
  shellscript: 'shellscript',
  bash: 'shellscript',
  sh: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  python: 'python',
  py: 'python',
  html: 'html',
  css: 'css',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  markdown: 'markdown',
  md: 'markdown',
};
const SHIKI_THEMES = ['github-light', 'github-dark'];
const SLIM_SHIKI_ID = '\0blocks-slim-shiki';

const slimShikiModule = () => `
import { createBundledHighlighter } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
export const bundledLanguages = {
${Object.entries(SHIKI_LANGUAGES)
  .map(
    ([name, file]) =>
      `  ${JSON.stringify(name)}: () => import('@shikijs/langs/${file}'),`,
  )
  .join('\n')}
};
export const bundledThemes = {
${SHIKI_THEMES.map((theme) => `  ${JSON.stringify(theme)}: () => import('@shikijs/themes/${theme}'),`).join('\n')}
};
export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
});
`;

/** `shiki`, as streamdown imports it, is {@link slimShikiModule}; its imports resolve from shiki. */
const slimShiki = (): Plugin => {
  let shikiEntry: string | undefined;
  return {
    name: 'blocks-slim-shiki',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (id === 'shiki' && importer && /[\\/]streamdown[\\/]/.test(importer)) {
        const resolved = await this.resolve(id, importer, {
          ...options,
          skipSelf: true,
        });
        if (!resolved) {
          return null;
        }
        shikiEntry = resolved.id;
        return SLIM_SHIKI_ID;
      }
      if (importer === SLIM_SHIKI_ID && shikiEntry) {
        return this.resolve(id, shikiEntry, { ...options, skipSelf: true });
      }
      return null;
    },
    load(id) {
      return id === SLIM_SHIKI_ID ? slimShikiModule() : null;
    },
  };
};

/**
 * Where the build lives in the compiled bucket: `compiler/<appId>` for the live app, plus
 * `/v<N>` for a version, then `/site`. The compiler uploads the build there.
 */
const siteKeyPrefix = () => {
  const appVersion = Number(process.env.APP_VERSION);
  const version =
    Number.isInteger(appVersion) && appVersion > 0 ? `/v${appVersion}` : '';
  return `compiler/${process.env.APP_ID ?? 'app'}${version}/site`;
};

/**
 * What the pages' metadata, robots.txt and sitemap.xml render from (`.blocks/seo.ts`): the app's
 * public settings and address, as the compiler passes them (`BLOCKS_SEO`), plus its pages from
 * `src/routes`. Without them, the app's name alone.
 */
const seoData = () => {
  let seo: { host?: string; data?: Record<string, unknown> } = {};
  try {
    seo = JSON.parse(process.env.BLOCKS_SEO || '{}');
  } catch {
    // The name alone, below
  }
  const routes = blocksPageRoutes(
    blocksRouteConfig({
      srcDir: path.resolve(__dirname, 'src'),
      appDirectory: path.resolve(__dirname, '.blocks'),
    }),
  );
  return {
    host: seo.host ?? '',
    data: {
      id: process.env.APP_ID ?? '',
      name: process.env.APP_NAME || 'App',
      ...seo.data,
      routes,
    },
  };
};

/**
 * The platform's modules (app-render's `runtimeModules`: React, the router, the SDK, the host), left
 * out of the browser build: the page's import map loads them from the platform's runtime, the one
 * every app shares, as an older bundle takes them from app-render's page. The build-time render
 * still bundles them. `BLOCKS_BUNDLE_PLATFORM=1` bundles them into the browser build as well:
 * native-dev only, since app-render's host (`@blockscom/app-render/hosted`) is never installed in
 * the compiler's boilerplate; there, such a build fails and the app is built as a bundle instead.
 */
const bundlesPlatform = process.env.BLOCKS_BUNDLE_PLATFORM === '1';
const platformRuntime = (ids: string[]): Plugin => {
  const external = new Set(ids);
  return {
    name: 'blocks-platform-runtime',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    resolveId(id) {
      return external.has(id) ? { id, external: true } : null;
    },
  };
};

// A framework build (`react-router build`, bundle contract 3): the app as a standard React Router
// app — its own document, a chunk per route, hashed assets, and app-render's host inside it.
export default defineConfig(async ({ mode }) => {
  const env =
    mode === 'development' || process.env.BLOCKS_ENV === 'development'
      ? 'development'
      : 'production';
  const workspaceDir = process.env.BLOCKS_WORKSPACE_DIR;
  // The constants app-render's code reads, as its own build defines them: the compiler's vendored
  // copy (`bundle:app-render-hosted`), since `@blockscom/app-render` is never installed here.
  const { hostDefines, runtimeModules, runtimeImportMap } = await import(
    pathToFileURL(path.join(__dirname, '.blocks/app-render/hosted.config.js'))
      .href
  );
  return {
    root: __dirname,
    // The build's assets sit under the path they take in the compiled bucket
    // (`compiler/<appId>[/v<N>]/site/assets/`), which the app's domain serves from that bucket: one
    // origin, hashed and immutable, and no lookup to find them. Not Vite's `base`, which would move
    // the app's own URLs too.
    build: {
      target: 'es2022',
      // As the bundle build: maps written beside the build, never served.
      sourcemap: 'hidden',
      assetsDir: `${siteKeyPrefix()}/assets`,
    },
    plugins: [
      ...(bundlesPlatform
        ? []
        : [platformRuntime(Object.keys(runtimeModules))]),
      ...(workspaceDir ? [workspacePackages(workspaceDir)] : []),
      slimShiki(),
      tailwindcss(),
      componentDebugger({
        enabled: true,
        includeAttributes: ['id', 'name', 'path', 'line', 'file'],
        includePaths: [
          'src/pages/**',
          'src/routes/**',
          'src/components/**',
          'src/layout.tsx',
          'src/root.tsx',
        ],
        // As the bundle build: shadcn primitives stay untagged (BLK-976).
        excludePaths: ['src/components/ui/**'],
        includeContent: true,
        customAttributes: ({ content }) => {
          const staticText = content?.trim();
          return staticText ? { 'data-dev-static-text': staticText } : {};
        },
      }),
      reactRouter(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
    resolve: {
      // One copy each: the app, the SDK and app-render's host share React, the router and the client.
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-router'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@blocks/client-sdk': '@blocksdiy/blocks-client-sdk/clientSdk',
        '@blocks/react-sdk': '@blocksdiy/blocks-client-sdk/reactSdk',
        '@/product-types': path.resolve(__dirname, './src/product-types.ts'),
        lodash: 'lodash-es',
      },
    },
    // The build-time render bundles the platform's packages as the browser build does: their ESM is
    // written for a bundler (extensionless imports), and native-dev resolves them from the repo.
    ssr: { noExternal: PLATFORM_PACKAGES },
    define: {
      ...hostDefines(env),
      __BLOCKS_APP_ID__: JSON.stringify(process.env.APP_ID ?? ''),
      __BLOCKS_APP_NAME__: JSON.stringify(process.env.APP_NAME ?? 'App'),
      __BLOCKS_SEO__: JSON.stringify(seoData()),
      __BLOCKS_IMPORT_MAP__: JSON.stringify(
        bundlesPlatform ? null : runtimeImportMap(),
      ),
    },
  };
});
