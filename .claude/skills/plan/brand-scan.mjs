#!/usr/bin/env node
/**
 * Reads a brand's website the way a designer inspects it and prints what it is made of: logo
 * candidates, the colors its stylesheets actually use (ranked, with CSS variable names), its font
 * families and @font-face names, corner radii, theme-color and og:image.
 *
 *   node .claude/skills/plan/brand-scan.mjs https://www.allbirds.com
 *
 * Inline SVG logos are written to /tmp/brand-scan/, outside the workspace.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_STYLESHEETS = 6;
const MAX_BYTES = 3_000_000;
const OUT_DIR = '/tmp/brand-scan';
const TOP = 14;

const input = process.argv[2];
if (!input) {
  console.error('usage: node .claude/skills/plan/brand-scan.mjs <website-url>');
  process.exit(1);
}
const pageUrl = new URL(
  /^https?:\/\//.test(input) ? input : `https://${input}`,
);

/** The whole scan finishes inside a one-minute command, whatever the network does. */
const DEADLINE = Date.now() + 45_000;
const timeLeft = () => DEADLINE - Date.now();

const fetchPage = async (url) => {
  if (timeLeft() < 2_000) {
    return { ok: false, status: 0, url, text: '', error: 'out of time' };
  }
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(Math.min(20_000, timeLeft())),
    });
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      text: (await response.text()).slice(0, MAX_BYTES),
    };
  } catch (error) {
    return { ok: false, status: 0, url, text: '', error: error.message };
  }
};

/** A bot check or block page answered instead of the site. */
const isBlocked = (page) =>
  !page.ok ||
  /<title[^>]*>\s*(just a moment|attention required|access denied|are you a robot|security check)/i.test(
    page.text,
  ) ||
  /window\._cf_chl_opt/.test(page.text);

/** The scan can't read this site: say so in one line and let the plan's `read_brand` take over. */
const blocked = (reason) => {
  console.log(JSON.stringify({ blocked: true, url: pageUrl.href, reason }));
  process.exit(2);
};

const direct = await fetchPage(pageUrl.href);
if (isBlocked(direct)) {
  blocked(`the site answered ${direct.status || direct.error} to a script`);
}
const siteUrl = new URL(direct.url || pageUrl.href);

/** A file of the site: a stylesheet or a logo. */
const get = async (url) => {
  const page = await fetchPage(url);
  if (isBlocked(page)) {
    throw new Error(`${page.status || page.error} ${url}`);
  }
  return page.text;
};

/** A site's own URL as https: the brief's Logo row takes https only, and these hosts all serve it. */
const absolute = (href) => {
  if (!href) {
    return null;
  }
  try {
    return new URL(href.replace(/&amp;/g, '&'), siteUrl).href.replace(
      /^http:\/\//,
      'https://',
    );
  } catch {
    return null;
  }
};

const attr = (tag, name) =>
  new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? null;

const rank = (values) => {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
};

const toHex = (raw) => {
  const value = raw.trim().toLowerCase();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return `#${[...hex.slice(0, 3)].map((c) => c + c).join('')}`;
    }
    return hex.length === 6 || hex.length === 8 ? `#${hex.slice(0, 6)}` : null;
  }
  const rgb =
    /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?/.exec(value);
  if (!rgb) {
    return null;
  }
  if (rgb[4] !== undefined && parseFloat(rgb[4]) === 0) {
    return null;
  }
  return `#${rgb
    .slice(1, 4)
    .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
    .join('')}`;
};

const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;

const html = direct.text;

const metaContent = (key) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if ((attr(tag, 'name') ?? attr(tag, 'property'))?.toLowerCase() === key) {
      return attr(tag, 'content');
    }
  }
  return null;
};

const links = html.match(/<link\b[^>]*>/gi) ?? [];
const icons = links
  .filter((tag) => /icon/i.test(attr(tag, 'rel') ?? ''))
  .map((tag) => ({
    rel: attr(tag, 'rel'),
    sizes: attr(tag, 'sizes'),
    url: absolute(attr(tag, 'href') ?? ''),
  }));

// Logo candidates, best first: inline <svg> in a home link or marked "logo", then the logo the
// site declares in its structured data, then <img> whose src, alt, class or id says "logo", then an
// og:image named like one.
const logos = [];
mkdirSync(OUT_DIR, { recursive: true });
// The brand's name as the domain spells it (`bluebottle` from bluebottlecoffee.com), to know its marks by.
const brandKey = siteUrl.hostname
  .replace(/^www\./, '')
  .split('.')[0]
  .toLowerCase();
