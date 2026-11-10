/**
 * File-system routing for a bundle built from the generated entry (`virtual:blocks-app-index`,
 * contract 1): the folder structure under `src/routes/` IS the URL structure (conventions:
 * .claude/skills/pages-and-routing). An app's own `src/main.tsx` hands its routes to `BlocksApp`,
 * whose SDK builds the same tree; this copy serves the generated entry only.
 *
 * Vite's eager `import.meta.glob` statically imports every route module — no
 * codegen, no fs walking, no watcher. This module folds that flat module map
 * into the nested tree app-render hands to React Router's `useRoutes`:
 *
 *  - a file                  → a route node (`[x]` → `:x`, `index` → index route,
 *                              `not-found` → the folder's catch-all 404)
 *  - folder WITH layout.tsx  → parent node; children render into its <Outlet/>
 *  - folder WITHOUT layout   → no node; children get compound paths ("admin/Users")
 *
 * The compiler mirrors this derivation when route files sync to blocks
 * (apps/compiler/src/modules/git-sync/fs-routes-path.ts) — keep identical.
 */
import { type ComponentType } from 'react';
import { Outlet } from 'react-router';

export interface BlocksRouteNode {
  /** Route id = file path relative to src/ without extension, e.g. "routes/concerts/[city]". */
  id: string;
  /** Path segment(s) relative to the parent route. */
  path?: string;
  index?: boolean;
  Component: ComponentType;
  children?: BlocksRouteNode[];
}

export interface BlocksRoutes {
  root: { id: string; Component: ComponentType };
  routes: BlocksRouteNode[];
}

const routeModules = import.meta.glob('/src/routes/**/*.tsx', {
  eager: true,
}) as Record<string, { default?: ComponentType }>;

const rootModules = import.meta.glob('/src/root.tsx', {
  eager: true,
}) as Record<string, { default?: ComponentType }>;

/** `[city]` → `:city`, `[...rest]` → `*`, anything else stays literal. */
function mapSegment(segment: string): string {
  const splat = segment.match(/^\[\.\.\..*\]$/);
  if (splat) {
    return '*';
  }
  const param = segment.match(/^\[(.+)\]$/);
  if (param) {
    return `:${param[1]}`;
  }
  return segment;
}

interface Folder {
  files: Map<string, { file: string; Component: ComponentType }>;
  folders: Map<string, Folder>;
}

const newFolder = (): Folder => ({ files: new Map(), folders: new Map() });

function buildFolderTree(
  modules: Record<string, { default?: ComponentType }>,
): Folder {
  const root = newFolder();
  for (const modulePath of Object.keys(modules).sort()) {
    const Component = modules[modulePath]!.default;
    if (!Component) {
      console.error(
        `[blocks] Route module has no default export: ${modulePath}`,
      );
      continue;
    }
    // "/src/routes/concerts/[city].tsx" → ["concerts", "[city].tsx"]
    const segments = modulePath.replace(/^\/src\/routes\//, '').split('/');
    if (segments.some((segment) => segment.startsWith('.'))) {
      continue;
    }
    let folder = root;
    for (const dir of segments.slice(0, -1)) {
      if (!folder.folders.has(dir)) {
        folder.folders.set(dir, newFolder());
      }
      folder = folder.folders.get(dir)!;
    }
    const base = segments[segments.length - 1]!.replace(/\.tsx$/, '');
    folder.files.set(base, {
      file: modulePath.replace(/^\/src\//, ''),
      Component,
    });
  }
  return root;
}

/**
 * Convert a folder into route nodes. `pathPrefix` accumulates the segments of
 * layout-less ancestor folders.
 */
function folderToNodes(folder: Folder, pathPrefix: string): BlocksRouteNode[] {
  const nodes: BlocksRouteNode[] = [];
  const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/');

  for (const [base, entry] of folder.files) {
    if (base === 'layout') {
      continue; // consumed by the parent folder conversion
    }
    const id = entry.file.replace(/\.tsx$/, '');
    if (base === 'index') {
      nodes.push({
        id,
        // An index route matches the parent path. With a layout-less prefix it
        // still needs the accumulated segments as its own path.
        ...(pathPrefix ? { path: pathPrefix } : { index: true }),
        Component: entry.Component,
      });
    } else {
      nodes.push({
        id,
        // `not-found.tsx` is the folder's 404 (Next.js-style): a catch-all
        // matching any URL nothing else in the folder matches. Splats rank
        // lowest in React Router, so it never shadows real routes.
        path: joinPath(
          pathPrefix,
          base === 'not-found' ? '*' : mapSegment(base),
        ),
        Component: entry.Component,
      });
    }
  }

  for (const [dirName, sub] of folder.folders) {
    const segment = mapSegment(dirName);
    const layout = sub.files.get('layout');
    if (layout) {
      nodes.push({
        id: layout.file.replace(/\.tsx$/, ''),
        path: joinPath(pathPrefix, segment),
        Component: layout.Component,
        children: folderToNodes(sub, ''),
      });
    } else {
      // No layout — the folder contributes URL segments only; children are
      // hoisted to this level with compound paths.
      nodes.push(...folderToNodes(sub, joinPath(pathPrefix, segment)));
    }
  }

  return nodes;
}

/**
 * Fold a route module map (glob shape: absolute-from-root paths → modules)
 * into route nodes.
 */
function deriveRouteNodes(
  modules: Record<string, { default?: ComponentType }>,
): BlocksRouteNode[] {
  const root = buildFolderTree(modules);
  const nodes = folderToNodes(root, '');
  // A top-level routes/layout.tsx wraps ALL routes (inside src/root.tsx) —
  // same folder rule as everywhere else, with src/routes/ being the folder.
  // It becomes a pathless layout route so every URL renders through it.
  const rootLayout = root.files.get('layout');
  if (rootLayout) {
    return [
      {
        id: rootLayout.file.replace(/\.tsx$/, ''),
        Component: rootLayout.Component,
        children: nodes,
      },
    ];
  }
  return nodes;
}

const FallbackRoot: ComponentType = () => <Outlet />;

export function buildBlocksRoutes(): BlocksRoutes {
  const rootModule = Object.values(rootModules)[0];
  return {
    root: { id: 'root', Component: rootModule?.default ?? FallbackRoot },
    routes: deriveRouteNodes(routeModules),
  };
}
