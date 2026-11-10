# Stagehand (AI-driven browsing)

> Part of the [`browsing`](./SKILL.md) skill. Read the parent skill first for routing, shared runtime rules, file downloads, and `_browsingArtifacts`. **Only use Stagehand when deterministic Playwright is insufficient** — it is slower and more expensive.

## Invoke signature

Your `invoke()` receives a third argument: `{ stagehand, browser, page, context }`

- `stagehand` — a ready, initialized Stagehand v3 instance (already connected to the cloud browser, LLM preconfigured). All AI-driven actions live on it.
- `page` — a full Playwright Page attached to the same session: use it for navigation (`goto`, `waitForSelector`, `waitForLoadState`) and for precise control (`click`, `fill`, `$eval`, `locator`) when you know the selectors. Stagehand sees everything Playwright does and vice versa — mix freely.
- `context` — the Playwright BrowserContext.
- Do NOT call `stagehand.init()` or `stagehand.close()` — the runtime owns the session lifecycle.
- Do NOT pass a model or apiKey anywhere — the runtime preconfigured the LLM.

## Parameterize with end-user input (THE KEY IDEA)

The point of AI browsing is that the **end-user** decides _what_ to browse at runtime — the builder does not hard-code it. Put every variable part of your instructions in `input.*` fields and **declare them in the action's `inputSchema`**. The builder binds those inputs (typically to a form field) with `{{...}}`, and the end-user fills them when they run the workflow.

- ✅ `await stagehand.act(\`type ${input.query} into the search box and press Enter\`)`
- ❌ `await stagehand.act('search for shoes')` // hard-coded — the user can't change it

Never bake search terms, target URLs, filters, or credentials into the code when they are things the user should control; read them from `input`.

## Core Stagehand v3 API (methods live on `stagehand`, NOT on `page`)

- `await page.goto(url, { waitUntil: 'domcontentloaded' })` — navigate first; act/extract work on the current page.
- `await stagehand.act("natural-language action")` — perform ONE action. Returns `{ success, message, actions }`.
- `await stagehand.extract("instruction", zodSchema)` — extract STRUCTURED data. The schema is a **positional second argument** (NOT an options object). Returns the parsed object. `import { z } from 'zod'` — zod is injected automatically.
- `await stagehand.observe("what can I click here")` — discover actionable elements before acting.
- `const agent = stagehand.agent(); const res = await agent.execute({ instruction, maxSteps: 25 });` — run an AUTONOMOUS multi-step task. `res` = `{ success, message, actions, completed, usage }`. Call `stagehand.agent()` with NO arguments — the runtime's model/key are inherited.

Use `agent.execute()` for open-ended "go accomplish X" tasks; use `act()` / `extract()` / `observe()` for tighter step-by-step control, since each agent step is an extra LLM round-trip. Where the page structure is stable and you know the selectors, plain Playwright on `page` is faster and free — save Stagehand calls for the parts that vary.

## Example — act + structured extract

```typescript
import { z } from 'zod'; // injected automatically — do NOT add zod to imports

export const invoke = async (
  input: any,
  context: any,
  { stagehand, page }: any,
) => {
  await page.goto(input.url, { waitUntil: 'domcontentloaded' });
  await stagehand.act(`search for ${input.query}`).catch(() => {});

  const data = await stagehand.extract(
    `extract the top ${input.limit ?? 5} results with their titles and links`,
    z.object({
      results: z.array(z.object({ title: z.string(), url: z.string() })),
    }),
  );

  return data;
};
```

## File downloads with Stagehand

Trigger downloads with `stagehand.act("click the export button")`, stripping `target="_blank"` first (see parent skill), then `await page.waitForTimeout(5000)` so Browserbase can sync the file.
