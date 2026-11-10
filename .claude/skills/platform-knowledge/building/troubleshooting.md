# Troubleshooting: errors, status messages, common problems

## "Something went wrong." in the chat

The chat names only one error specifically: running out of builder credits. **Every other failure shows "Something went wrong." with Retry**, and the message is marked **Run failed**. Failed turns aren't charged. The likely causes, and what to do:

- **Your own Claude key hit its usage limit** → **Chat settings → Key → Platform key**, or wait for your limit to reset (`building/chat-settings-and-own-key.md`)
- **Your own Claude key was rejected or expired** → **Developer settings** → **Replace** or **Revoke** the key
- **The chat belongs to a different Git branch, or a different engine** → start a **New chat**
- **Another Ella turn is already running on this app** → wait, or **Stop** the other turn
- **Temporary overload or a hiccup** → **Retry**. If it keeps failing, contact support
- **An older app's one-time upgrade failed** → **Retry**. If it keeps failing, contact support

## Out of builder credits

The card reads **"You're out of builder credits"**, and nothing was run. What the user can do depends on their plan: upgrade to a bigger credit tier, view all plans, or contact support. See `billing/credits.md`.

## Chat is temporarily unavailable [flag: ella-down]

The message box at the bottom of the chat is replaced by a card reading **"Chat is temporarily unavailable"**, with "Our team is working on it". Building through the chat is paused for everyone while the team fixes a problem; nothing sends until it's over. This is a platform-wide pause, not a per-account feature: never suggest it can be enabled, and don't send the user to support to switch it on.

- Only the chat is paused. Chats and their history stay as they are, and a turn already running can still be stopped from the card's **Stop**.
- Everything that would start a turn waits with it: **Retry** on a failed message, the answer buttons on approval cards, **Accept** and **Request changes** on a plan, and **Remove** on an integration (it says so in the dialog). A message prepared from elsewhere while paused (**Please fix!** on a page that didn't load, deleting something through Ella) is kept and appears in the message box once the chat reopens.
- The chat reopens on its own a few minutes after the fix; no reload is needed. Then send the kept message, if any.
- Resending the same message, or starting new chats, doesn't help; wait for the card to go away.

## Status lines while Ella works (normal, not errors)

- **Just a moment, setting things up...** — Ella's workspace is starting or waking up after a break. Normal; takes a little longer on the first message after idle.
- **Upgrading your app - this can take a few minutes...** — An older app is being moved to the current system. One time only.
- **That took longer than expected - trying again...** — The first attempt produced nothing; it retries by itself.
- **Tidying up the conversation memory...** — A long chat is being summarized so it can continue.
- **"I've reached the step limit for a single message, so I'm pausing here."** — a very large request used up one message's steps. The work so far is saved; reply **continue** (`building/chat-with-ella.md`).
- **Creating the app's cover image...** — Capturing the app's cover picture.
- **Deploying code actions... (x/y)** — Custom code steps are being published after the turn.

## Preview problems

- **"<Page> didn't load properly"**: click **Please fix!**. That sends the error to Ella in a new chat. Or click **Reload page**.
- **First build failed** ("The first build didn't finish"): click **Build again**. The Activity log shows what went wrong.
- **"This app hasn't been built yet"**: click **Build app**.
- There's no console or error panel in the builder. Describe what you clicked and what happened to Ella or support.

## Other messages

- **"Request failed"** or a generic "Something went wrong on our side": usually temporary. Retry or reload. If it persists, contact support.
- **A full page reading "404 Not Found"** ("The page you're looking for doesn't exist or has been moved"): the link is wrong, or what it pointed to was removed. Click **Go home** (signed in, that's **My apps**), or **Go back** when it was reached from another Blocks page.
- **A full page reading "Something went wrong"** ("An unexpected error occurred"): click **Reload page** (or **Go back**, offered when it was reached from another Blocks page). If it keeps happening, contact support.
- **"Switch to draft to edit?"**: a draft exists, so Live is read-only. Edit in the draft (`building/versions-and-publishing.md`).
- **Edits fail after someone made a draft live or discarded it in another tab**: reload the page.
- **"You don't have access to this app"** ("Ask someone who manages it to invite you"), on opening an app: you aren't a member of it (or were removed) and its General access doesn't let the whole account in. Someone who builds or manages it can invite you (**Share**, or a solution's **Settings → Members**).
- **"Couldn't load this app"**: the app failed to load. Check the connection and reload.
- **"Couldn't load versions"**: check the connection and reload.
- **"Couldn't load this diff"** in a chat's file changes, or **"Couldn't load this diagram"** in a chat or a plan: check the connection, then reload the page.

## Long-running action and run-control errors

See `building/logic-world.md` → "Retries and pausing on failure" and "Long-running actions".

- **DURABLE_REQUIRES_ASYNC** — something tried to run a long-running action and wait for its answer. It can only be started in the background and checked on later; ask Ella to change the caller (a button, a code step, or another action using it as a step).
- **DURABLE_RUN_LIMIT** — the account already has 5 long-running runs going. Wait for one to finish, or cancel one, then start again.
- **RUN_NOT_RESUMABLE** — the run has already ended (finished, cancelled, or waited 24 hours without a resume), so it can't be resumed. Start a new run.
- **NOTHING_TO_RESUME** — the run is still working: it isn't paused and nothing in it is waiting to be resumed.
- **RUN_NOT_RUNNING** — the run has already ended (finished, failed or cancelled), so it can't be paused.
- **RUN_NOT_FOUND** — no run with that id in this account: the id is wrong, or the run belongs to another account. A temporary connection problem shows as a normal error instead, so it's worth retrying.
- **RUN_NOT_PAUSABLE** — the run was started by something that waits for its result, so it can't be paused. It can still be cancelled.
- **RUN_NOT_CONTROLLABLE** — the run started before pause, resume and cancel were available for it, so it can't be controlled. Let it finish and start a new run.
- **CREDITS_EXHAUSTED** — usage credits ran out mid-run. The run waits 24 hours: top up or upgrade (`billing/credits.md`), then resume it; finished items aren't redone. Not resumed in time, it fails with this error.
- **LOOP_ITEM_FAILED** — a loop item failed and the loop stopped, and the run wasn't resumed within 24 hours (or failed at once, when the action's **When a step fails** is **Fail the run**). Fix the cause and start a new run (or set the loop to continue past failed items).

## Common Ella problems (from support)

- **Ella says something is done but it isn't.** Test it yourself, then describe exactly what you clicked, what you expected and what happened. Use **Select on page** to point at the element.
- **Ella redoes or breaks finished work.** Ask for one change at a time and add "Don't change anything else". If a change went wrong, **Restore** the previous version from **Version history**.
- **Ella is stuck working for a very long time.** Press **Stop**, then try again. If it keeps happening, contact support and stop resending the same message.
- **The user says your earlier directions to a Blocks setting were wrong.** Re-check the click path in this skill and correct yourself plainly. If this skill doesn't cover that setting, say so and point them to support rather than guessing again.
- **The app uses many more usage credits than expected.** See "Unexpected usage" in `billing/credits.md`.
- **Very large apps** (dozens of tables) make Ella slower and more error-prone. Remove unused tables, or split the app into smaller apps.
