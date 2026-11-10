# Playwright (deterministic browsing)

> Part of the [`browsing`](./SKILL.md) skill. Read the parent skill first for routing, shared runtime rules, file downloads, and `_browsingArtifacts`.

The default path for `browsingTask: true` actions — deterministic, selector-based, faster and cheaper than Stagehand.

## Invoke signature

Your `invoke()` receives a third argument: `{ browser, page, context }` — a Playwright `Page`, its `BrowserContext`, and the `Browser`, already connected to the remote cloud browser. Drive them exactly as you would locally.

## Example — log in and export a CSV

```typescript
export const invoke = async (input: any, context: any, { page }: any) => {
  await page.goto('https://my-crm.com/login', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', input.email);
  await page.fill('input[name="password"]', input.password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');

  await page.goto('https://my-crm.com/contacts/export', { timeout: 30000 });
  await page.waitForLoadState('networkidle');

  // Strip target="_blank" so the download is captured (see parent skill)
  await page
    .$$eval('form[target="_blank"], a[target="_blank"]', (els: any[]) => {
      els.forEach((el) => el.removeAttribute('target'));
    })
    .catch(() => {});

  await page.click('#export-csv-button');
  await page.waitForTimeout(5000);

  // downloadsUrl is added automatically via _browsingArtifacts
  return { status: 'success' };
};
```
