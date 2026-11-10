import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import componentDebugger from 'vite-plugin-component-debugger';

import {
  appEntryPlugin,
  generateAppIndexPlugin,
} from './vite-plugin-generate-app-index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isStandalone = process.env.VITE_BUILD_STANDALONE === '1';
// The bundle a cloud build (the compiler's `pnpm build`) makes, which app-render runs either way:
// 2 = the app's own src/main.tsx, which renders BlocksApp itself; 1 = the generated entry
// (`virtual:blocks-app-index`), whose routes app-render renders from `window.compiler`, built
// only when `BLOCKS_BUNDLE_CONTRACT=1` asks for it.
const bundleContract = process.env.BLOCKS_BUNDLE_CONTRACT === '1' ? 1 : 2;

const externalDeps = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/compiler-runtime',
  'react-router',
  '@blocksdiy/blocks-client-sdk/clientSdk',
  '@blocksdiy/blocks-client-sdk/reactSdk',
  '@blocksdiy/blocks-client-sdk/app',
  '@blocksdiy/react-common/agent-chat',
  '@blocksdiy/react-common/new-agent-chat',
  // Every react-common entry the app can import must be external: a bundled copy brings its
  // own blocks-client-api — a second websocketsService the SDK never connects, so the hook's
  // realtime listeners would never fire.
  '@blocksdiy/react-common/agent-threads',
];

// UMD globals: each external module id → the global the platform's app-render provides on window.
const umdGlobals: Record<string, string> = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'react-dom/client',
  'react/jsx-runtime': 'jsxRuntime',
  'react/compiler-runtime': 'reactCompilerRuntime',
  'react-router': 'react-router',
  '@blocksdiy/blocks-client-sdk/clientSdk':
    '@blocksdiy/blocks-client-sdk/clientSdk',
  '@blocksdiy/blocks-client-sdk/reactSdk':
    '@blocksdiy/blocks-client-sdk/reactSdk',
  '@blocksdiy/blocks-client-sdk/app': '@blocksdiy/blocks-client-sdk/app',
  '@blocksdiy/react-common/agent-chat': '@blocksdiy/react-common/agent-chat',
  '@blocksdiy/react-common/new-agent-chat':
    '@blocksdiy/react-common/new-agent-chat',
  '@blocksdiy/react-common/agent-threads':
    '@blocksdiy/react-common/agent-threads',
};

// CommonJS deps (e.g. react-fast-marquee) call `require("react")` at runtime. Because react & co. are UMD
// externals, the bundler leaves those inner `require(...)` calls literal — and `require` is undefined in
// the browser, so the app crashes ("require is not defined"). This factory-scoped shim resolves a require
// of any external id to the global the platform already provides, so pure-JS CJS npm deps work in the
// compiled bundle. It's a no-op for apps that never call require; non-external requires are bundled by the
// builder so they never reach the shim; an unknown id throws a clear, actionable error.
/**
 * The git branch the workspace has checked out, read per page load so a `git checkout` while the
 * dev server runs takes effect on the next reload. None without git or on a detached HEAD.
 */
const currentGitBranch = (): string | undefined => {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return branch && branch !== 'HEAD' ? branch : undefined;
  } catch {
    return undefined;
  }
};

const umdRequireShim = `var __blocksExternals=${JSON.stringify(umdGlobals)};function require(id){var g=typeof globalThis!=="undefined"?globalThis:this;if(Object.prototype.hasOwnProperty.call(__blocksExternals,id)){var v=g[__blocksExternals[id]];if(v!=null)return v;}throw new Error("[blocks] Cannot require('"+id+"') in the compiled app bundle. Only pure-JS npm dependencies (no native binaries, no install scripts) are supported.");}`;

