# Versions: live, drafts, history and restore

## Live by default

When the version switcher (top-right) says **Live**, everything Ella changes **goes live automatically at the end of her turn**. There's no publish or deploy button, and app users get the change the next time they load the app.

"Publishing" in the sense of **who can open the app** (Private/Public) is a separate setting, under **Share → Publish**; see `sharing-and-access/share-dialog.md`.

## Drafts (to test before users see changes)

1. Open the version switcher and choose **Create draft version**. You switch into the new draft.
   - Only **one draft** can exist at a time.
   - Drafts are never created automatically.
2. In the draft, all of these change only the draft, and the live app stays untouched:
   - Ella's changes
   - your page and workflow edits
   - settings changes

   The canvas previews the draft.

3. **While a draft exists, Live is read-only.** Trying to edit Live asks **Switch to draft to edit?**
4. When ready, click **Make live**. It's on the Draft row of the switcher, or in the "…" menu of the draft's version card.
   - There's **no confirmation step**.
   - Users get the new version on their next load.
5. To throw the draft away, use **Discard draft** (trash icon) and confirm. The live app is never affected.

**Good to know:**

- **These are not versioned and change live immediately even while you're in a draft:**
  - uploaded files
  - integration connections and secrets
  - code-action deployments
- **Data:**
  - In a draft you see live data plus rows created in the draft.
  - Edits in the draft don't change live rows.
  - Rows created in the draft are **not** carried over when it goes live.
- **Schedules and triggers run from the live version only.** After changing a schedule in a draft, make the draft live.
  - Exception: a date trigger (a date column ± an offset) also fires for rows created or edited in a draft, and runs the draft's workflow.
- The app's public link always serves **live**.
- **Other tabs:** after a **Make live** or discard, reload other open tabs (and ask teammates to reload). A tab still pointing at the old draft fails until it's reloaded.
- **Creating**, making live, discarding and restoring are disabled while Ella is working. Viewing other versions still works.

## Version history and restore (undo)

- Open it from the chat's **More (…)** menu → **Version history**.
- Every build that changes the app saves a version card, from any chat. Each card shows:
  - a title and summary
  - **Live** / **Draft** / **Discarded** badges
  - the files that changed
- **Restore** is in a card's "…" menu. It returns the app to that version.
  - There's **no confirmation**.
  - **Everything built after that point is undone**, including later fixes.
  - Note down the version you're on before large changes.
- There is no per-message "undo" button and no "regenerate". Restore is the undo.
- Restore covers the app (pages, logic, data structure), **not the data in your tables**. Deleted rows have to be re-entered; the Activity log (Data filter) shows what was deleted.
  - [flag: data-revert] Data changes are undone from the Activity log instead: **Revert this change** on a Data entry (`navigation/builder-layout.md`).

## GitHub branches [flag: git-sync]

If the app is connected to GitHub (**Settings → Git Sync**), branches replace drafts:

- **Branches → Create new branch** in the version switcher.
- Each branch has its own chats.
- Branch actions: **Push to GitHub**, **Sync from GitHub**, **Create pull request**, **Merge into main** (with **Resolve in chat** for conflicts).
- A conflict is a file with conflict markers in it; the branch can be merged into main once none are left. A very large text file both sides changed gets one conflict around the part that differs, holding both versions, so neither side's edits are lost. A binary file (an image, say) both sides changed keeps the branch's copy and blocks the merge until it is replaced or deleted on the branch. Conflicts left from another branch's merge that already reached main never block a branch.
- A branch reaches users by being **merged**, not by "Make live".
- On a branch, **Restore** creates a revert commit.
- Running the repository locally (`pnpm dev`) with a branch checked out uses that branch's version, so the app reads and writes the branch's data, as the builder does on it. On the main branch, or a branch Blocks doesn't know yet, it uses live. `VITE_APP_VERSION` in `.env.local` picks a version explicitly (`0` = live).

In the Blocks mobile app, branches live in the app's **Settings → Git Sync** [flag: git-sync]:

- The check mark shows the branch Ella builds on **when you chat from that phone**; tap another branch (or **Live**) to switch. It's per device, like the web's version switcher is per browser, and Ella's chat shows the branch under the app name.
- **New branch** starts from the main branch, and Ella builds there right away.
- Tap ⓘ on a branch for **Build on this branch**, **Update from main**, **Merge into main** (merge and delete the branch, or keep it), **Push to GitHub**, **Sync from GitHub**, **Open pull request**, **View on GitHub** and **Delete branch**. ⓘ on **Live** has **Push Live to main** and **Sync Live from main**.
- Merge conflicts show as a banner with **Resolve with Ella**, which opens a new chat on that branch.
- **Version history** in the chat shows that branch's history while you're on it.

### Ella working on branches

On an app connected to GitHub, Ella can manage branches herself while she builds (web builder, Build mode):

- Give her several tasks at once — or, when a Linear project is connected to the chat, ask her to work through its issues — and she creates one branch per task from the main branch and starts a chat on each, all working at the same time (up to 5 per reply; ask again for more). If you're out of builder credits, no branch is created. Your builder stays where you are, and her reply lists the branches. Open a branch from the version switcher to follow its chat and preview its work; each of those chats uses builder credits like any other.
- On a single task she creates its branch, builds it there, merges main in and resolves conflicts when the branch falls behind. When she moves the builder to a branch herself, the version switcher changes and a new chat opens on that branch with the task already sent ("Continue on <branch>: …"). Keep the builder tab open while she works; if you switch to another branch yourself while she's working, she stops and leaves a notice instead of moving you.
- Merging main into a branch shows as a short line in the chat and runs on its own.
- **Merging a branch into main** (which updates the live app) and **deleting a branch** always ask first: an approval card with **Merge** / **Delete branch** and **Not now**. Nothing changes until you approve. (When she works in git, merging is different: see below.)
- She can see which branches have a chat working on them right now. She won't move you to, merge or delete a branch while another chat is working on it; she tells you, and you can ask again once that chat has finished.
- She won't delete the branch the chat is on; she does that from Live or another branch.
- After 20 automatic branch moves in a row she stops; send any message to let her continue.

### Ella working in git

On an app connected to GitHub (with the app at the repository root, not in a subfolder, and not using company data: saved queries, search indexes or data requests), Ella works in a real git checkout of the branch you're on, like a developer would:

- She commits her changes with clear messages and pushes them to the branch; the app updates from what she pushed. Anything she leaves uncommitted is committed and pushed for her when her reply ends, in a commit titled after what that reply did.
- She can merge main into the branch, look at history and diffs, and resolve merge conflicts herself with git.
- When you ask for a change on a new branch (or she has a list of tasks), she creates the branch herself from the main branch, does the work there in the same reply and pushes it; the branch then shows up in the version switcher on its own, and the branch you were on (Live included) stays untouched. Open it from the version switcher to see the change.
- A branch pushed to GitHub by a developer shows up in the version switcher the same way.
- She merges a branch into main herself with git, but only when you ask her to (if your message didn't clearly ask, she checks with you first); there is no approval card for it. She brings the branch up to date with main first, then merges it and pushes main, and the live app updates from it. If the repository protects its main branch, she uses the merge approval card instead, which opens a pull request when the repository requires review.
- Deleting a branch still shows the approval card above.
- Her commits appear on GitHub as **Blocks builder**.
- If she finishes on the main branch while you're on another branch, or in the middle of an unfinished merge, nothing from that reply reaches the app and a notice says so. Her unfinished work is set aside; ask her to continue and she'll restore it and finish.
- The phone doesn't update live when someone pushes to GitHub: pull down on the screen to refresh.
