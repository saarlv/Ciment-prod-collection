# Blocks desktop app

The Blocks desktop app is an app for Mac and Windows that opens Blocks in its own window and keeps running in the menu bar (Mac) or system tray (Windows). It also shows Blocks notifications as desktop notifications. It's called **Blocks** on your computer (Dock, Start menu, Login Items, Notifications settings). Copies installed before the rename may still be listed as **Blocks Desktop** in some places, such as the file name in Applications.

## Getting it

- On the web: **avatar menu** → **Download desktop**, then pick **Mac with Apple silicon**, **Mac with Intel** or **Windows**.
- Not sure which Mac you have? **Apple menu** → **About This Mac**. "Chip: Apple M…" means Apple silicon; "Processor: Intel" means Intel.
- **Download desktop** isn't shown inside the desktop app itself.
- Sign in once in the app window; it stays signed in like a browser does. Signed out, the app opens on the **Log in** page (also after **Log out**). Enter your email and click the link in the email: it opens your browser, which hands the sign-in back to the app. **Continue with Google** also signs in through your browser.

## Opening it

- Opening the app (from the Dock, Applications or the Start menu) opens the Blocks window.
- On Mac, clicking its Dock icon while it runs brings the window back.
- **Open at login**: tray menu → **Configure...** → **General** → tick **Open at login** → **Save**. The app then starts in the menu bar (Mac) or system tray (Windows) when you log in, without opening a window, so notifications keep arriving. On Mac, if the setting says macOS needs your OK, allow **Blocks** (or **Blocks Desktop** on an older install) in **System Settings** → **General** → **Login Items**.
- Closing the window doesn't quit the app: it keeps running in the tray/menu bar, still showing notifications. Use **Quit** in the tray menu to stop it.

## Tabs

The window has tabs, like a browser, so you can keep several apps or pages open at once. Each tab is named after its page: the app's name inside an app, **My apps**, or the settings page (for example **Billing**). Browser tabs on the web use the same names.

- **New tab**: the **+** at the end of the tabs, or ⌘T (Ctrl+T on Windows). It opens your apps.
- **Open a link in a new tab**: ⌘-click (Ctrl-click) or middle-click it. Links that open in a new tab on their own open as a tab too.
- **Switch**: click a tab; ⌘1–⌘8 (Ctrl+1–8) jumps to that tab, ⌘9 to the last one; Ctrl+Tab and Ctrl+Shift+Tab go to the next and previous tab.
- **Close**: the **×** on the tab, middle-click the tab, or ⌘W (Ctrl+W). Closing the last tab closes the window; the app keeps running in the tray.
- Clicking a desktop notification opens its page in a new tab (or switches to a tab already showing it), so it never replaces what you're working on.
- Tabs aren't kept when the app quits; it reopens with one tab.

## Back, forward and reload

Left of the tabs are **Back**, **Forward** and **Reload** buttons for the current tab, as in a browser. Back and Forward are greyed out when there's nowhere to go.

- **Back** / **Forward**: ⌘[ and ⌘], or ⌘← and ⌘→ when you're not typing in a text field (Alt+Left and Alt+Right on Windows). On Windows, the mouse's back and forward buttons work too.
- **Reload**: ⌘R (Ctrl+R or F5 on Windows). **View** → **Force Reload** (⌘⇧R / Ctrl+Shift+R) reloads without the cache.
- **Zoom**: ⌘+ / ⌘− / ⌘0 (Ctrl on Windows), also under **View**.

## Find in page

⌘F (Ctrl+F on Windows), or **Edit** → **Find** → **Find…**, opens a **Find in page** bar at the top right of the current tab, as in a browser. Type to highlight every match on the page; the bar shows which match you're on and how many there are (for example 2/9, or 0/0 when there's none).

- **Next** / **Previous match**: Enter and Shift+Enter, the ↓ and ↑ buttons, or ⌘G and ⌘⇧G (Ctrl+G / Ctrl+Shift+G or F3 / Shift+F3 on Windows). They wrap around at the end of the page.
- **Close**: Esc or the **×**. The current match stays selected; ⌘F again reopens the bar with your last search.
- Switching to another tab closes the bar.
- Where a page has its own search box for ⌘F (such as a code editor), that one opens instead while you're in it.

## The tray / menu bar icon

The Blocks "B" in the menu bar (Mac) or system tray (Windows). Click it to open Blocks. A coloured dot appears only when **Cloud Sync** is turned on and set up: green while it's on, red after a sync failed (the menu then says **Cloud Sync: On** or **Cloud Sync: Last sync failed**). Without cloud sync there is no dot.

Its menu has:

- **Open Blocks**.
- **Desktop Notifications**: a checkbox that turns desktop notifications on or off.
- **Configure...**: the app's settings. **General** has the Blocks URL, **Open at login**, **Check for updates automatically** and a **Check for Updates…** button with the installed version; **Modules** has the local features some apps use (watched folders, cloud sync). **Save** closes the window; changing the URL or the modules restarts the app.
- **Open Logs**: what to send support if something goes wrong (see `account/support.md`).
- While an update downloads or is ready, its progress or **Restart to Update** (see below).
- **Quit**.

## Desktop notifications

- The app shows the same notifications as the bell (see `navigation/notifications.md`) as desktop notifications: when Ella finishes working, and the ones your apps send with **Send Notification**.
- They work while the app is running, even with its window closed, as long as you're signed in.
- Unread notifications that were already waiting show too: when you first sign in, and when the app starts after being closed.
- On Mac, the app's Dock icon shows the account's unread count, the same number as the bell outside an app.
- They show even while the Blocks window is open in front, so you'll see when Ella finishes while you wait in the builder.
- Several at once show as one "You have N new notifications".
- Clicking one opens what it's about and marks it read.
- Ella's "finished working" notification shows its text. A notification from an app's **Send Notification** step shows only "New notification", so no app data appears on screen; clicking it opens the app.
- They always show, whether or not the step's **Also notify their phones** is on.
- They follow your notification settings on the web (**User** → **Notifications**, see `navigation/notifications.md`): a kind whose **Desktop** switch is off doesn't show, and nothing shows while notifications are paused. Those don't show later either, but they're still under the bell and in the Dock count.
- Inside the app, **User** → **Notifications** → **Desktop notifications** has no **This browser** switch: it says the app shows notifications itself and points to the tray menu. The bell's panel doesn't offer **Turn on** in the app either.
- No notifications? Check the **Desktop Notifications** checkbox in the tray menu, that the kind's **Desktop** switch is on and notifications aren't paused in **User** → **Notifications**. If the computer is blocking them, the tray menu shows **Allow Notifications in System Settings…**, which opens the right settings page (on Mac, **System Settings** → **Notifications** → **Blocks** (or **Blocks Desktop** on an older install); on Windows, **Settings** → **System** → **Notifications**). Also check that Focus / Do Not Disturb is off.

## Updates

- The app updates itself. It checks for a new version in the background and downloads it.
- Once an update is ready, it offers to restart: click the notification, or **Restart to Update** in the tray menu.
- If you don't, the update installs the next time you quit. When the app has been idle for a few hours, it restarts by itself to install it.
- **Configure...** → **General** → **Check for Updates…** checks right away and says the result: up to date, downloading a new version, or that it couldn't check.
- Untick **Check for updates automatically** (then **Save**) to stop background checks and automatic restarts; updates then come only from **Check for Updates…**.
