---
name: browsing
description: 'Browser automation for code actions with `browsingTask: true` on a Browserbase cloud browser. Load this skill whenever a code action browses, scrapes, or downloads from web pages. Covers deterministic Playwright (default — faster and cheaper) and AI-driven Stagehand (fallback when selectors or end-user natural-language instructions require it). Read the matching sub-doc before writing code.'
user-invocable: false
---

# Browsing Skill

Use this skill when `requirements.json` shows **`browsingTask: true`** for a code action. The runtime creates a cloud browser session (Browserbase) and passes it to your `invoke()` function as a third argument.

## Choose your path (read the matching sub-doc)

| When…                                                                  | Read                             | Why                                          |
| ---------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| Page structure is stable; you know selectors; fixed scrape/export flow | [playwright.md](./playwright.md) | **Default** — deterministic, faster, cheaper |
| End-user supplies natural-language instructions at runtime             | [stagehand.md](./stagehand.md)   | AI-driven, parameterized by user input       |
| Page structure is highly dynamic; reliable selectors unavailable       | [stagehand.md](./stagehand.md)   | AI adapts when DOM changes                   |
| Autonomous multi-step reasoning that cannot be fixed selectors         | [stagehand.md](./stagehand.md)   | Stagehand agent mode                         |

**Always prefer Playwright** unless one of the Stagehand rows applies — Stagehand is slower and more expensive (LLM round-trips per step).

## Shared runtime rules (both paths)

- Do NOT import or construct Playwright, Browserbase, or Stagehand — the runtime handles this.
- Do NOT install or launch browser binaries.
- Do NOT add `playwright-core`, `@browserbasehq/sdk`, `@browserbasehq/stagehand`, or `zod` to the action's imports — they are injected automatically.

## File downloads (both paths)

Browserbase captures whatever the browser downloads and the platform uploads it to S3; the runtime already configures Chrome to accept downloads, so you only need to trigger them. The action has **no writable filesystem**, so never try to save, intercept, or read file content in the browsing script:

- Do NOT use `page.waitForEvent('download')` — it routes the file through a filesystem path the runtime cannot write to, silently breaking the download.
- Do NOT call `download.saveAs()` or `download.path()` — these require a writable filesystem.
- Do NOT use `page.waitForResponse()` to intercept file content — let Browserbase capture the file.
- Do NOT read file content into memory and return it — use `_browsingArtifacts.downloadsUrl` instead.

**Strip `target="_blank"` before downloading** — otherwise the download opens in a new tab and is NOT captured:

```typescript
await page
  .$$eval('form[target="_blank"], a[target="_blank"]', (els: any[]) => {
    els.forEach((el) => el.removeAttribute('target'));
  })
  .catch(() => {});

await page.click('#download-btn'); // or stagehand.act('click the download button')
await page.waitForTimeout(5000); // give Browserbase time to sync the file
```

## Browsing artifacts (automatic — both paths)

The platform appends `_browsingArtifacts` to every browsing task result — you do NOT add it yourself:

- `downloadsUrl` — signed S3 URL to a ZIP of all files downloaded during the session, present only if files were actually downloaded. A follow-up workflow step (RAG, data import) fetches that URL to process them.
- `sessionId` — the Browserbase session ID.

**Declare `_browsingArtifacts` in your `outputSchema`** — downstream workflow steps can only bind `_browsingArtifacts.downloadsUrl` as a variable if it appears in the schema:

```json
{
  "type": "object",
  "properties": {
    "status": { "type": "string" },
    "_browsingArtifacts": {
      "type": "object",
      "description": "Artifacts from the browsing session. downloadsUrl is a signed S3 URL to a ZIP of downloaded files.",
      "properties": {
        "sessionId": { "type": "string" },
        "downloadsUrl": {
          "type": "string",
          "description": "Signed URL to a ZIP of all files downloaded during the session"
        }
      }
    }
  }
}
```
