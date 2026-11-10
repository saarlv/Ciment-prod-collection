# Chat settings and using your own Claude key

## Chat settings

The **Chat settings** button (sliders icon next to **+** in the composer) opens a dialog.

- Changes apply from your next message and stay with that chat.
- A new chat starts with the settings of the chat you were last in. That includes the fresh chat opened after 4 hours idle.
- Everything is locked while Ella is working.
- Rows appear only when there's a real choice, so many accounts see only **Effort**.

- **Engine** — **Claude Code** (default) or **OpenCode**. A chat keeps the engine it started on, so switching starts a new chat. [flag: builder-agent-harness]
- **Model** — **Claude Code:** Opus (default), Sonnet or Haiku. **OpenCode:** a wider list that includes GPT and Gemini models. [flag: builder-agent-harness]
- **Effort** — "How much the model thinks before acting." **Claude Code:** Low → Max. **OpenCode:** Low, Medium, High. Defaults: Low on Opus, High on Sonnet and Haiku. Higher effort is slower but more thorough. It doesn't change the builder-credit cost.
- **Visual QA** — On/Off (off by default). "Checks the result in a real browser after each build. Takes longer." Claude Code only.
- **Videos** — On/Off (off by default). "Records a narrated video of your app when you ask for one." Claude Code only, and separate from **Visual QA**: either can be on without the other. [flag: builder-agent-video]
  - With it on, ask Ella in the chat for a video ("make a short narrated video showing how to approve an order"). She records the running app in a browser and makes a narrated, captioned mp4 — a walkthrough, a quick clip, a tutorial or an animated explainer. Only when you ask for one; never on her own. It takes several minutes. The video plays in the chat and is saved under **Data → Folders → User Uploads**. On HIPAA accounts the narration uses an offline voice, which speaks English only.
- **Key** — **Claude subscription** / **Anthropic API key** (your stored key) vs **Platform key**. Only shown if you stored your own key. See below.

Model and effort don't change what a message costs in builder credits; see `billing/credits.md`.

## Using your own Claude subscription or Anthropic API key

**Where:** **User → Developer settings** → the **Claude Code key** card. It needs [flag: builder-agent-harness], and is **never on HIPAA accounts**.

**What to paste** (one or the other):

- **Claude subscription token.** Run `claude setup-token` in a terminal with Claude Code installed. It needs a **Claude Pro or Max** plan, and the token starts with `sk-ant-oat`.
- **Anthropic API key** from the Anthropic Console, starting with `sk-ant-api`.

**How it works:**

- The key is stored encrypted, used only while building, and never shown again. Use **Replace** or **Revoke** to change it.
- It applies to your chats on the **Claude Code** engine, from your next message. A replace or revoke also takes effect on the next message.
- **Longer messages on your own subscription.** With a **Claude subscription** key, Ella can do about twice as many steps in one message before pausing (see "Very large requests can pause partway" in `building/chat-with-ella.md`). An **Anthropic API key** keeps the usual limit.
- **Only Anthropic credentials are supported.** There are no OpenAI or Google key fields.
- **Builder credits:** the builder-credit check and charge still apply to turns that run on your own key. If you're out of builder credits, a stored key doesn't let you keep building. Don't tell users their own key makes building free.

**When your own key hits its limit or is rejected:**

- Ella's turn fails with **Something went wrong** (the chat doesn't show the specific reason).
- **Rate-limited** (your subscription's usage window is used up): open **Chat settings → Key → Platform key** to keep building in that chat, or wait for your limit to reset. The choice sticks to that chat. Switch back to your key the same way.
- **Rejected or expired:** go to **Developer settings** and **Replace** the key, or **Revoke** it to build on the platform key again.
- If Blocks can't read your stored key at all, the turn fails rather than silently using the platform key. Retry, and contact support if it continues.
