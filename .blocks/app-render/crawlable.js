/**
 * AUTO-GENERATED — do not edit by hand.
 * Copied from apps/app-render/lambda-edge/origin-response-seo-injector/crawlable.js
 * via apps/compiler/scripts/bundle-app-render-hosted.mjs
 * Regenerate: pnpm --filter @blockscom/compiler run bundle:app-render-hosted
 */
/**
 * Path-aware SEO decisions for a published app: canonical URLs, per-page metadata, 404 status,
 * redirects, robots.txt and sitemap.xml.
 *
 * Shared by the origin-response Lambda@Edge (index.js, production) and app-render's dev-server
 * plugin (apps/app-render/vite.config.ts, native-dev), so both serve the same answers. Pure
 * functions only: no AWS SDK, no fetch, no Node-only APIs — the Lambda zip must include this
 * file next to index.js.
 *
 * Inputs are the get-app-data-by-domain response (`data`) and the path the visitor asked for.
 * The "Crawlable pages" setting (`seoConfig.crawlablePages`, public apps only) gates everything
 * except the per-path canonical for apps without a custom canonical URL, which is a plain fix.
 */

/** Paths app-render serves itself (login, magic links); never a 404, never in the sitemap. */
const PLATFORM_PATH_PREFIX = "/auth";

const MAX_REDIRECTS = 500;
const MAX_SITEMAP_URLS = 5000;

/**
 * @param {unknown} text
 * @returns {string}
 */
