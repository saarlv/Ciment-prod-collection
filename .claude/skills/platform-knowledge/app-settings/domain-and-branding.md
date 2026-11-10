# Custom domain, email branding, SEO

All of these are under **Settings → Customization**, which has four tabs: **Domains**, **Email Branding**, **Search Engine** and **Social Sharing**.

## Custom domain (Domains tab)

- Connect your own domain, e.g. `portal.yourcompany.com` or `yourcompany.com`. The default `…blocks-app.diy` link keeps working alongside it.
- **Needs an eligible plan.** The card is marked **Premium**. Without it you see "Custom domain requires a plan upgrade" with **Upgrade plan**. Don't name a specific plan; the Upgrade page shows which plans include it.
- **Blocks doesn't sell or register domains.** Buy one from any registrar first.
- **Steps**:
  1. Enter the domain and click **Connect Domain**. For a root domain, tick **Also configure www**.
  2. Add the DNS records the screen shows at your domain provider:
     - a **CNAME** for a subdomain
     - an **A** record for a root domain
     - an optional `www` CNAME

     Copy the exact values from the screen rather than from memory. Step-by-step help for common providers is shown inline.

  3. Wait for verification. The tracker goes **Domain created → Configure DNS → SSL provisioned**. The SSL certificate is automatic. DNS changes can take from minutes to up to 48 hours.

- **"Domain already assigned to another product"**: another app, possibly a deleted one, still holds the domain. Remove it there first.
- Login links, and links in emails and messages the app sends, switch to the custom domain only once setup is fully complete.
- **Not supported at the domain level:**
  - files under `/.well-known/` (which, for example, Apple Pay domain verification needs)
  - your own hand-written `robots.txt` or `sitemap.xml`, and redirects, for apps without **Crawlable Pages** (below)

  Putting a proxy such as Cloudflare in front is the usual workaround. For a public app, **Crawlable Pages** generates `robots.txt` and `sitemap.xml` and handles redirects instead [flag: app-seo-crawlable-pages].

## Email Branding

- "Customize login and invitation emails sent to your app users". Turn it on with the switch.
- Fields:
  - **Logo** (PNG/JPG, up to 2 MB)
  - **Sender name**
  - **Email title**
  - **Description**
  - **Button text**
- **Send test email**, then **Save email branding**.
- **SMTP connection** sends these emails from your own mail server and address (needs an eligible plan: "Custom SMTP requires a plan upgrade"). Without it, emails come from a Blocks address with your sender name.
- Emails the _app itself_ sends from workflows are separate. The built-in "Send email" step uses a Blocks address and only the sender name can change; to send as your own address, use a Gmail or Outlook connection (`integrations/integrations.md`).

## Search Engine

- Indexing (whether search engines may index the app) and extra directives.
- **Meta title**, **Meta description**, **Canonical URL** and **Theme color**.
- A Google search preview.
- Every page's canonical link is its own address. A **Canonical URL** set here is used as-is on every page, unless **Crawlable pages** is on, where it becomes the base address for each page (`https://example.com` → `https://example.com/about`).
- A **private** app asks search engines to stay out, whatever these settings say: its `robots.txt` blocks everything and its pages say `noindex`. Making the app public lifts this.
- What search engines and link previews read comes from these settings, not from the page's content: the page itself is built in the visitor's browser. With [flag: app-framework-build], a **public** app's pages with a fixed address (`/`, `/pricing`, not `/products/:id`) also arrive with their content already in the page, built when the app is built, so search engines read the page itself.
  - **Limitation:** pages are built as a signed-out visitor sees them before data loads. Content from the app's tables (product lists, articles) and pages whose address includes an item (`/products/:id`) still load in the browser: search engines that run JavaScript, like Google, see them; others see the page without that content. Item pages aren't listed in the sitemap. There's no setting that changes this.

### Crawlable Pages [flag: app-seo-crawlable-pages]

A second card on the **Search Engine** tab. Turn on **Crawlable pages** (only for **public** apps; a private app shows "Only public apps can be crawled"), then **Save crawlable pages**:

- **Public mini-app** (only when the app has two or more page mini-apps): the mini-app search engines see. Its pages are the ones listed below and in the sitemap; `robots.txt` asks search engines to skip the others. By default it's the first mini-app open to everyone (no roles). The other mini-apps keep working as before.
- **Page titles and descriptions**: one row per page address (`/`, `/about`, `/products/:slug`). A page left empty uses the app's meta title and description. A page whose address has a `:value` uses the same text for every item. Pages of older apps that have no addresses of their own don't appear; they keep the app-wide title and description.
- **Redirects**: **Add redirect**, an old address (starting with `/`) and a new one (an address on the app or a full `https://` URL), **Permanent (301)** or **Temporary (302)**.
- Addresses no page serves answer "404 Not Found" to search engines; the app still shows its not-found page.
- `robots.txt` and `sitemap.xml` are generated at the app's address. The sitemap lists pages without a `:value` in their address. When indexing is set to **No Index**, `robots.txt` blocks everything and the sitemap is empty.
- Changes reach search engines within a few minutes of saving.
- With [flag: app-framework-build], the page titles and descriptions, `robots.txt` and `sitemap.xml` are built into the app. Saving **Search Engine**, **Social Sharing** or **Crawlable pages** settings rebuilds it ("Rebuilding the app with the new settings…", about a minute); if the rebuild fails, the toast says "Settings saved, but the app rebuild failed. Try saving again." Other changes, such as the app's name, description, icon or cover image, or making it public, show up after the app's next build.

## Social Sharing

How the link looks when shared:

- **Social title**
- **Social description**
- **Social image**
- **Locale**
- X/Twitter card layout

## Blocks branding

Apps published on the Free plan show a small Blocks logo. It disappears on any paid plan.