const namesBrand = (text) => {
  const squashed = (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    squashed.length > 3 &&
    (brandKey.includes(squashed) || squashed.includes(brandKey.slice(0, 6)))
  );
};
/** The link an svg sits in, when it is still open: the site's home (`/`, `/ca/eng`, "Go to … home page"). */
const isHomeLink = (before) => {
  const open = [...before.matchAll(/<a\b[^>]*>/gi)].pop();
  if (!open || /<\/a>/i.test(before.slice(open.index))) {
    return false;
  }
  const href = attr(open[0], 'href') ?? '';
  return (
    /^(\/|\/[a-z]{2}(-[a-z]{2})?(\/[a-z]{2,3})?\/?|https?:\/\/[^/]+\/?)$/i.test(
      href,
    ) || /\bhome\b/i.test(attr(open[0], 'aria-label') ?? '')
  );
};
/** An svg drawn at icon size (a 24px cart or account glyph) is never the logo. */
const isIconSize = (open) =>
  ['width', 'height']
    .map((name) => parseFloat(attr(open, name)))
    .every((size) => size > 0 && size <= 32);
const imageLogos = [];
// A page can carry dozens of "logo" images: customers, integrations, a parent company's marks. The
// brand's own are the one it declares, one in its home link and those named for it.
const ownLogos = [];
const fileOf = (url) => url.split('?')[0].split('/').pop();
// Sites declare their logo for search engines (schema.org Organization), often as a file their
// header only draws inline: it gives the brief a Logo URL and its colours.
const declaredLogo = [
  ...html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  ),
]
  .map(([, json]) =>
    /"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"(?:url|contentUrl)"\s*:\s*"([^"]+)")/.exec(
      json,
    ),
  )
  .find(Boolean);
if (declaredLogo) {
  const url = absolute(
    (declaredLogo[1] ?? declaredLogo[2]).replace(/\\\//g, '/'),
  );
  if (url) {
    imageLogos.push({ kind: 'schema.org', url });
    ownLogos.push(imageLogos[0]);
  }
}
for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
  const tag = match[0];
  const hint = [
    attr(tag, 'src'),
    attr(tag, 'data-src'),
    attr(tag, 'alt'),
    attr(tag, 'title'),
    attr(tag, 'class'),
    attr(tag, 'id'),
  ].join(' ');
  // A lazy-loaded image carries a data: placeholder in src and the real file in data-src.
  const src = [
    attr(tag, 'data-src'),
    attr(tag, 'data-lazy-src'),
    attr(tag, 'src'),
  ].find((value) => value && !value.startsWith('data:'));
  const inHomeLink = isHomeLink(
    html.slice(Math.max(0, match.index - 400), match.index),
  );
  const url = absolute(src);
  if (
    url &&
    (inHomeLink || /logo|wordmark/i.test(hint)) &&
    !imageLogos.some((logo) => logo.url === url)
  ) {
    const logo = { kind: 'img', url, alt: attr(tag, 'alt') };
    imageLogos.push(logo);
    if (inHomeLink || namesBrand(fileOf(url)) || namesBrand(logo.alt)) {
      ownLogos.push(logo);
    }
  }
}
/** The logo marks found, so their own colours can be read. */
const logoSvgs = [];
const saveInlineLogo = (svg, kind, label) => {
  logoSvgs.push(svg);
  const file = `${OUT_DIR}/logo-inline-${logoSvgs.length}.svg`;
  writeFileSync(
    file,
    svg.includes('xmlns=')
      ? svg
      : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'),
  );
  logos.push({ kind, file, bytes: svg.length, label });
};
for (const match of html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) {
  const svg = match[0];
  const before = html.slice(Math.max(0, match.index - 400), match.index);
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const hint = `${open} ${svg.slice(0, 300)} ${before.slice(-250)}`;
  const title =
    /<title>([^<]*)<\/title>/i.exec(svg)?.[1] ?? attr(open, 'aria-label');
  const inHomeLink = isHomeLink(before) || namesBrand(title);
  if (
    (inHomeLink || /logo|wordmark/i.test(hint)) &&
    svg.length > 300 &&
    !isIconSize(open) &&
    logoSvgs.length < 3 &&
    // Sites repeat the header logo for mobile and desktop: each distinct mark once.
    !logoSvgs.includes(svg)
  ) {
    saveInlineLogo(svg, 'inline-svg', attr(open, 'aria-label'));
  }
}

if (logoSvgs.length === 0) {
  const header = /<header\b[\s\S]*?<\/header>/i.exec(html)?.[0] ?? '';
  const svg = [...header.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)]
    .map((m) => m[0])
    .find(
      (s) => s.length > 300 && !isIconSize(/<svg\b[^>]*>/i.exec(s)?.[0] ?? ''),
    );
  if (svg) {
    saveInlineLogo(svg, 'inline-svg (first in the header)');
  }
}
const brandLogos = (ownLogos.length ? ownLogos : imageLogos).slice(0, 6);
logos.push(...brandLogos);
const ogImage = absolute(metaContent('og:image') ?? '');
if (ogImage && /logo/i.test(ogImage)) {
  logos.push({
    kind: 'og:image',
    url: ogImage,
    note: 'often a padded social card, not the bare mark',
  });
}

