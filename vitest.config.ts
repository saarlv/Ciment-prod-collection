import { defineConfig } from 'vitest/config';
import path, { resolve } from 'path';
import { fileURLToPath } from 'url';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  test: {
    environment: 'jsdom',
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@blocks/client-sdk': '@blocksdiy/blocks-client-sdk/clientSdk',
      '@blocks/react-sdk': '@blocksdiy/blocks-client-sdk/reactSdk',
    },
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // The app's tests live in the top-level `test/` folder (a sibling of `src/`) — the only place
    // they round-trip to Blocks as `test`-subtype blocks and survive a sync. Scoping the run to it
    // keeps a stray spec left inside `src/` from passing here and then vanishing on the next
    // materialize, which rebuilds the working dir from blocks.
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    // Some deps ship components that import their own CSS (@copilotkit/react-core's
    // dist/v2/index.css, streamdown/styles.css). vitest externalizes node_modules by
    // default, so Node — which cannot import .css — throws `Unknown file extension
    // ".css"` and any test that mounts an agent-chat page fails. Inlining these packages
    // routes them through Vite, which handles the CSS import. Keep this list minimal.
    server: {
      deps: {
        inline: [/@copilotkit\//, /@blocksdiy\/react-common/, /streamdown/],
      },
    },
    // e2e specs under test/e2e are Playwright scripts the browser verifier writes via the Playwright MCP —
    // the boilerplate ships NO Playwright dependency, so exclude them here; vitest runs only unit tests.
    // (code-actions/** has its own runner, vitest.code-actions.config.ts / `pnpm test:action`, and the
    // include above already keeps it out of this one.)
    exclude: ['**/node_modules/**', '**/dist/**', 'test/e2e/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@blocks/client-sdk': '@blocksdiy/blocks-client-sdk/clientSdk',
      '@blocks/react-sdk': '@blocksdiy/blocks-client-sdk/reactSdk',
    },
  },
});
