// vite-plugin-generate-app-index.js
//
// Two plugins for the two ways an app's bundle starts:
//
//  - generateAppIndexPlugin: a cloud build of contract 1 (`BLOCKS_BUNDLE_CONTRACT=1`,
//    see vite.config.ts). It fabricates the entry module (`virtual:blocks-app-index`),
//    whose exports app-render reads off `window.compiler`. Two routing modes,
//    detected from the filesystem:
//
//    - ROUTES mode (current): `src/routes/` has at least one .tsx route module.
//      The tree itself is built by vite-plugin-generate-app-index.route-tree.tsx
//      via import.meta.glob (folder structure = URL); this plugin only emits a few
//      lines calling it, exported as `__blocksRoutes`.
//
//    - LEGACY pages mode: flat `src/pages/*.tsx` + single `src/layout.tsx`,
//      kept for unmigrated apps/clones. Emits `AppLayout` + one named export
//      per page (app-render treats every non-AppLayout export as a page).
//
//  - appEntryPlugin: the app's own `src/main.tsx` is the entry (the dev server,
//    `pnpm preview`, a standalone build, and a cloud build of contract 2, the
//    default). `BlocksApp` gets the app's modules, not their source, so the two
//    decisions that read source are made here, as the generated entry makes
//    them: the RTL stamp and the legacy layout's Toaster.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const VIRTUAL_ID = 'virtual:blocks-app-index';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

const ROUTE_TREE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'vite-plugin-generate-app-index.route-tree.tsx',
);

// Layout export name expected by app-render's DataProvider in LEGACY mode
// (destructured out of window.compiler so it is not mistaken for a page).
const LAYOUT_EXPORT_NAME = 'AppLayout';

// The app's chat-component renderer (the agent-chat registry item), exposed on the bundle so
// app-render can preview a chat component with the app's own UI kit, theme and SDK when the
// platform asks (IframeApi.onPreviewChatComponent). Present only when the app has the file;
// app-render destructures the export out in LEGACY mode so it is not mistaken for a page.
const CHAT_COMPONENT_RENDERER_EXPORT_NAME = '__agentChatCodeComponent';
const CHAT_COMPONENT_RENDERER_IMPORT_PATH =
  '@/components/ui/agent-chat-code-component';

function chatComponentRendererFile(srcDir) {
  return path.join(srcDir, 'components', 'ui', 'agent-chat-code-component.tsx');
}

/** The renderer export line, or nothing for an app without the agent-chat item. */
function chatComponentRendererLines(srcDir) {
  return fs.existsSync(chatComponentRendererFile(srcDir))
    ? [
        `export * as ${CHAT_COMPONENT_RENDERER_EXPORT_NAME} from ${JSON.stringify(CHAT_COMPONENT_RENDERER_IMPORT_PATH)};`,
      ]
    : [];
}

function toIdentifier(value, fallback) {
  const cleaned = value.replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(cleaned) ? cleaned : `_${cleaned || fallback}`;
}

function walkTsxFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      out.push(fullPath);
    }
  }
  return out;
}

/** Routes mode is active when src/routes/ contains at least one .tsx route module. */
function hasRouteModules(srcDir) {
  return walkTsxFiles(path.join(srcDir, 'routes')).length > 0;
}

// RTL apps (`rtl: true` in components.json, set by `shadcn init --rtl`) get the document
// direction stamped into the entry (the generated module, or the app's src/main.tsx), so it
// runs at bundle evaluation — before anything mounts. The document element
// is the ancestor of portaled content (dialogs, selects, menus), which a wrapper div's
// `dir` never reaches. App code may still override it at runtime (language switcher) —
// effects run after module evaluation.
function readAppRtl(srcDir) {
  try {
    const componentsJson = path.join(srcDir, '..', 'components.json');
    return JSON.parse(fs.readFileSync(componentsJson, 'utf-8')).rtl === true;
  } catch {
    // Pre-init or unreadable — LTR default, nothing stamped.
    return false;
  }
}

const RTL_STAMP_LINE =
  "if (typeof document !== 'undefined') { document.documentElement.dir = 'rtl'; }";