export default defineConfig(({ mode, command }) => {
  // The dev server and `pnpm preview` serve index.html, which runs src/main.tsx: the app hosts
  // itself, as no platform page is around it, with the platform and app `.env` names.
  const useHtmlEntry = isStandalone || command === 'serve';
  let env = 'production';
  let apiHost = '';
  let appId = '';
  let appVersion: number | undefined;
  if (useHtmlEntry) {
    const envFromFile = loadEnv(mode, __dirname, '');
    apiHost = envFromFile.VITE_BLOCKS_API_HOST ?? '';
    appId = envFromFile.VITE_APP_ID ?? '';
    appVersion = envFromFile.VITE_APP_VERSION
      ? Number(envFromFile.VITE_APP_VERSION)
      : undefined;
    console.log('apiHost', apiHost);
    if (apiHost?.includes('localhost')) {
      env = 'development';
    }
  }
  console.log('env', env);

  // A cloud build's UMD bundle (global `compiler`), from the entry its contract names.
  const umdInput =
    bundleContract === 2
      ? { main: './src/main.tsx' }
      : { main: 'virtual:blocks-app-index' };

  return {
    // Explicit root so dev server finds index.html when run from any cwd (e.g. workspace root)
    root: __dirname,
    plugins: [
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
        // shadcn primitives stay untagged. The plugin appends its attributes AFTER {...props}, so a
        // tagged ui/button.tsx would overwrite the page's <Button> tag on the very same DOM node:
        // select mode would then point at the shared primitive (label "Comp", and an Ella edit there
        // restyles every button in the app) instead of the page instance. See BLK-976.
        excludePaths: ['src/components/ui/**'],
        includeContent: true,
        customAttributes: ({ content }) => {
          const attrs: Record<string, string> = {};
          const staticText = content?.trim();

          // Only set when plugin extracted compile-time JSX text.
          if (staticText) {
            attrs['data-dev-static-text'] = staticText;
          }

          return attrs;
        },
      }),
      react(),
      // @vitejs/plugin-react 6 has no `babel` option; the React Compiler runs through
      // @rolldown/plugin-babel. Its runtime import (`react/compiler-runtime`) is external.
      babel({ presets: [reactCompilerPreset()] }),
      // The two entries (vite-plugin-generate-app-index.js): the generated one of a contract-1
      // cloud build, and the app's src/main.tsx.
      generateAppIndexPlugin({ srcDir: path.resolve(__dirname, 'src') }),
      appEntryPlugin({ srcDir: path.resolve(__dirname, 'src') }),
      {
        // What BlocksApp reads on the dev server, where it hosts the app itself: the platform the
        // app talks to (the SDK's data calls read `__BLOCKS_API_HOST__`), the app the workspace
        // is for, the version to run on (the checked-out git branch's, or `VITE_APP_VERSION`),
        // and the environment.
        name: 'blocks-dev-page',
        transformIndexHtml() {
          const globals = [
            `window.ENV = ${JSON.stringify({ NODE_ENV: env })};`,
            `window.__BLOCKS_DEV__ = ${JSON.stringify({
              apiHost: apiHost || undefined,
              appId: appId || undefined,
              gitBranch: currentGitBranch(),
              appVersion,
            })};`,
            ...(apiHost
              ? [`window.__BLOCKS_API_HOST__ = ${JSON.stringify(apiHost)};`]
              : []),
          ];
          return [
            {
              tag: 'script',
              children: globals.join('\n'),
              injectTo: 'head-prepend',
            },
          ];
        },
      },
    ],
    // The compiler sets BLOCKS_ASSET_BASE to the URL it uploads this bundle to, so the asset URLs
    // in the CSS the bundle injects into app-render's page point there, not at the app's domain
    // (a different host, where /assets/* 403s). A standalone build is served at its own root.
    base: isStandalone ? '/' : process.env.BLOCKS_ASSET_BASE || '/',
    mode: 'production',
    resolve: {
      // Single React instance so react/jsx-runtime resolves with correct exports (avoids "does not provide export named 'jsx'").
      dedupe: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@blocks/client-sdk': '@blocksdiy/blocks-client-sdk/clientSdk',
        '@blocks/react-sdk': '@blocksdiy/blocks-client-sdk/reactSdk',
        '@/product-types': path.resolve(__dirname, './src/product-types.ts'),
        // CJS lodash has no default export in ESM; use ESM build in dev so subpath imports work.
        lodash: 'lodash-es',
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    optimizeDeps: {
      // The SDK ships its React entry as `ReactClientSdk.jsx`, which Vite pre-bundles only when told
      // `.jsx` is optimizable. Served raw, the app's hooks (`reactSdk`) and BlocksApp (`app`,
      // pre-bundled with its own copy of that file) would read two different client contexts.
      extensions: ['.jsx'],
      // CJS deps that don't expose default for ESM; pre-bundle so Vite handles interop.
      // React runtimes: pre-bundle so CJS → ESM gives proper named exports (jsx, jsxs, etc.).
      include: [
        'pusher-js',
        'lodash-es',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
    build: {
      minify: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 2000,
      target: 'es2022',
      // Hidden: written beside the bundle with no sourceMappingURL. The compiler keeps it off S3 and
      // uploads it to Sentry when a token is configured (app-source-maps.ts), so app-render's error reports read as
      // this app's own files. Measured: no build-time cost on a 41k-line app.
      sourcemap: 'hidden',
      cssCodeSplit: true,
      manifest: false,
      outDir: `dist/`,
      rolldownOptions: useHtmlEntry
        ? {
            input: './index.html',
          }
        : {
            treeshake: true,
            preserveEntrySignatures: 'exports-only',
            input: umdInput,
            external: externalDeps,
            output: {
              format: 'umd',
              entryFileNames: () => {
                return `index.js`;
              },
              name: `compiler`,
              // Factory-scoped require shim so CJS deps that require an external (e.g. react) resolve to
              // the platform-provided global instead of crashing on an undefined `require`.
              intro: umdRequireShim,
              globals: umdGlobals,
            },
          },
    },
  };
});
