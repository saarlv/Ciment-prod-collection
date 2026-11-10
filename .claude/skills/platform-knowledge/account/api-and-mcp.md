# API and MCP access

## Blocks MCP server (connect AI assistants such as Claude to your apps)

- **Server URL**: `https://api.blocks.diy/v1/mcp` (Streamable HTTP). Add it as a custom connector or MCP server in the AI client.
- **Sign-in is OAuth.**
  - The client registers itself.
  - The user signs in to Blocks (Google) and approves a consent screen, which can limit access to a single app.
  - No API key is needed.
- **What the AI can do**, limited by the scopes approved and never beyond the user's own app permissions:
  - list apps, actions and tables
  - describe actions and tables
  - run actions
  - insert, update and delete data
  - read the activity log
  - read agent eval runs
- Sessions refresh automatically for about a month, then the user signs in again.

## Public API keys

- **User → Developer settings → API keys**: create a named key, with an optional expiry (never, 30 or 90 days).
  - **The key is shown once**; copy it then.
  - Revoke it any time.
- Apps can also have their own keys under **Settings → Developer settings**.
- A public API call that starts an action uses usage credits like any other run.
