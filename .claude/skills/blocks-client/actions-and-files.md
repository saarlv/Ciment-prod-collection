# Actions and file upload

## useExecuteAction

Runs a backend action, an AI call, or any server-side logic. The UI can call **only this app's actions** — system and built-in actions are not callable from the frontend and will fail.

```tsx
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ProcessPaymentAction } from '@/product-types';

const {
  executeFunction,
  result,
  streamResult,
  isLoading,
  isDone,
  error,
  clear,
} = useExecuteAction(ProcessPaymentAction);

// The argument shape is the action's own input schema.
const response = await executeFunction({ amount: 29.99, currency: 'USD' });
```

- `result` — the final output once the action finishes; `streamResult` — the partial output, updated incrementally while it streams; `isDone` — completed; `clear()` — resets both results.
- Each call is a server request, so don't execute actions from `onChange` or other handlers that fire per keystroke.

## Background runs: executeBackgroundRunFunction and useActionRun

A long-running action (`"execution": { "mode": "durable" }` in its artifact) runs for up to 72 hours, so the UI must start it in the background with `useExecuteAction`'s `executeBackgroundRunFunction` and follow the run — never `executeFunction`, which waits for the result in the browser and loses the run on reload. Any other action can be started the same way when the UI should follow, pause, resume or cancel it — that alone is never a reason to make the action long-running. These hooks start, poll, pause, resume and cancel runs directly: no code action is needed for any of that.

```tsx
import {
  useExecuteAction,
  useActionRun,
  ActionRunError,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ProcessBatchAction } from '@/product-types';

const { executeBackgroundRunFunction, isStartingBackgroundRun } =
  useExecuteAction(ProcessBatchAction);
const { runId } = await executeBackgroundRunFunction({
  ticketIds,
  concurrency: 10,
}); // returns at once

// Keep the id where the page can find it again (a column on the run's row) and follow the run:
const {
  status,
  progress,
  canResume,
  isDone,
  canPause,
  pause,
  isPausing,
  resume,
  isResuming,
  cancel,
  isCancelling,
} = useActionRun(row.runId);
```

- `status` — `RUNNING`, `COMPLETED`, `FAILED` or `CANCELLED`; polling stops once `isDone`. `progress.loops[]` (long-running loops) — per loop `total`, `succeeded`, `failed`, `inFlight`.
- `canPause` — whether the run can be paused: false for a run started with a synchronous call, or one already ended. Show **Pause** only while it is true.
- `pause()` — the user's **Pause**: no new step or loop item starts; what is running finishes, and nothing fails or uses up its tries (works on every run started in the background, not just long-running ones). The run keeps its account slot, and its **Run for up to** time keeps counting while paused. Never build a pause yourself (a "pause requested" column a step checks and throws on): that marks items failed and burns their retries.
- `canResume` — the run waits for `resume()`: paused by `pause()` (`isManuallyPaused`), or after a step or loop failed its retries (then `awaitingRetry` lists what failed, and the run waits up to 24 hours). `resume()` continues the same run either way, re-running only what failed. Show **Resume** while `canResume`, **Pause** while `canPause`.
- `cancel()` — no new steps start; steps already running finish. A cancelled run can't be resumed.
- Refusals throw `ActionRunError`: branch on `error.code`, never the message — `DURABLE_RUN_LIMIT` (5 runs already active in the account) from `executeBackgroundRunFunction` (also on `backgroundRunError`), `RUN_NOT_RESUMABLE` (the run ended) or `NOTHING_TO_RESUME` (not paused) from `resume`, `RUN_NOT_RUNNING` (the run ended) from `pause`, `RUN_NOT_PAUSABLE` (409: it was started with a synchronous call) from `pause`, `RUN_NOT_CONTROLLABLE` (400: started before run control existed) from any control call.
- A long-running action's per-item results land in tables, not in the run's output: show progress from those rows, and the run's `status` for the overall state.
- Signed-in users only: for an anonymous visitor of a public app, `useActionRun` reports `status` without `progress`, and `cancel` / `resume` fail with `RUN_NOT_FOUND`.
- Outside React, the same calls are `client.action(X).start(input)`, `client.getActionRunStatus(id)`, `client.pauseActionRun(id)`, `client.resumeActionRun(id)` and `client.cancelActionRun(id)`.

## Features that need an integration

Wrap any button, menu item, or section that runs an integration-backed action (Slack, Gmail, HubSpot, …) in a connection check. An **optional** integration is never prompted for, so for many users it is not connected — and an action whose integration is not connected does not reliably throw, so a `try/catch` around `executeFunction` is not a substitute for checking first.

```tsx
import {
  useExecuteAction,
  useIntegrationStatus,
} from '@blocksdiy/blocks-client-sdk/reactSdk';
import { PostReportToSlackAction } from '@/product-types';

function ReportActions({ reportId }: { reportId: string }) {
  const { isConnected } = useIntegrationStatus('slack');
  const { executeFunction: postToSlack } = useExecuteAction(
    PostReportToSlackAction,
  );

  if (!isConnected) {
    return null;
  }
  return (
    <Button onClick={() => postToSlack({ reportId })}>Post to Slack</Button>
  );
}

// Several providers: const { isConnected } = useIntegrationsStatus(); isConnected('slack');
```

- Use the provider slug from `artifacts/app.json` → `integrations[].provider`.
- `isConnected` is `false` while loading and if the status failed to load, so the gated UI appears only once the integration is known to work. The status refreshes when the user comes back to the app, so connecting in app settings shows the feature without a reload.
- Hide the feature, or show it disabled with a one-line reason ("Connect Slack in app settings to post reports"). Don't add a connect button — connecting happens in the app's settings, not inside the app.
- Signed-out visitors of a public app get the same answer, counting only connections shared with all app users — gate the same way; don't special-case anonymous users.
- `useIntegrationStatus(provider).integration` is an `Integration` with `provider`, `isConnected` and `isOptional` (undefined until loaded); `useIntegrationsStatus().integrations` holds every declared integration keyed by provider (`integrations['slack']?.isOptional`) when you need more than a yes/no. Outside React, `await client.loadIntegrations()` then read `client.integrations['slack']`.

## AI actions

```tsx
import {
  AgentCallAction,
  IAgentCallActionInputStructuredOutputJsonSchemaObject,
} from '@/product-types';

const schema: IAgentCallActionInputStructuredOutputJsonSchemaObject = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'tags'],
};

await executeFunction({
  prompt: 'Analyze this product description…',
  tools: { webSearch: false, linkedIn: false },
  structuredOutputJsonSchema: schema,
});
```

Leave the model unset — the platform picks it; a pinned `modelName` freezes the app to one vendor model that ages out. For anything beyond a one-off call, the orchestrator should define an agent artifact and the action should use `SendAgentMessage` instead, so instructions, tools, and memory are reusable.

AI calls can take up to ~1 minute, so never run one on page load. For slow or expensive AI work, run it from a background trigger and persist the result to a table, then read the table from the UI.

## File upload

```tsx
import { useFileUpload } from '@blocksdiy/blocks-client-sdk/reactSdk';

const { uploadFunction, isLoading, uploadPercentage } = useFileUpload();

const url = await uploadFunction(file); // resolves to the uploaded file's URL string
```

Render `uploadPercentage` for progress and disable the input while `isLoading`.

## Generated document PDFs

For a quote, invoice, receipt, or statement that users preview, download, or receive by email: call the app's `Generate<Doc>Document` action and preview/download the returned PDF URL. Rebuilding the document as a separate React/Tailwind layout creates a second pipeline that drifts from the emailed PDF — load the `document-generation` skill for the single-source-of-truth pattern.
