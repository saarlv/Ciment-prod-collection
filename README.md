# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Running locally against the Blocks backend

To run this app locally (e.g. `pnpm dev` or `pnpm preview`) while talking to the Blocks API in the cloud:

1. Environment variables: a `.env` file is included in the repo with:
   - **`VITE_BLOCKS_API_HOST`** – `https://blocks.diy`
   - **`VITE_APP_ID`** – Your app ID from Blocks (set when the repo is synced)

2. Run the dev server or preview:

   ```bash
   pnpm dev
   # or
   pnpm preview
   ```

3. **Log in**: With `VITE_BLOCKS_API_HOST` and `VITE_APP_ID` set, opening the app in the browser shows the app's login screen. Enter your email to receive a magic link; click it to sign in (the link brings you back to your local URL). Alternatively, set `token-<your app id>` in `localStorage` (e.g. copy the token from the Blocks platform after logging in there).

4. **Git branches**: on a checked-out branch that has a branch version in Blocks, `pnpm dev` runs on that version: the app reads and writes the branch's data and runs its actions, as the builder does on the branch (the browser console names the version). On the main branch, or a branch Blocks doesn't know yet, it runs on live. To choose a version yourself, set **`VITE_APP_VERSION`** in `.env.local` (`0` = live) and restart `pnpm dev`.

`src/main.tsx` renders the SDK's `BlocksApp`, which hosts the app on the dev server itself: the login, the token, the app's fonts and its routes. Without `VITE_APP_ID` the page stays empty and the console says to set it.
