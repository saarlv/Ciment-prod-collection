import path from 'path';
import { fileURLToPath } from 'url';
import { route, type RouteConfig } from '@react-router/dev/routes';
import { blocksRouteConfig } from '../blocks-framework-routes.js';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

/**
 * Crawlable Pages on a public app: its robots.txt and sitemap.xml are written out with its pages.
 * Only in a prerendered build, the one place a route of ours may have a loader without a server.
 */
const hasSeoFiles = (() => {
  if (process.env.BLOCKS_PRERENDER !== '1') {
    return false;
  }
  try {
    const { data } = JSON.parse(process.env.BLOCKS_SEO || '{}');
    return data?.isPublic === true && data?.seoConfig?.crawlablePages === true;
  } catch {
    return false;
  }
})();

export default [
  ...blocksRouteConfig({
    srcDir: path.resolve(appDirectory, '../src'),
    appDirectory,
  }),
  ...(hasSeoFiles
    ? [
        route('robots.txt', './robots.txt.ts'),
        route('sitemap.xml', './sitemap.xml.ts'),
      ]
    : []),
] satisfies RouteConfig;
