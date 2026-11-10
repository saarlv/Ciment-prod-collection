import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { errText, readSettings } from '../shared/collections-data.ts';
import { S_DOCUMENT_CHASE_ACTIVE, yesNoSetting } from '../shared/plan-settings.ts';
import { clean } from '../shared/collections-mail.ts';
import { inBusinessHours, resolveClock } from '../shared/collections-cases.ts';
import { runScanCheck } from '../shared/collections-documents.ts';

// Timer engine of 2c (hourly from DocumentChase, and from the case page's "נכון לתאריך" picker).
// For every open תעודת משלוח חסרה case (or one disputeId), as of the clock:
// - all scanned → מוכנה לשליחה ללקוח + the customer package draft
// - still missing, past nextReminderAt, no reminder yet → logistics reminder draft, תזכורת בטיוטה,
//   reminderCount 1, nextReminderAt += logisticsReminderHours
// - past nextReminderAt again → הוסלמה (ball with מנהל הגבייה, one Interactions הסלמה row) – it then
//   appears in the collections manager's summary (WriteBriefing, כולם)
// - complete case (just packaged, or already מוכנה לשליחה ללקוח / נסגרה – the sweep): its logistics
//   drafts still ממתין (בקשה and תזכורת) → נדחה "בוטלה – כל התעודות נסרקו", decidedBy המערכת; the ids are
//   in cancelledDraftIds (on dryRun: the ones that would be cancelled). The package draft is never touched.
//
// asOfDate: YYYY-MM-DD = that Israel date at the same Israel time-of-day as now (so the next day is
// exactly +24h), or an ISO date-time. Empty = now. A clock other than now acts ONLY on test cases
// (isTestFixture / TEST- customer); real cases are always evaluated with the real clock.
// Idempotent at the same clock. scheduled=true does nothing outside Sun–Thu 08:00–17:59 Israel time.
// scheduled=true also does nothing while AgentSettings documentChaseActive is not כן (plan 04.11: off by default):
// returns { skipped: true, reason }. Nothing is sent.
export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const scheduled = input?.scheduled === true;
  const nowMs = Date.now();
  let clock;
  try {
    clock = resolveClock(input?.asOfDate, nowMs);
  } catch (e) {
    return { dryRun, asOf: null, cases: [], writeVerified: false, errors: [errText(e)] };
  }
  if (scheduled && !inBusinessHours(nowMs)) {
    return { dryRun, asOf: clock.iso, skipped: true, skipReason: 'מחוץ לשעות העבודה (א׳–ה׳ 08:00–17:59) – הריצה המתוזמנת לא פועלת', cases: [], cancelledDraftIds: [], writeVerified: true, errors: [] };
  }
  const disputeId = clean(input?.disputeId);
  const client = new BlocksClient(context);
  // plan 04.11 part C: the automatic chase is off (AgentSettings documentChaseActive = לא) – the scheduled run does
  // nothing; a person can still recount one case from the case page
  if (scheduled && !yesNoSetting(await readSettings(client), S_DOCUMENT_CHASE_ACTIVE)) {
    const reason = 'מרדף התעודות האוטומטי כבוי (documentChaseActive = לא) – תעודות וחשבוניות חסרות מטופלות ידנית';
    return { dryRun, asOf: clock.iso, skipped: true, reason, skipReason: reason, cases: [], cancelledDraftIds: [], writeVerified: true, errors: [] };
  }
  const res = await runScanCheck(client, { clockMs: clock.ms, nowMs, clockIsNow: clock.isNow, disputeIds: disputeId ? [disputeId] : undefined, dryRun });
  return {
    dryRun,
    asOf: clock.iso,
    asOfBasis: clock.basis,
    clockIsNow: clock.isNow,
    testClockNote: clock.isNow ? '' : 'שעון בדיקה: פועל רק על מקרי בדיקה; מקרים אמיתיים נבדקים לפי השעה האמיתית',
    cases: res.cases,
    cancelledDraftIds: res.cancelledDraftIds,
    writeVerified: !dryRun && res.writeVerified,
    errors: res.errors,
  };
};
