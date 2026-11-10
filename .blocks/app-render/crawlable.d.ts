/**
 * AUTO-GENERATED — do not edit by hand.
 * Copied from apps/app-render/lambda-edge/origin-response-seo-injector/crawlable.d.ts
 * via apps/compiler/scripts/bundle-app-render-hosted.mjs
 * Regenerate: pnpm --filter @blockscom/compiler run bundle:app-render-hosted
 */
// Types for crawlable.js, which app-render's dev server and a framework build's SEO files import.

export interface CrawlableAppData {
  id?: string;
  isPublic?: boolean;
  name?: string;
  description?: string;
  coverImageUrl?: string;
  faviconUrl?: string;
  color?: string;
  routes?: { path: string; notFound?: boolean }[];
  crawlScope?: { root: string; excluded: string[] };
  seoConfig?: {
    crawlablePages?: boolean;
    canonicalUrl?: string;
    robotsDirective?: string;
    redirects?: { from: string; to: string; permanent?: boolean }[];
    pageOverrides?: { routePath: string; metaTitle?: string; metaDescription?: string; ogImage?: string }[];
    metaTitle?: string;
    metaDescription?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    themeColor?: string;
    locale?: string;
    twitterCardType?: string;
    additionalRobotsDirectives?: string[];
  };
}

export interface CrawlableResponse {
  status: number;
  location?: string;
  contentType?: string;
  body?: string;
}

export function normalizePath(uri: unknown): string;
export function isCrawlable(data: CrawlableAppData | null | undefined): boolean;
export function isPrivateApp(data: CrawlableAppData | null | undefined): boolean;
export const PRIVATE_ROBOTS_TXT: string;
export const PRIVATE_ROBOTS_DIRECTIVE: string;
export function isPlatformPath(path: string): boolean;
export function routeMatches(pattern: string, path: string): boolean;
export function matchRoute(data: CrawlableAppData | null | undefined, path: string): { path: string } | null;
export function resolvePageStatus(data: CrawlableAppData | null | undefined, path: string): 200 | 404;
export function siteBaseUrl(seo: CrawlableAppData["seoConfig"], host: string): string;
export function buildCanonicalUrl(data: CrawlableAppData | null | undefined, host: string, path: string): string;
export function findPageOverride(
  data: CrawlableAppData | null | undefined,
  path: string,
): { metaTitle?: string; metaDescription?: string; ogImage?: string } | null;
export function buildRobotsTxt(data: CrawlableAppData, host: string): string;
export function buildSitemapXml(data: CrawlableAppData, host: string): string;
export function resolveCrawlableResponse(input: {
  data: CrawlableAppData | null | undefined;
  host: string;
  path: string;
  querystring?: string;
}): CrawlableResponse | null;
export interface PageMetadata {
  title: string;
  description: string;
  robots: string;
  canonical: string;
  /** "" when unset or not a hex colour. */
  themeColor: string;
  /** "" unless an absolute URL. */
  favicon: string;
  siteName: string;
  locale: string;
  ogTitle: string;
  ogDescription: string;
  /** "" unless an absolute URL. */
  ogImage: string;
  twitterCard: string;
}
export function pageMetadata(data: CrawlableAppData | null | undefined, host: string, path?: string): PageMetadata;
export function escapeHtml(text: unknown): string;
/** The page's metadata as the <head> tags the edge writes into a page that has none of its own. */
export function buildMetadataHtml(data: CrawlableAppData | null | undefined, host: string, path?: string): string;