function escapeXml(text) {
  if (typeof text !== "string") return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * @param {string} segment
 * @returns {string}
 */
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The path as a stable key: leading slash, no trailing slash (except "/"), no repeated slashes,
 * no query string. "/index.html" is the root (the origin-request Lambda's rewrite target).
 * @param {unknown} uri
 * @returns {string}
 */
export function normalizePath(uri) {
  if (typeof uri !== "string" || !uri.startsWith("/")) return "/";
  let path = uri.split("?")[0].replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path === "/index.html") return "/";
  return path || "/";
}

/**
 * @param {Record<string, any> | null | undefined} data
 * @returns {boolean}
 */
export function isCrawlable(data) {
  return Boolean(data && data.isPublic === true && data.seoConfig && data.seoConfig.crawlablePages === true);
}

/**
 * A private app (signed-in users only). Unknown visibility (no app data) is not private: nothing
 * changes for it.
 * @param {Record<string, any> | null | undefined} data
 * @returns {boolean}
 */
export function isPrivateApp(data) {
  return Boolean(data && data.isPublic === false);
}

/** What a private app tells search engines, in its robots.txt and on each page (X-Robots-Tag). */
export const PRIVATE_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
export const PRIVATE_ROBOTS_DIRECTIVE = "noindex, nofollow";

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isPlatformPath(path) {
  return path === PLATFORM_PATH_PREFIX || path.startsWith(`${PLATFORM_PATH_PREFIX}/`);
}

/**
 * The app's page routes (not the not-found catch-all). Empty for legacy pages-mode apps, whose
 * page blocks carry no route pattern; callers must then skip 404 matching entirely.
 * @param {Record<string, any> | null | undefined} data
 * @returns {{ path: string, notFound?: boolean }[]}
 */
function pageRoutes(data) {
  if (!data || !Array.isArray(data.routes)) return [];
  return data.routes.filter((route) => route && typeof route.path === "string" && route.notFound !== true);
}

/**
 * Whether a page (route pattern, "" for home) is in what search engines crawl: the public
 * mini-app's tree (`data.crawlScope.root`, "" = the whole app), minus the other mini-apps' trees.
 * No scope (an older API) means the whole app.
 * @param {Record<string, any> | null | undefined} data
 * @param {string} routePath
 * @returns {boolean}
 */
export function isInCrawlScope(data, routePath) {
  const scope = data && data.crawlScope;
  if (!scope || typeof scope.root !== "string") return true;
  const path = routePath.replace(/^\/+|\/+$/g, "").toLowerCase();
  const within = (tree) => typeof tree === "string" && (tree === "" || path === tree || path.startsWith(`${tree}/`));
  return within(scope.root) && !(Array.isArray(scope.excluded) ? scope.excluded : []).some(within);
}

/**
 * Whether a route pattern ("concerts/:city", "files/*", "" for the root index) matches the path,
 * the way React Router matches it: case-insensitive literals, ":param" for one segment, "*" for
 * the rest (zero or more segments).
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
export function routeMatches(pattern, path) {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);
  for (let i = 0; i < patternSegments.length; i++) {
    const segment = patternSegments[i];
    if (segment === "*") return true;
    if (i >= pathSegments.length) return false;
    if (segment.startsWith(":")) continue;
    if (safeDecode(segment).toLowerCase() !== safeDecode(pathSegments[i]).toLowerCase()) return false;
  }
  return pathSegments.length === patternSegments.length;
}

/**
 * The page route serving the path, preferring the most specific: literal routes over parameter
 * routes over splats, as React Router ranks them.
 * @param {Record<string, any> | null | undefined} data
 * @param {string} path
 * @returns {{ path: string } | null}
 */
export function matchRoute(data, path) {
  const score = (pattern) =>
    pattern
      .split("/")
      .filter(Boolean)
      .reduce((total, segment) => total + (segment === "*" ? 0 : segment.startsWith(":") ? 2 : 3), 0);
  const matches = pageRoutes(data).filter((route) => routeMatches(route.path, path));
  if (matches.length === 0) return null;
  return matches.reduce((best, route) => (score(route.path) > score(best.path) ? route : best));
}

/**
 * HTTP status for the page: 404 when the app is crawlable, has a route table, and no page route
 * (or only the not-found catch-all) matches. Everything else stays 200 — the shell still renders
 * the app's own not-found page either way.
 * @param {Record<string, any> | null | undefined} data
 * @param {string} path
 * @returns {200 | 404}
 */
export function resolvePageStatus(data, path) {
  if (!isCrawlable(data) || isPlatformPath(path)) return 200;
  if (pageRoutes(data).length === 0) return 200;
  return matchRoute(data, path) ? 200 : 404;
}

/**
 * @param {unknown} url
 * @returns {URL | null}
 */
function parseHttpUrl(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * The site's public origin (plus base path, if the custom canonical has one), no trailing slash.
 * @param {Record<string, any>} seo
 * @param {string} host
 * @returns {string}
 */
export function siteBaseUrl(seo, host) {
  const custom = parseHttpUrl(seo && seo.canonicalUrl);
  if (custom) return `${custom.origin}${custom.pathname.replace(/\/+$/, "")}`;
  return `https://${host}`;
}

/**
 * Canonical URL for the path.
 * - No custom canonical: the page's own URL (every app; today every page claims the homepage).
 * - Custom canonical on a crawlable app: the custom base plus the page's path.
 * - Custom canonical otherwise: used as-is, unchanged from before, since an owner may point every
 *   page somewhere on purpose.
 * @param {Record<string, any> | null | undefined} data
 * @param {string} host
 * @param {string} path
 * @returns {string}
 */
export function buildCanonicalUrl(data, host, path) {
  const seo = (data && data.seoConfig) || {};
  const custom = parseHttpUrl(seo.canonicalUrl);
  if (custom && (!isCrawlable(data) || path === "/")) return seo.canonicalUrl;
  return `${siteBaseUrl(seo, host)}${path === "/" ? "" : path}`;
}

/**
 * Per-page title/description/image set in settings for the page route serving the path.
 * @param {Record<string, any> | null | undefined} data
 * @param {string} path
 * @returns {{ metaTitle?: string, metaDescription?: string, ogImage?: string } | null}
 */
export function findPageOverride(data, path) {
  if (!isCrawlable(data)) return null;
  const overrides = data.seoConfig.pageOverrides;
  if (!Array.isArray(overrides) || overrides.length === 0) return null;
  const route = matchRoute(data, path);
  if (!route) return null;
  return overrides.find((override) => override && override.routePath === route.path) || null;
}

/**
 * What a page's metadata says, as plain values: the edge writes them into the shell's <head>, and
 * a framework build's root `meta` renders them. Page overrides (crawlable apps) win over the
 * app-wide settings, which win over the app's own name, description and cover image.
 * @param {Record<string, any> | null | undefined} data
 * @param {string} host
 * @param {string} path
 */
export function pageMetadata(data, host, path = "/") {
  const seo = (data && data.seoConfig) || {};
  const page = findPageOverride(data, path) || {};
  const name = (data && data.name) || "Blocks App";
  const title = page.metaTitle || seo.metaTitle || name;
  const description = page.metaDescription || seo.metaDescription || (data && data.description) || "";
  const robotsDirective = seo.robotsDirective || "index,follow";
  const additionalDirectives = Array.isArray(seo.additionalRobotsDirectives)
    ? seo.additionalRobotsDirectives.filter((d) => typeof d === "string" && d.length < 50)
    : [];
  const themeColor = seo.themeColor || (data && data.color) || "";
  const favicon = (data && data.faviconUrl) || "";
  const ogTitle = page.metaTitle || seo.ogTitle || title;
  const ogImage = page.ogImage || seo.ogImage || (data && data.coverImageUrl) || "";
  return {
    title,
    description,
    robots: [robotsDirective, ...additionalDirectives].join(", "),
    canonical: buildCanonicalUrl(data, host, path),
    themeColor: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(themeColor) ? themeColor : "",
    favicon: favicon.startsWith("http") ? favicon : "",
    siteName: name,
    locale: seo.locale || "en_US",
    ogTitle,
    ogDescription: page.metaDescription || seo.ogDescription || description,
    ogImage: ogImage.startsWith("http") ? ogImage : "",
    twitterCard: seo.twitterCardType || "summary_large_image",
  };
}

/**
 * @param {Record<string, any>} data
 * @param {string} path
 * @param {string} querystring
 * @returns {{ status: number, location: string } | null}
 */
function findRedirect(data, path, querystring) {
  const redirects = data.seoConfig.redirects;
  if (!Array.isArray(redirects)) return null;
  const wanted = path.toLowerCase();
  for (const redirect of redirects.slice(0, MAX_REDIRECTS)) {
    if (!redirect || typeof redirect.from !== "string" || typeof redirect.to !== "string") continue;
    if (normalizePath(redirect.from).toLowerCase() !== wanted) continue;
    const to = redirect.to;
    const isPath = to.startsWith("/") && !to.startsWith("//");
    if ((!isPath && !parseHttpUrl(to)) || /[\r\n]/.test(to)) continue;
    if (isPath && normalizePath(to).toLowerCase() === wanted) continue;
    const location = querystring && !to.includes("?") ? `${to}?${querystring}` : to;
    return { status: redirect.permanent === false ? 302 : 301, location };
  }
  return null;
}

/**
 * @param {Record<string, any>} data
 * @returns {boolean}
 */
function isNoIndex(data) {
  const directive = data.seoConfig.robotsDirective;
  return typeof directive === "string" && directive.startsWith("noindex");
}

/**
 * @param {Record<string, any>} data
 * @param {string} host
 * @returns {string}
 */
export function buildRobotsTxt(data, host) {
  if (isNoIndex(data)) return "User-agent: *\nDisallow: /\n";
  // The app's other mini-apps (a login-only portal, an agent's chats) aren't for search engines
  const excluded = Array.isArray(data.crawlScope?.excluded) ? data.crawlScope.excluded : [];
  const disallowed = [
    PLATFORM_PATH_PREFIX,
    ...excluded.filter((route) => typeof route === "string" && route).map((route) => `/${route}`),
  ];
  const disallowLines = disallowed.map((path) => `Disallow: ${path}/`).join("\n");
  return `User-agent: *\nAllow: /\n${disallowLines}\n\nSitemap: ${siteBaseUrl(data.seoConfig, host)}/sitemap.xml\n`;
}

/**
 * Sitemap of the app's pages without parameters (`/products/:id` needs its ids, which a later
 * table mapping supplies). Empty when the app asks not to be indexed.
 * @param {Record<string, any>} data
 * @param {string} host
 * @returns {string}
 */
export function buildSitemapXml(data, host) {
  const base = siteBaseUrl(data.seoConfig, host);
  const paths = new Set();
  if (!isNoIndex(data)) {
    for (const route of pageRoutes(data)) {
      if (route.path.includes(":") || route.path.includes("*") || !isInCrawlScope(data, route.path)) continue;
      const path = normalizePath(`/${route.path}`);
      if (!isPlatformPath(path)) paths.add(path);
      if (paths.size >= MAX_SITEMAP_URLS) break;
    }
  }
  const urls = [...paths]
    .sort()
    .map((path) => `  <url><loc>${escapeXml(`${base}${path === "/" ? "/" : path}`)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}${urls ? "\n" : ""}</urlset>\n`;
}

/**
 * A response that replaces the app shell for this path — a redirect, robots.txt or sitemap.xml —
 * or null to serve the page. Only for crawlable apps.
 * @param {{ data: Record<string, any> | null | undefined, host: string, path: string, querystring?: string }} input
 * @returns {{ status: number, location?: string, contentType?: string, body?: string } | null}
 */
export function resolveCrawlableResponse({ data, host, path, querystring = "" }) {
  // A private app is for its signed-in users: search engines are asked to stay out entirely
  if (isPrivateApp(data) && path === "/robots.txt") {
    return { status: 200, contentType: "text/plain; charset=utf-8", body: PRIVATE_ROBOTS_TXT };
  }
  // Login and magic links always reach the app: a redirect there would lock users out
  if (!isCrawlable(data) || isPlatformPath(path)) return null;
  const redirect = findRedirect(data, path, querystring);
  if (redirect) return redirect;
  if (path === "/robots.txt") {
    return { status: 200, contentType: "text/plain; charset=utf-8", body: buildRobotsTxt(data, host) };
  }
  if (path === "/sitemap.xml") {
    return { status: 200, contentType: "application/xml; charset=utf-8", body: buildSitemapXml(data, host) };
  }
  return null;
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (!text || typeof text !== "string") return "";

  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Build SEO metadata HTML tags from app data
 * @param {Object} data - App data from API
 * @param {string} host - The hostname
 * @param {string} path - The normalized path the visitor asked for
 * @returns {string} HTML meta tags
 */
export function buildMetadataHtml(data, host, path = "/") {
  if (!data || typeof data !== "object" || !host) return "";

  const meta = pageMetadata(data, host, path);
  const e = escapeHtml;

  let html = `
    <title>${e(meta.title)}</title>
    <meta name="description" content="${e(meta.description)}" />
    <meta name="robots" content="${e(isPrivateApp(data) ? PRIVATE_ROBOTS_DIRECTIVE : meta.robots)}" />
    <link rel="canonical" href="${e(meta.canonical)}" />`;

  // Theme color: used by mobile browsers for the address bar
  if (meta.themeColor) {
    html += `
    <meta name="theme-color" content="${e(meta.themeColor)}" />`;
  }

  if (meta.favicon) {
    html += `
    <link rel="icon" type="image/x-icon" href="${e(meta.favicon)}" />
    <link rel="apple-touch-icon" href="${e(meta.favicon)}" />`;
  }

  // Open Graph
  html += `
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${e(meta.canonical)}" />
    <meta property="og:title" content="${e(meta.ogTitle)}" />
    <meta property="og:description" content="${e(meta.ogDescription)}" />
    <meta property="og:site_name" content="${e(meta.siteName)}" />
    <meta property="og:locale" content="${e(meta.locale)}" />`;

  if (meta.ogImage) {
    html += `
    <meta property="og:image" content="${e(meta.ogImage)}" />
    <meta property="og:image:secure_url" content="${e(meta.ogImage)}" />
    <meta property="og:image:alt" content="${e(meta.ogTitle)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />`;
  }

  // Twitter Card
  html += `
    <meta name="twitter:card" content="${e(meta.twitterCard)}" />
    <meta name="twitter:url" content="${e(meta.canonical)}" />
    <meta name="twitter:title" content="${e(meta.ogTitle)}" />
    <meta name="twitter:description" content="${e(meta.ogDescription)}" />`;

  if (meta.ogImage) {
    html += `
    <meta name="twitter:image" content="${e(meta.ogImage)}" />
    <meta name="twitter:image:alt" content="${e(meta.ogTitle)}" />`;
  }

  return html;
}