// ---------------------------------------------------------------------------
// ROUTES mode
// ---------------------------------------------------------------------------

/**
 * Routes mode entry: the tree itself is built by the route-tree module via
 * import.meta.glob — the plugin only wires the entry exports. No Toaster
 * auto-mount here (unlike legacy mode): migrated apps get the Toaster baked
 * into their generated src/root.tsx by the migration, and new apps render it
 * in root.tsx themselves.
 */
function generateRoutesModule(srcDir) {
  const lines = ["import '@/index.css';"];
  if (readAppRtl(srcDir)) {
    lines.push(RTL_STAMP_LINE);
  }
  lines.push(
    `import { buildBlocksRoutes } from ${JSON.stringify(ROUTE_TREE_FILE)};`,
  );
  lines.push('export const __blocksRoutes = buildBlocksRoutes();');
  lines.push(...chatComponentRendererLines(srcDir));
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// LEGACY pages mode (unchanged behavior)
// ---------------------------------------------------------------------------

function collectPages(pagesDir) {
  const files = walkTsxFiles(pagesDir).sort();
  return files.map((file) => {
    const relFromPages = path
      .relative(pagesDir, file)
      .split(path.sep)
      .join('/')
      .replace(/\.tsx$/, '');
    return {
      // Filename (path relative to src/pages, without extension) is the id/name.
      id: relFromPages,
      name: relFromPages,
      importPath: `@/pages/${relFromPages}`,
    };
  });
}

/**
 * Legacy compatibility: apps built when the platform pre-installed shadcn were written against an
 * auto-mounted sonner <Toaster/>, so their layouts never render one. A pages-mode app gets it
 * mounted when it has sonner installed but its layout doesn't mention Toaster; a current-model
 * layout that renders one explicitly turns this off and avoids double-mounting (two Toasters show
 * every toast twice).
 */
function layoutNeedsToaster(srcDir) {
  const layoutPath = path.join(srcDir, 'layout.tsx');
  if (
    hasRouteModules(srcDir) ||
    !fs.existsSync(layoutPath) ||
    !fs.existsSync(path.join(srcDir, 'components', 'ui', 'sonner.tsx'))
  ) {
    return false;
  }
  try {
    return !fs.readFileSync(layoutPath, 'utf-8').includes('Toaster');
  } catch {
    return false;
  }
}

function generateLegacyPagesModule(srcDir) {
  const pages = collectPages(path.join(srcDir, 'pages'));
  const hasLayout = fs.existsSync(path.join(srcDir, 'layout.tsx'));
  const autoMountToaster = layoutNeedsToaster(srcDir);

  const lines = ["import '@/index.css';"];

  if (readAppRtl(srcDir)) {
    lines.push(RTL_STAMP_LINE);
  }

  if (hasLayout) {
    lines.push("import React from 'react';");
    if (autoMountToaster) {
      lines.push("import { Toaster } from '@/components/ui/sonner';");
    }
    lines.push("import Layout from '@/layout';");
  }

  const usedExportNames = new Set([LAYOUT_EXPORT_NAME]);
  pages.forEach((page, index) => {
    const importVar = `__page${index}`;
    lines.push(`import ${importVar} from ${JSON.stringify(page.importPath)};`);

    let exportName = toIdentifier(page.name, `Page${index}`);
    while (usedExportNames.has(exportName)) {
      exportName = `${exportName}_`;
    }
    usedExportNames.add(exportName);

    lines.push(
      `export const ${exportName} = { id: ${JSON.stringify(page.id)}, name: ${JSON.stringify(page.name)}, component: ${importVar} };`,
    );
  });

  if (hasLayout) {
    lines.push(
      autoMountToaster
        ? 'const __LayoutComponent = ({ children }) => React.createElement(React.Fragment, null, React.createElement(Layout, { children }), React.createElement(Toaster));'
        : 'const __LayoutComponent = ({ children }) => React.createElement(Layout, { children });',
    );
    // Must be named `AppLayout` so app-render's DataProvider picks it up as the layout.
    lines.push(
      `export const ${LAYOUT_EXPORT_NAME} = { id: ${JSON.stringify(LAYOUT_EXPORT_NAME)}, name: ${JSON.stringify(LAYOUT_EXPORT_NAME)}, component: __LayoutComponent };`,
    );
  }

  // Only AppLayout, the chat-component renderer and page named exports may be present, because
  // app-render treats every other named export as a page.
  const rendererLines = chatComponentRendererLines(srcDir);
  lines.push(...rendererLines);
  // A module without exports gives a UMD bundle that sets no `window.compiler`, leaving the last
  // bundle's in place; an app with no code exports the routes app-render reads as none.
  if (!hasLayout && pages.length === 0 && rendererLines.length === 0) {
    lines.push('export const __blocksRoutes = undefined;');
  }

  return lines.join('\n') + '\n';
}

function generateModule(srcDir) {
  if (hasRouteModules(srcDir)) {
    return generateRoutesModule(srcDir);
  }
  return generateLegacyPagesModule(srcDir);
}

/**
 * The generated entry of a contract-1 cloud build (see the header).
 *
 * @param {{ srcDir: string }} options
 */
export function generateAppIndexPlugin({ srcDir }) {
  return {
    name: 'blocks-generate-app-index',
    apply: 'build',
    resolveId: {
      filter: { id: exactly(VIRTUAL_ID) },
      handler: () => RESOLVED_VIRTUAL_ID,
    },
    load: {
      filter: { id: exactly(RESOLVED_VIRTUAL_ID) },
      handler: () => generateModule(srcDir),
    },
  };
}

const LAYOUT_WITH_TOASTER_ID = '\0blocks-layout-with-toaster';

/** A hook filter matching one id, so the bundler calls the hook for no other module. */
function exactly(id) {
  return new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/**
 * The app's own `src/main.tsx` as the entry (see the header): prepends the RTL stamp to it, and
 * hands its glob a layout wrapped with the legacy Toaster when {@link layoutNeedsToaster}. The
 * app's files on disk are untouched.
 *
 * @param {{ srcDir: string }} options
 */
export function appEntryPlugin({ srcDir }) {
  const mainFile = path.join(srcDir, 'main.tsx');
  const layoutFile = path.join(srcDir, 'layout.tsx');
  const inputs = [
    layoutFile,
    path.join(srcDir, 'components', 'ui', 'sonner.tsx'),
    path.join(srcDir, '..', 'components.json'),
  ];

  return {
    name: 'blocks-app-entry',
    // Before Vite's resolver, so the entry's import of its layout can be redirected.
    enforce: 'pre',
    resolveId: {
      filter: { id: /layout(\.tsx)?$/ },
      handler(source, importer) {
        if (
          importer === mainFile &&
          path.resolve(path.dirname(importer), source) === layoutFile &&
          layoutNeedsToaster(srcDir)
        ) {
          return LAYOUT_WITH_TOASTER_ID;
        }
        return null;
      },
    },
    load: {
      filter: { id: exactly(LAYOUT_WITH_TOASTER_ID) },
      handler() {
        const layout = JSON.stringify(layoutFile);
        return [
          "import React from 'react';",
          "import { Toaster } from '@/components/ui/sonner';",
          `import Layout from ${layout};`,
          `export * from ${layout};`,
          'export default function LayoutWithToaster({ children }) {',
          '  return React.createElement(React.Fragment, null, React.createElement(Layout, { children }), React.createElement(Toaster));',
          '}',
        ].join('\n');
      },
    },
    transform: {
      filter: { id: exactly(mainFile) },
      handler(code) {
        if (readAppRtl(srcDir)) {
          // On the entry's first line, a comment, so every line keeps its number.
          return { code: `${RTL_STAMP_LINE}${code}`, map: null };
        }
        return null;
      },
    },
    configureServer(server) {
      // Both decisions read these files' presence or content: re-run them from the entry down.
      const rerun = (file) => {
        if (!inputs.includes(path.resolve(file))) {
          return;
        }
        const mod = server.moduleGraph.getModuleById(mainFile);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', rerun);
      server.watcher.on('unlink', rerun);
      server.watcher.on('change', rerun);
    },
  };
}
