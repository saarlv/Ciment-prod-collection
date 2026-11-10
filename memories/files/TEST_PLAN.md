# Test plan — Ciment Collections (given to Saar 25.10, demo day)
Saar runs the steps on screen with real mail; reports by step number. I prepare data (reseed) and read the activity log after each block. I approve/mark nothing.

0. Prep (me): SeedTestFixtures dry → real (clean state, fills Customers.address, seed mail via ProcessInboundEmail). Then give Saar the expected numbers for today's clock.
1. Stability: price case ×5 from disputes?tab=prices; 10 navigations in one tab. No freeze.
2. Today + bank file: two mandatory tasks; import demo bank CSV (preview, then real) → OnMorningImport → matching, promises, briefing on Today. Open-invoices task stays pending by design (no import for it yet).
3. Receipts: ודאי with explanation, single + batch approve; TEST-003 equal amounts → לבדיקה, correct; לא מזוהה with reason; aliases approve/reject; bounced cheque → urgent task; בוצע ב-Priority → promise update; headline "N התאמות אושרו היום".
4. Aging & promises: 10 customers, TEST-010 credit, TEST-009 prior/later; note drawer; meeting mode; promises 006 הופרה / 004 נקיימה / 007 חלקית / 001-002 פתוחה; new promise; 360 card.
5. Mail 2a/2b (to saar@blocks.diy, label Ciment-Test, ~2 min): verified כרטסת → PDF draft (first visual PDF check); unknown sender → no PDF, task לאמת שולח; irrelevant → no body; approve → אושר – לא נשלח + נענתה; open-debts batch exclusions; Ask Maya.
6. 2c: TEST-INV-004-7 4/6 → case + logistics draft; +25h reminder, +49h escalated (Today card); simulate scan → 6/6 package, logistics drafts → נדחה "בוטלה – כל התעודות נסרקו".
7. 2d: TEST-INV-004-2 gap 1,350 = 750 manual + 600 site list; drafts to agent+manager; manager-before-agent refused; ממתינה לזיכוי.
8. Insurance: "בדיקת ניצול עכשיו" → TEST-009 85% → 300,000, IND_DEBTS Y, address filled, CREDIT_DAYS/PAYTERMS_CODE unknown; אישור → אושר – לא הוגש; re-run no duplicate; API line visible.
9. Chats: Ask Nina from screens (answers from data); Nina asks approval in chat for DecideMatchProposal; Maya refuses to send; /nina briefings.
10. Safety throughout: nothing in Gmail Sent; no Priority writes; all test rows marked בדיקה.
11. Design: 1440 + mobile, band/glass/vertical logo/Hebrew date; Safari/iPhone blur; dark mode.
Known not built: insurance not in morning run, no ICIC API, Outlook not connected, no new-customer insurance, no WeeklyUnanswered, blocked orders hidden, open-invoices import, screens may show results up to 30 s old.
