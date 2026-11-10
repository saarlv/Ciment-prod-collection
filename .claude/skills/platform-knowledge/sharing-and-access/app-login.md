# How app users log in and out

## The built-in login page

- **Every app has a login page built in.** It's at `/auth/login` on the app's link, and signed-out visitors who need to log in are sent there automatically. An app never needs a login page built for it.
- **Sign-in methods:**
  - **Email login link**: enter an email and click **Send me a login link**. The link is valid for **1 day**. **Send another link** and **Use a different email** are on the next screen, which says **Check your email**. If the link couldn't be sent, the login page says so instead.
  - **Continue with Google**. Google's account chooser always opens, so a user already signed in to Google can pick a different account.
  - **SSO**: if the email belongs to a Blocks account with single sign-on set up, the user is sent to their company's sign-in.
- **There are no passwords.** "What's my password?" has no answer; use the email link or Google.
- Public apps can have their own branded login or sign-up page built by Ella. Private apps always use the built-in page.

## Who is allowed in

- **Invited users** (and team members with access) can always log in.
- **The invite email's link expires.** After that it opens the app's login page, where **Send me a login link** gets them in. Removing and re-adding the person isn't needed. Tell users to bookmark the app's link rather than reuse the invite email.
- **Unknown emails:**
  - If the app allows sign-up (**Anyone with the link can log in** or **Anyone can log in to restricted parts**), an unknown email becomes a new **external user** automatically. They get "Can access" and the app's **default role** (**Settings → General → App roles**).
  - Otherwise they're refused, and Blocks emails them that they're not part of this app. That's the "you haven't been invited" email people ask about; it's only sent when someone tries to log in.
- **Access is tied to the exact email invited.** Aliases and other addresses don't match.
- **External users can't sign in on the main Blocks login page.** "We don't have you in our platform yet" there usually means the person is an external user and must use the app's own link.

## Login emails not arriving

- Check spam. Company mail systems (Microsoft 365, Google Workspace) often quarantine automated mail before it reaches spam, so the recipient's IT team may need to look.
- Login and invite emails can be branded (sender name, logo, text) in **Settings → Customization → Email Branding**. A custom SMTP sender is also available on eligible plans.
- If the app has a custom domain, login links use it only once the domain setup is fully complete.

## Logging out

- **In the app's own tab** (its link or custom domain): logout works normally and signs the person out of that app only.
- **Inside the Blocks builder preview**: logout is disabled by design, because it would sign you out of Blocks entirely. A **Logout works differently here** message explains this. To test logout, open the app with **Share → Publish → Open link**.

## Staying logged in

App logins last a long time on the same browser; HIPAA accounts expire them sooner. If an app stops recognising a logged-in user, clearing the site's data (cookies/local storage) for the app's address and logging in again usually fixes it.

## Managing app users

- **Share → Publish → External access**, or **Settings → Members** ("Members, permissions & roles"). External users carry an **External** badge.
- Each person's "…" menu has **Edit access** (role, tenant) and **Remove access**.
- **View as role** on the canvas toolbar previews what each role sees without a second account.
