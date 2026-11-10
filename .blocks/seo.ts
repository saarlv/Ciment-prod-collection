// The app's public settings and address, and its pages, as the build was given them
// (vite.framework.config.ts): what each page's metadata, robots.txt and sitemap.xml render from.
import type { CrawlableAppData } from './app-render/crawlable.js';

declare const __BLOCKS_SEO__: { host: string; data: CrawlableAppData };

export const seo = __BLOCKS_SEO__;
