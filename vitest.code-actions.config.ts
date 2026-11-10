import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHARED_DIR = path.resolve(__dirname, 'code-actions/shared');

/**
 * Mid-era / legacy flat names under shared/ → current locations.
 * Also used for `./blocks-client.ts` (deploy copies those into action/).
 */
const PLATFORM_PATH_REMAP: Record<string, string> = {
  'blocks-client.ts': 'blocks/blocks-client.ts',
  'blocks-client-mappings.ts': 'blocks/blocks-client-mappings.ts',
  'browsing.ts': 'blocks/browsing.ts',
  'index.ts': 'blocks/index.ts',
  'testing.ts': 'testing/testing.ts',
};

/**
 * Resolve imports of shared scaffold / app modules from action folders:
 * - Preferred: `../shared/blocks/…`, `../shared/testing/testing.ts`, `../shared/foo.ts`
 * - Mid-era: `../shared/blocks-client.ts` → blocks/
 * - Legacy: `./blocks-client.ts` (deploy copies into action/)
 */
function codeActionSharedResolver(): Plugin {
  return {
    name: 'code-action-shared-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) {
        return null;
      }
      const importerDir = path.dirname(importer);
      if (
        importerDir === SHARED_DIR ||
        !importerDir.includes(`${path.sep}code-actions${path.sep}`) ||
        importerDir.includes(`${path.sep}shared${path.sep}`) ||
        importerDir.endsWith(`${path.sep}shared`)
      ) {
        return null;
      }

      // From action root: ../shared/… ; from tests/: ../../shared/…
      const sharedPrefix = source.match(/^(?:\.\.\/)+shared\//);
      if (sharedPrefix) {
        const rest = source.slice(sharedPrefix[0].length);
        const remapped = PLATFORM_PATH_REMAP[rest] ?? rest;
        return path.join(SHARED_DIR, remapped);
      }
      if (source.startsWith('./') && PLATFORM_PATH_REMAP[source.slice(2)]) {
        return path.join(SHARED_DIR, PLATFORM_PATH_REMAP[source.slice(2)]!);
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [codeActionSharedResolver()],
  test: {
    environment: 'node',
    globals: true,
    include: ['code-actions/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'code-actions/shared/**'],
    env: {
      BLOCKS_BASE_PATH: 'http://localhost:0',
    },
  },
});
