# Managing the subscription

**Only account admins** can see or change billing. Admins get there via **avatar menu → Upgrade** (plans) or **Account → Billing / Plans / Usage**. Members should ask an admin; **Account → Account admins** lists who they are.

The Blocks mobile app's **Settings → Billing** shows the plan and credit usage only. Plans, payment details, invoices and cancelling are on the web, not in the mobile app.

## Billing page (Account → Billing)

- **Current plan**: name, credit allowances, **What's included**, **Upgrade plan**, and **How credits work**.
- **Usage meters**: builder credits, usage credits and bonus credits, plus **View usage**.
- **Edit payment details**: change the card in the secure Stripe billing portal. Blocks isn't notified of card changes, and none is needed.
- **Invoices → View all invoices**: opens the Stripe portal. If it asks for an email, use the **billing email** on the subscription; a login link is sent there.
- **Need help? → Contact support**, and **Cancel subscription**.

## Upgrading (self-serve)

1. **Plans** → pick the plan and **Credits tier**, choose Monthly or Yearly, then **Change plan**.
2. Review **Upgrade to {plan}** → **Confirm upgrade**.

Details:

- It takes effect **immediately**. The prorated difference is charged now, and unused time on the old plan is credited on the invoice.
- New credits apply at once (see `billing/credits.md`).
- The first purchase asks for a card. Later upgrades reuse it.
- Card verification (3-D Secure) happens in place.
- **On a yearly plan, self-serve changes must stay yearly.** Switching yearly → monthly needs support.
- **Payment problems:**
  - "Payment didn't go through — You were not charged": **Try again** or **Contact us**.
  - "Payment is processing": wait, then check again.
  - "Your payment went through, but the subscription didn't register": **Contact us**.

## Downgrading

- **Not self-serve.** Choosing a cheaper plan or tier shows **Contact us**, and support schedules it.
- A downgrade takes effect **at the start of the next billing cycle**. Until then a banner shows the upcoming change, with **Cancel plan update**.
- If the new plan has fewer seats than the team uses, you're asked to choose who stays active (**Manage members**) or pick a bigger plan.
- **Moving to Free = cancelling the paid subscription.**

## Cancelling

- **Account → Billing → Cancel subscription**. You'll be asked why and offered a call first; then **I'd rather cancel**.
  - Business and Custom plans cancel through support.
- **Access continues until the end of the paid period**, then the account moves to Free and there are no further charges.
- Changed your mind? **Reactivate subscription** on the Billing page (before the period ends).
- **Not using the product doesn't cancel billing**; it has to be cancelled.
- There's **no pause** option.
- After cancelling, apps and data are kept, but apps can't run actions once usage credits run out on Free. How long data is retained after a subscription ends is a support question.

## Refunds

- There's no self-serve refund. **Refunds are decided case by case by support**: accidental purchases, wrong account, and so on. **Never promise a refund or an amount.**
- Point the user to support with the date and what happened.
- Refunds go back to the original payment method and take several business days.

## Billing email and accounts

- The **billing email** is separate from login. Changing the login email doesn't change it; ask support to update it.
- **Billed on the wrong account?** Support can move a subscription between accounts after verifying both.
