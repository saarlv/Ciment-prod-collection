# Notifications (the bell)

Notifications collect updates about your apps in one place, on the web and in the Blocks mobile app. [flag: notifications-center]

## What shows up

- **From Ella** — when Ella finishes a message you sent (with a short summary), asks you a question, needs your input, or couldn't finish. Opening one takes you to that chat with Ella. See **Notifications from Ella** below.
- **Notifications your apps send** — from a workflow's **Send Notification** step (see below). Opening one takes you where the step chose: the app (on the page the step chose, like that order's page), the app's builder, or a Blocks page.
- **Out of usage credits** — when the workspace runs out of usage credits and an app's action is refused: once a day (UTC) to every admin and member, with a credit-card mark on the app's tile. An admin's opens **Plans**; a member's opens the app. It shows in the bell of the app whose action was refused, so someone who muted that app doesn't get it. See `billing/credits.md`.
- **From the app's agents** — an agent telling you something, asking you a question, or asking you to approve one of its actions; the app's tile carries a small bot badge. Opening one takes you to that conversation in the app. See **Notifications from agents** below.
- Those are the kinds today. More will show up over time; don't promise any specific one.
- Notifications are per account: switching account shows that account's notifications.
- Notifications older than 90 days are removed.

## On the web

- **Outside an app**: the **Notifications** row (bell icon) at the bottom of the left rail, right above your avatar. It shows every notification in the account.
- **Inside an app**: the **Notifications** row at the bottom of the app's rail, under **Share** and right above your avatar — the same spot as outside an app. It shows only that app's notifications by default: two tabs under the panel's title, the app's name (with its icon) and **All apps**, say which, and **All apps** switches to every notification in the account without leaving the app. Inside a solution the first tab is the solution's (the solution and all its apps). If you muted the app, its bell shows struck out.
- Unread shows as a count on the bell's corner, whether the rail is collapsed or expanded ("99+" past 99).
- The browser tab shows the bell's unread count too, ahead of the page title ("(3) My apps"), and a dot on the tab's icon while anything is unread. Outside an app that's the account's count; inside an app it's only that app's (inside a solution, the solution's), the same as its panel. Inside a solution whose white label puts it in the browser tab, the count and dot go on the solution's name and icon. Safari usually shows the count in the title only.
- Clicking the row opens the panel beside it, newest first; scroll down for older ones.
  - Opening the panel marks what it shows as read. They keep their blue "new" dot until you close the panel.
  - **Mark all as read** marks everything in that panel read (inside an app: only that app's).
  - Clicking a notification opens what it's about and closes the panel.
  - The settings icon at the top of the panel opens **Notification settings** (see below). Inside an app (on the app's tab) it's a bell icon instead, showing the app's current setting, with a menu: **All notifications**, **Bell only** or **Muted** for that app (see **Per app** below), and **All notification settings** at the bottom. Inside a solution the choice applies to the solution and all its apps.
  - When the app is set to **Bell only** or **Muted**, the panel says so at the top, with **Turn on alerts** or **Unmute** to undo it in one click.
  - While desktop notifications are off in this browser (and the browser hasn't blocked them), the panel offers them at the top: **Turn on** asks the browser's permission. The **×** hides the offer for good in this browser.

## Desktop notifications

An alert on your computer when a notification arrives, even while Blocks is in another tab or minimized — like a phone banner, for the browser. [flag: notifications-center]

- Turn them on in **User** → **Notifications** → **Desktop notifications** (the **This browser** switch), or with **Turn on** in the bell's panel. The browser then asks to allow notifications for Blocks; choose **Allow**.
- They are per browser and per account: turn them on in each browser you use, and in each account (each account has its own address).
- They only arrive while the browser is running. They show even when Blocks is the window you're looking at.
- They show the same text as phone notifications: in a HIPAA workspace just a generic line, never app data. Clicking one opens what it's about (in the Blocks tab you already have open, if any) and marks it read.
- Opening the bell's panel clears the ones on screen (the app's bell clears only that app's).
- **Send test** (next to the switch, once they're on) shows a test notification on this computer only.
- Signing out from the avatar menu turns them off in that browser for that account, and whoever signs in there next never gets yours.
- **"Blocked by your browser"**: the browser was told not to allow notifications for Blocks, and only the browser can undo that. Open the site's settings (the icon left of the address), allow **Notifications**, and come back.
- **"This browser can't show desktop notifications"**: the browser has no web push. On iPhone and iPad, Safari only allows it for sites added to the Home Screen.
- In Brave, push messaging is off by default: turn on **Use Google services for push messaging** in Brave's privacy settings, then try again.

## Notification settings

**User** → **Notifications** (in the account settings rail) holds your own notification settings in this account. Every member has their own. [flag: notifications-center]

- **Desktop notifications**: this browser's switch (see above).
- **Notify me about**: for each kind of notification — **Builder agent** (everything Ella sends), **Notifications from your apps**, **Credits** (out of usage credits), and for an app's agents **Agents waiting for you** (their questions and approvals) and **Messages from agents** (what they tell you, reminders they followed up on, and their replies to answers you gave from a notification) — a **Desktop** and a **Mobile** switch: whether it alerts you on your computers and on the Blocks mobile app. Everything still shows under the bell either way, and the badge still counts it.
- **Apps**: how much each app notifies you (see **Per app** below). The card lists only the apps you changed; **Manage apps** opens every app in the account, with a search, to set each one.
- **Working hours** (**Any time** by default): pick when desktop and mobile alerts go out — **Every day**, **Weekdays (Mon–Fri)** or **Weekdays (Sun–Thu)** with one start and end time (9 AM to 6 PM to start), or **Custom** to tick each day on or off and give each its own times. Times are every half hour, and an end earlier than the start runs past midnight. Times follow the **Time zone** in **My profile** (see `navigation/platform-layout.md`). Outside those hours alerts are skipped, not sent later; notifications still collect under the bell. While no time zone is set, alerts go out at any time. Pick **Any time** to turn working hours off.
- **Pause notifications**: **Pause…** stops desktop and mobile alerts **For 30 minutes**, **For 1 hour**, **For 4 hours**, **Until tomorrow morning** (8 AM your time), **Until Monday morning** or **For a week** — or **Pick a date and time…** for any day and time up to a year ahead. The row then says until when; **Change…** moves the end, **Resume** ends it early. Notifications still collect under the bell meanwhile.

## Per app

Each app (or solution) can be set to one of three levels, by each person for themselves, in this account. Set it from the bell inside the app (the bell icon at the top of its panel), from **User** → **Notifications** → **Apps** → **Manage apps**, or in the Blocks mobile app (the bell at the top right of an app's notifications, or **Settings** → **Push notifications** → **Notifications by app**); all are the same setting. [flag: notifications-center]

- **All notifications** (the default): as usual — in the bell, and alerts on desktop and phone as **Notify me about**, working hours and the pause allow.
- **Bell only**: the app's notifications still show under the bell and count on the badge, but never alert on desktop or phone, whatever the kind.
- **Muted**: nothing from the app reaches you — not in the bell, not on the badge, no alerts. Notifications sent while it was muted aren't delivered later; unmuting only brings new ones. Muting an app also mutes Ella's notifications about it, and you can't answer a question the app sends while it's muted.

In those settings lists, a solution's row sets the solution and every app in it, as its bell does, and reads **Mixed** while they're set differently. Integrations and tools don't send notifications, so they aren't listed.

## In the Blocks mobile app

- A **Notifications** tab (the bell) between **Apps** and **Settings**, with the unread count on the tab. The Blocks app icon shows the same count as a badge on iPhone.
- Inside an opened app, a bell at the top right (next to the **…** button) opens that app's notifications. In an app that's part of a solution, it opens the whole solution's (see `building/solutions.md`). A switch at the top shows whose they are — the app's name, or **All apps** for every notification in the account. The bell at the top right of that screen sets how much the app notifies you (**All notifications**, **Bell only**, **Muted**; see **Per app**), and when it's Bell only or Muted a line above the list says so, with **Turn on alerts** or **Unmute**. A muted app's bell in its header is struck out.
- Pull down to refresh. **Mark all as read** sits at the top of the list.
- Tapping a notification opens what it's about.
- **Settings** → **Push notifications** holds the same notification settings as the web (see Notification settings above), for this account on every device: **Allow notifications** (this phone's banners, below), then for each kind a **Phone alerts** and a **Desktop alerts** switch, **Apps** → **Notifications by app** (every app, with a search; tap one to pick its level), **Working hours** (**Any time**, **Every day**, **Weekdays (Mon–Fri)**, **Weekdays (Sun–Thu)** or **Custom**, with **From** and **To** times every half hour) and **Pause notifications** (the same quick picks as the web, and **Resume now**; picking an exact date and time is web-only). Changes made on the web show up when the app comes back to the screen.
- Phone notifications (banners) are a separate setting: **Settings** → **Push notifications** → **Allow notifications**. With them off, notifications still appear in the **Notifications** tab. A kind of notification whose **Mobile** switch is off in your notification settings on the web (**User** → **Notifications**, see Notification settings above), or any notification while they're paused there or outside the working hours set there, shows no banner, even with this on.
- The app offers to turn them on right after you sign in, and again when you send Ella a message ("Get notified when Ella's done"). **Turn on notifications** shows the phone's own permission prompt; **Not now** asks again later (a few times at most).
- If the phone was told not to allow them, the app can't ask again; only the phone's settings can turn them back on. **Settings** → **Push notifications** then shows "Off in Settings" with the steps and an **Open Settings** button that goes straight to the app's notification settings:
  - iPhone: Settings → Apps → Blocks → Notifications → turn on **Allow Notifications** (on iOS 17 and earlier, Blocks is listed directly in Settings).
  - Android: Settings → Apps → Blocks → Notifications → turn on **All Blocks notifications**. If only the **Activity** category is off, turn that on. Menu names vary a little by phone maker.
  - Back in the app, the switch turns on by itself.

## Notifications from Ella

Sent to the person who sent the message, never to teammates. A stopped message sends nothing. Each chat keeps one notification on your phone: a newer one replaces the last. Opening any of them takes you to that chat; you can't reply to Ella from the notification itself.

- **Finished**: titled with what was done (the same title as the version, for example "Added customer search"; "The builder agent finished working on your app" when there isn't one), with a short summary of everything Ella did in that message and anything left for you to do.
- **"The builder agent has a question"**: shows the question; open the chat to answer it.
- **"The builder agent needs your input"** (or a more specific title, like "The builder agent's plan is ready for review"): a plan to review, a suggested mode switch, or something to connect (a mailbox, a phone number, integrations). Open the chat to continue.
- **"The builder agent couldn't finish"**: open the chat to try again. Nothing was charged for a failed message.

## Replying from a notification

Notifications from apps whose **Send Notification** step offers answers, and agents' questions, approvals and replies, can be answered without opening anything (Ella's can't; open the chat instead).

- **On the web**: the row under the bell and desktop alerts (option buttons only, when the browser has room for all of them) show the options and a reply field; **Send** sends what you typed. Afterwards they show "You answered: …".
- **On the phone**: long-press (iPhone) or expand (Android) the notification to see the options and the reply field. When the options and the field don't all fit, the options are shown; open the notification to type instead.
- Each notification takes one answer. Answering on one device shows "You answered: …" on the others and clears the alert there.
- In a HIPAA workspace, phone and desktop alerts show only a generic line ("New notification"), never app content or the options; the reply field still works, and opening the notification shows the full text and options.
- If a reply can't be sent, the notification says why ("Your reply wasn't sent" on desktop and phone), e.g. "You're signed out. Sign in again to reply.", "You can't reply to this one." or "This notification isn't available anymore."; when it can be, try again from the notification or the bell.

## Notifications from agents

An app's agents can notify people too: the app's agent conversations run on their own (from a workflow, WhatsApp, email), so a notification is how they reach someone who isn't watching.

- **When an agent is waiting for you**: a conversation that runs without anyone in the chat (started by a workflow, a WhatsApp or email message, a reminder the agent set, or a change the agent made to itself) and stops to ask a question or to get a tool set to **Ask** approved notifies the person it runs for:
  - **"<Agent> has a question"**: the question, with its choices as quick answers (when there are 4 or fewer and the question takes one answer) and a field to type an answer.
  - **"<Agent> wants to run <action>"**: what the action will receive, with **Approve** and **Reject**. Several actions waiting together are approved or rejected together.
  - Answering from the notification continues the conversation right away. Chats where someone is talking to the agent ask in the chat instead and send nothing.
- **When the agent decides to**: an agent with **Notify people** on (the agent page → **Advanced settings**, off by default) can send a notification on its own — to the person its conversation runs for, to the app's builders (for example to escalate a customer conversation), or to everyone in the app — for example when a long task is done or something needs attention. It may offer quick answers or a reply field; the answer reaches the agent as your next message in that conversation. An agent sends at most a few per run, and none from a chat with someone who isn't signed in (a public chat). To change when it notifies, change the agent's instructions (Ella can do it, and turns the setting on: "notify the sales team when a lead asks for a demo").
- **After you answer from a notification**, the agent tells you how it went the same way: **"<Agent> replied"** with its reply (which you can answer again, so a whole exchange can happen from the notification), a new question, or **"<Agent> couldn't finish"**.
- If the question was already answered somewhere else (in the conversation, or on another device), an answer from the notification does nothing. If it can't be applied from the notification, you get a notification asking you to answer in the conversation.
- Opening any of them takes you to the conversation inside the agent's page in the app (or the app's home page, if the app doesn't have one for that agent).
- In a HIPAA workspace, phone and desktop alerts show a generic line ("An agent has a question"); the full text and the choices show in Blocks, and answering still works.
- Tune them under **Notify me about**: **Agents waiting for you** for questions and approvals, **Messages from agents** for everything else — for example approvals on the phone but messages only on the computer. Per app, the app's level (**Per app** above) covers its agents too: **Bell only** keeps them out of your alerts, **Muted** stops them.

## In the Blocks desktop app

The desktop app shows new notifications as desktop notifications, even with its window closed, following the **Desktop** switches and the pause in your notification settings. It doesn't use the **This browser** switch: that's for web browsers, and inside the app it's replaced by a note pointing to the tray menu's **Desktop Notifications**. See `navigation/desktop-app.md`.

## Sending notifications from your app

Add the **Send Notification** step to a workflow (it's in the Notifications app's actions, beside Send Email and Send SMS). It notifies people in your workspace (admins and members) — never your app's end users, even ones invited to the app:

- **Send to**: who gets it.
  - **Specific people** (also what an empty **Send to** means): the **Recipients** — emails or user ids of workspace members (mixing both is fine), separated by commas or new lines, or a list from a workflow value. Anyone who isn't an admin or member of this workspace is skipped (the step reports them back as not found).
  - **All workspace members**: every admin and member of the workspace.
  - **All app members**: the workspace's admins and members who were added to this app or have opened it — not everyone who could open it. Only works in a workflow that runs in an app.
    - **App roles** (optional): only app members with any of these roles, by role name, separated by commas or new lines. A role the app doesn't have is reported back as not found; if none of them exist, nobody is notified.
    - **App access**: **Anyone in the app**, **Builders (can edit the app)** or **Users (can use the app)**.
- **Skip the person who triggered it**: don't notify the person whose action ran the workflow (for example, whoever saved the record), even if they'd otherwise get it. For a scheduled workflow, that's whoever set up the schedule.
- **Title** (required) and **Message**: what the notification says. They can use values from the workflow.
- **Image** (optional): an image uploaded to Blocks — an image field from your data, or an app or profile image. Links to images elsewhere are refused. It shows with the notification in Blocks. App and profile images also show on Android phones and in desktop notifications on Windows and ChromeOS (not on iPhone banners or on a Mac, and not in a HIPAA workspace); images from your data show only inside Blocks.
- **Opens**: **A page of this app** (the default), **This app's builder**, or **A Blocks page**.
- **Open page**: the page to open, like `/orders/123` — optional for a page of this app, required for a Blocks page. A page of this app opens on the web and in the Blocks mobile app alike; one the app doesn't have opens the app's home page.
- **Priority**: **Normal** or **Urgent**. Urgent notifications are marked **Urgent** in the list, and desktop notifications for them stay on screen until dismissed.
- **Also notify their phones**: on by default. The phone shows the title and the start of the message; opening it shows the full notification. In a HIPAA workspace the phone shows only "New notification" and no image, so no app data appears on the lock screen; opening it shows the full notification.
- **Notify once per** (optional): a value such as the order's id. Each person gets one notification per value, however many times a workflow in this app runs with it (for 90 days). Empty means every run notifies.
- **Quick answers** (optional): up to 4 answers people can tap right from the notification, at most 40 characters each — one per line, separated by commas on a single line, or a list from a workflow value. The **Title** or **Message** asks the question. More than 4, or a longer one, fails the step with a message saying so.
- **Allow typed reply**: off by default. On, people can also type their own answer from the notification. **Reply placeholder** (optional) is the hint in that field; empty shows "Reply…".
- **Reply key** (optional): a name for what the notification asks, like `order-approval`, so a **When a notification is answered** trigger can run only for answers to it. Letters, numbers, spaces and `. _ : -`, up to 128 characters; case doesn't matter and spaces count as `-`.
- **Reply context** (optional): a value handed back with the answer, usually the record's id (like the order id), so the workflow that runs knows what was answered. Up to 1,000 characters.
- **Replace earlier notification with the same key** (optional): a value such as the order's id. A newer notification from this app with the same value replaces the earlier one's alert on phones and computers instead of stacking up; both stay under the bell. Only matters when **Also notify their phones** is on.

The notification shows in the bell (and in this app's own bell) for each recipient. The step's result says how many people it notified, lists recipients and roles that weren't found, and says whether it asked for an answer (with its **Reply key**). Older steps with **Notify all workspace members** ticked keep notifying the whole workspace.

**Acting on the answers**: add a workflow with the **When a notification is answered** trigger (under **Add trigger** → **Triggers**). It runs each time someone answers a notification this app's **Send Notification** step sent — a quick answer they tapped or a reply they typed, from their phone, a desktop alert or the bell. Set its **Reply key** to run only for answers to steps with the same key; empty runs for any answer to this app's notifications. The workflow gets the answer (`answer`: the quick answer or the typed text; also `value`, `label` and `text` separately), the step's **Reply context** (`replyContext`) and **Reply key** (`replyKey`), who answered (`repliedBy.userId`) and when (`repliedAt`). Each person who got the notification can answer once, so a notification sent to three people can run the workflow up to three times. Only the app's live workflows run, not unpublished draft changes. Quick answers and typed replies only work in a workflow that runs in an app. In an app installed from another workspace, answers don't run the app's workflows (they're still recorded on the notification).

## Read on one device, read everywhere

Reading a notification, or **Mark all as read**, on one device updates the bell on every open browser tab and the badge on your phone, and removes its alert from your other devices.

## Common questions

- **"I don't see the bell"** — it may not be enabled for this account yet; support can help.
- **"The badge on my phone is wrong"** — open the Blocks mobile app; it corrects itself. On Android, whether the app icon shows a count depends on the phone.
- **"Can I stop notifications from one app?"** — yes: inside the app, open the bell and use the bell icon at the top of the panel, or go to **User** → **Notifications** → **Apps** → **Manage apps**. **Bell only** keeps them under the bell without desktop or phone alerts; **Muted** stops them completely.
- **"The bell inside an app shows nothing / fewer notifications"** — inside an app the bell shows only that app's notifications (its tab is selected). Pick **All apps** to see everything. If the panel says the app is muted, **Unmute** brings new ones back.
- **"Can I turn off a kind of notification?"** — yes, for alerts: **User** → **Notifications** → **Notify me about** has a **Desktop** and a **Mobile** switch per kind. Notifications themselves always show under the bell; **Mark all as read** clears the list.
- **"I get notifications at night" / "only during work"** — in **User** → **Notifications** → **Working hours**, pick **Weekdays** (Mon–Fri or Sun–Thu), **Every day** or **Custom**, and the times. They follow the **Time zone** in **My profile**; check it's right if alerts arrive at odd hours.
- **"I didn't get a phone notification"** — outside your working hours (if you set them), or while notifications are paused, alerts are skipped; so are notifications from an app set to **Bell only** or **Muted**. Also check the kind's **Mobile** switch in **User** → **Notifications**, and **Settings** → **Push notifications** in the mobile app.
- **"I'm not getting desktop notifications"** — check, in order: **User** → **Notifications** shows the switch on for this browser; the kind's **Desktop** switch is on; notifications aren't paused and it's within your working hours, if you set them; the browser is running; and the computer's own notification settings allow the browser (macOS: System Settings → Notifications → the browser; Windows: Settings → System → Notifications). **Send test** shows whether this browser receives them.
