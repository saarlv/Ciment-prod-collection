# chat-components/

Prebuilt chat components rendered inline in agent chats (react-live).

Authored by the **chat-components** subagent — one folder per component:

- `component.tsx` — the react-live noInline snippet (block `data.code`)
- `meta.json` — `{ name, title, description, input, userInterrupt }`

Do not put these under `artifacts/` or `src/`. Component IDs are app-wide: every agent-chat can render every component.
