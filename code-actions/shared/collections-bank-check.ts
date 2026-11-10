// "Is the bank statement in Priority?" and the urgent task when it is not – plan 04.11 part A, stage 2.
//
// The bank statement counts as loaded when the bank-lines source of SyncPriorityBankLines
// (shared/priority-bank-source.ts) has lines for the day. Until the Priority API is connected the check returns the
// error PRIORITY_NOT_CONNECTED (never "not loaded", so no false urgent task is opened).
//
// The urgent task bank-missing:<date> (דף הבנק לא עלה לפריוריטי, severity קריטית, source תקבולים) is built here for both
// writers: RunDaySchedule's 10:00 check (the owner of the rule in the work day) and SyncPriorityBankLines' own rule when
// it is run by itself. The scan never touches the key (parseTaskKey does not know the kind).
import type { Item } from './blocks/blocks-client.ts';
import { formatDateHe, israelLocalToUtcIso } from './collections-dates.ts';
import { SEV_CRITICAL, severityConfigFrom } from './collections-severity.ts';
import { buildTaskRow, TT_BANK_NOT_IN_PRIORITY } from './collections-tasks.ts';
import { type BankStatementSource, bankStatementSource } from './priority-bank-source.ts';
import { PRIORITY_NOT_CONNECTED } from './priority-connection.ts';

const ESCALATE = 'להסלים למנהל';

export interface BankStatementCheck {
  loaded: boolean;
  linesFound: number;
  source: string;
  error: string | null;
}

/** Is the day's bank statement in Priority? (the source has lines for the load day) */
export async function checkBankStatementInPriority(q: { loadDate: string; source?: BankStatementSource }): Promise<BankStatementCheck> {
  const source = q.source ?? bankStatementSource;
  if (source.connected === false) return { loaded: false, linesFound: 0, source: source.name, error: PRIORITY_NOT_CONNECTED };
  try {
    const lines = await source.fetchBankStatementLines({ loadDate: q.loadDate });
    return { loaded: lines.length > 0, linesFound: lines.length, source: source.name, error: null };
  } catch (e: any) {
    return { loaded: false, linesFound: 0, source: source.name, error: e?.message ? String(e.message) : String(e) };
  }
}

/** The urgent task row bank-missing:<date>. */
export function bankNotInPriorityRow(x: {
  asOfDate: string;
  asOfTime: string;
  /** the hour the statement had to be there by (bankRecheckAt) */
  readyBy: string;
  relatedId: string;
  nowIso: string;
  settings: Map<string, string>;
  isTest: boolean;
  /** RunDaySchedule's check: says the commitment tasks were not built today */
  fromDayRunner: boolean;
}): Item {
  const cfg = severityConfigFrom(x.settings);
  const [h, m] = x.readyBy.split(':').map(Number);
  const day = formatDateHe(x.asOfDate);
  return buildTaskRow({
    kind: 'bank-missing',
    id: x.asOfDate,
    taskType: TT_BANK_NOT_IN_PRIORITY,
    title: `${TT_BANK_NOT_IN_PRIORITY} – ${day}`,
    reasons: x.fromDayRunner
      ? `עד ${x.readyBy} (בדיקה אחרונה ב-${x.asOfTime}) דף הבנק של ${day} לא עלה לפריוריטי. ריצת התקבולים לא רצה, ומשימות ההתחייבות לא נוצרו היום; ייבדקו ביום הבא שדף הבנק יעלה. לוודא שדף הבנק נטען בפריוריטי`
      : `עד ${x.readyBy} לא נמשכו מפריוריטי שורות דפי בנק ל-${day} (בדיקה אחרונה ב-${x.asOfTime}). בלי שורות הבנק אין תקבולים לבדוק היום – לוודא שדף הבנק נטען בפריוריטי`,
    recommendedAction: ESCALATE,
    severity: { level: SEV_CRITICAL, score: Math.round(cfg.scoreCritical) },
    customerCode: null,
    customerName: null,
    owner: null,
    amount: null,
    invoiceNumbers: [],
    relatedTable: 'ImportBatches',
    relatedId: x.relatedId,
    dueAt: israelLocalToUtcIso(x.asOfDate, Number.isFinite(h) ? Math.min(23, h + 1) : 12, Number.isFinite(m) ? m : 0),
    asOfDate: x.asOfDate,
    nowIso: x.nowIso,
    isTestFixture: x.isTest,
    isAlert: false,
  });
}
