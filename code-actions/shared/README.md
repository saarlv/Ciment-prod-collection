# code-actions/shared

## Platform (do not edit)

Copied each turn from the Blocks boilerplate — do not modify:

- `blocks/` — Lambda runtime (`blocks-client.ts`, `browsing.ts`, `index.ts`) plus generated `blocks-client-mappings.ts`
- `testing/` — offline vitest helpers (`testing.ts`)

## App shared modules (you may add)

Put reusable helpers **at this directory root** (e.g. `task-utils.ts`), not under `blocks/` or `testing/`. Import from actions as:

```ts
import { helper } from '../shared/task-utils.ts';
import { BlocksClient } from '../shared/blocks/blocks-client.ts';
```

For helpers used by **one** action only, put a `.ts` file next to that action's `code.ts` and import it with `./my-helper.ts`.
