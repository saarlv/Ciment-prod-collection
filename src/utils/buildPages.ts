/**
 * Build-stage pages (פערים, Design) live in /collections only while the app is being built with Saar.
 * Set this to false for production: the sidebar items disappear and both routes redirect to /collections.
 */
export const SHOW_BUILD_PAGES = true;

export const BUILD_PAGE_PATHS = {
  gaps: '/collections/gaps',
  design: '/collections/design',
} as const;