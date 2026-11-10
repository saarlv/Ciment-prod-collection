// sitemap.xml of a crawlable public app, written out at build time (prerendered).
import { buildSitemapXml } from './app-render/crawlable.js';
import { seo } from './seo';

export function loader() {
  return new Response(buildSitemapXml(seo.data, seo.host), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
