// robots.txt of a crawlable public app, written out at build time (prerendered).
import { buildRobotsTxt } from './app-render/crawlable.js';
import { seo } from './seo';

export function loader() {
  return new Response(buildRobotsTxt(seo.data, seo.host), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
