// blocks-framework-routes.js
//
// The route config of a framework build (`react-router build`, bundle contract 3): the app's
// `src/routes/` folder as React Router route modules, so each page is its own chunk and each
// fixed-address page can be prerendered to HTML. The convention is the one the SDK's
// `app-shape/route-tree.tsx` folds an eager glob into, and the compiler's
// `git-sync/fs-routes-path.ts` mirrors; keep the three identical:
//
//  - a file                  → a route (`[x]` → `:x`, `[...x]` → `*`, `index` → index route,
//                              `not-found` → the folder's catch-all 404)
//  - folder WITH layout.tsx  → parent route; children render into its <Outlet/>
//  - folder WITHOUT layout   → no route; children get compound paths ("admin/users")
//  - `routes/layout.tsx`     → a pathless layout around every route
//
// Route ids are the module's path from `src/` without `.tsx` (`routes/products/[id]`), as the
// SDK's tree names them: the builder's page list and error reports key on them.
import fs from 'fs';
import path from 'path';

/** `[city]` → `:city`, `[...rest]` → `*`, anything else stays literal. */
function mapSegment(segment) {
  if (/^\[\.\.\..*\]$/.test(segment)) {
    return '*';
  }
  const param = segment.match(/^\[(.+)\]$/);
  return param ? `:${param[1]}` : segment;
}

function readFolder(dir) {
  const files = new Map();
  const folders = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { files, folders };
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      folders.set(entry.name, readFolder(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.set(entry.name.replace(/\.tsx$/, ''), full);
    }
  }
  return { files, folders };
}

const joinPath = (...parts) => parts.filter(Boolean).join('/');

/**
 * The route config entries for `src/routes/`, with `file` relative to `appDirectory` (React
 * Router resolves route files from there).
 */
export function blocksRouteConfig({ srcDir, appDirectory }) {
  const routesDir = path.join(srcDir, 'routes');
  const toEntry = (full, extra) => ({
    id: path
      .relative(srcDir, full)
      .replace(/\.tsx$/, '')
      .split(path.sep)
      .join('/'),
    file: path.relative(appDirectory, full).split(path.sep).join('/'),
    ...extra,
  });

  const folderToRoutes = (folder, pathPrefix) => {
    const routes = [];
    for (const [base, full] of folder.files) {
      if (base === 'layout') {
        continue;
      }
      if (base === 'index') {
        routes.push(
          toEntry(full, pathPrefix ? { path: pathPrefix } : { index: true }),
        );
      } else {
        routes.push(
          toEntry(full, {
            path: joinPath(
              pathPrefix,
              base === 'not-found' ? '*' : mapSegment(base),
            ),
          }),
        );
      }
    }
    for (const [dirName, sub] of folder.folders) {
      const segment = mapSegment(dirName);
      const layout = sub.files.get('layout');
      if (layout) {
        routes.push(
          toEntry(layout, {
            path: joinPath(pathPrefix, segment),
            children: folderToRoutes(sub, ''),
          }),
        );
      } else {
        routes.push(...folderToRoutes(sub, joinPath(pathPrefix, segment)));
      }
    }
    return routes;
  };

  const top = readFolder(routesDir);
  const routes = folderToRoutes(top, '');
  // The default 404, where the app has no catch-all of its own at the top: it ranks below every
  // real route, as React Router ranks splats.
  if (!routes.some((route) => route.path === '*')) {
    routes.push({ id: 'blocks/not-found', path: '*', file: 'not-found.tsx' });
  }
  const rootLayout = top.files.get('layout');
  return rootLayout ? [toEntry(rootLayout, { children: routes })] : routes;
}

/**
 * The app's pages as the platform's SEO reads them (Crawlable Pages: per-page metadata, 404s, the
 * sitemap): each page's full URL pattern without a leading slash (`''` for home, `products/:id`,
 * `*`), and whether it is a not-found page, which shares a splat's pattern but serves no page.
 * Layouts are not pages; their children carry the layout's path.
 */
export function blocksPageRoutes(routes) {
  const pages = [];
  const walk = (entries, prefix) => {
    for (const entry of entries) {
      const full = joinPath(prefix, entry.path ?? '');
      if (entry.children) {
        walk(entry.children, full);
        continue;
      }
      const isNotFound = /(^|\/)not-found$/.test(entry.id);
      pages.push(isNotFound ? { path: full, notFound: true } : { path: full });
    }
  };
  walk(routes, '');
  return pages;
}