const styleBlocks = [
  ...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
].map((m) => m[1]);
const sheetUrls = links
  .filter(
    (tag) =>
      /stylesheet/i.test(attr(tag, 'rel') ?? '') ||
      /\.css(\?|$)/i.test(attr(tag, 'href') ?? ''),
  )
  .map((tag) => absolute(attr(tag, 'href') ?? ''))
  .filter(Boolean)
  // A plugin's or a library's stylesheet says nothing about the brand: the theme's does.
  .filter(
    (url) =>
      !/\/wp-includes\/|\/wp-content\/plugins\/|cdnjs\.|jsdelivr|unpkg|font-?awesome|\/all(\.min)?\.css|bootstrap|glightbox|lightbox|masonry|splide|swiper|slick|select2|animate/i.test(
        url,
      ),
  )
  // The theme's own main sheet first: it carries the brand.
  .sort(
    (a, b) =>
      Number(/\/(styles?|main|app|theme|global|site)(\.min)?\.css/i.test(b)) -
      Number(/\/(styles?|main|app|theme|global|site)(\.min)?\.css/i.test(a)),
  )
  .slice(0, MAX_STYLESHEETS);
const sheets = [];
for (const url of sheetUrls) {
  try {
    sheets.push(await get(url));
  } catch (error) {
    console.error(`skipped stylesheet: ${error.message}`);
  }
}
if (sheets.length === 0 && styleBlocks.join('').length < 500) {
  blocked("the site's stylesheets could not be read");
}
const inlineStyles = (html.match(/\bstyle\s*=\s*"[^"]*"/gi) ?? []).join('\n');
const css = [...styleBlocks, ...sheets, inlineStyles].join('\n');
// A holding or outage page, which some sites serve to scripts, carries a handful of colours where a
// live site's stylesheets carry hundreds: a brief read from it would be plausible and wrong.
if ((css.match(COLOR) ?? []).length < 40) {
  blocked('the site served a holding page, not its live stylesheets');
}

const colors = rank((css.match(COLOR) ?? []).map(toHex).filter(Boolean));
const variables = rank(
  [...css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi)]
    .map(([, name, value]) => `${name}: ${toHex(value)}`)
    .filter((entry) => !entry.endsWith('null')),
);
const fontFamilies = rank(
  [...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)]
    .map(([, value]) => value.trim().replace(/\s*!important/, ''))
    .filter(
      (value) => !value.startsWith('var(') && !/^inherit|^initial/.test(value),
    ),
);
const fontFaces = rank(
  [
    ...css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*["']?([^;"'}]+)/gi),
  ].map(([, name]) => name.trim()),
);
const radii = rank(
  [...css.matchAll(/border-radius\s*:\s*([^;}]+)/gi)].map(([, value]) =>
    value.trim(),
  ),
);

// The site's own colour names (`.bg-bottle-blue`, `.text-cream`), not a framework's numbered scale.
const FRAMEWORK_SCALE =
  /^(slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|primary|secondary|success|danger|warning|info|light|dark|body|muted|white|black|transparent|current|inherit)(-\d+)?$/;
const namedColors = rank(
  [
    ...css.matchAll(
      /\.(?:bg|text|border|fill|stroke)-([a-z][\w-]*)\{[^}]*?(?:background-color|color|border-color|fill|stroke)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi,
    ),
  ]
    .filter(([, name]) => !FRAMEWORK_SCALE.test(name))
    .map(([, name, value]) => `${name}: ${toHex(value)}`)
    .filter((entry) => !entry.endsWith('null')),
);
// An <img> logo that is an SVG file carries its colours inside.
for (const logo of brandLogos
  .filter((candidate) => /\.svg(\?|$)/i.test(candidate.url ?? ''))
  .slice(0, 2)) {
  try {
    logoSvgs.push(await get(logo.url));
  } catch (error) {
    console.error(`skipped logo: ${error.message}`);
  }
}
const logoColors = rank(
  logoSvgs
    .flatMap((svg) => [
      ...svg.matchAll(
        /(?:fill|stroke|stop-color)\s*[:=]\s*["']?(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi,
      ),
    ])
    .map(([, value]) => toHex(value))
    .filter(Boolean),
);

const report = {
  url: siteUrl.href,
  title: /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null,
  themeColor: metaContent('theme-color'),
  ogImage,
  logos,
  icons,
  stylesheetsRead: sheets.length,
  namedColors: namedColors.map(([entry, count]) => ({ entry, count })),
  logoColors: logoColors.map(([hex, count]) => ({ hex, count })),
  colors: colors.map(([hex, count]) => ({ hex, count })),
  colorVariables: variables.map(([entry, count]) => ({ entry, count })),
  fontFamilies: fontFamilies.map(([family, count]) => ({ family, count })),
  fontFaces: fontFaces.map(([family, count]) => ({ family, count })),
  radii: radii.map(([value, count]) => ({ value, count })),
};
// One field per line: a reader that keeps only the first lines (`| head`) still gets every field.
console.log(
  `{\n${Object.entries(report)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n')}\n}`,
);
