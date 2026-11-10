import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import type { BankLinesEntity, ISyncPriorityBankLinesActionOutput, ImportBatchesEntity } from '@/product-types';
import { formatNumber } from '@/utils/Format';

/**
 * The receipts screen's logic, pure. The bank lines are a mirror of Priority's שורות דפי בנק (SyncPriorityBankLines)
 * or of a confirmed bank file: the screen shows today's lines, the העברה / זיכוי בנק ones go through the one receipt
 * flow (identification → receipt → debt check → allocation), the rest are shown only. Lines without a priorityLineId
 * from older uploaded files stay view only.
 */

export type Batch = EntityType<typeof ImportBatchesEntity>;
export type BankLine = EntityType<typeof BankLinesEntity>;
export type SyncOutput = ISyncPriorityBankLinesActionOutput;

/** ImportBatches.kind of one pull of Priority's bank statement lines. */
export const PRIORITY_KIND = 'שורות דפי בנק – Priority';
/** ImportBatches.kind of an uploaded bank file (before stage 2). */
export const FILE_KIND = 'קובץ בנק';
/** The only line types the receipt flow handles. */
export const CHECKED_LINE_TYPES = ['העברה', 'זיכוי בנק'] as const;

/** The reason a Priority pull returns while the Priority connection is not set up. */
export const NOT_CONNECTED_REASON = 'Priority sync not connected yet';
/** The calm notice shown for it. */
export const NOT_CONNECTED_TEXT = 'החיבור לפריוריטי עדיין לא הוגדר';

/** True when a Priority pull answered that the connection is not set up yet (not an error). */
export function isNotConnected(out?: { ok?: boolean; reason?: string; errors?: string[] } | null): boolean {
  if (!out || out.ok !== false) return false;
  return out.reason === NOT_CONNECTED_REASON || !!out.errors?.includes(NOT_CONNECTED_REASON);
}

/** A line pulled from Priority (it has a priorityLineId); every other line came from an uploaded file. */
export function isPriorityLine(l: BankLine): boolean {
  return !!(l.priorityLineId ?? '').trim();
}

/** העברה / זיכוי בנק enter the receipt flow; פירעון צ׳ק / אחר are shown only. */
export function entersCheck(l: BankLine): boolean {
  return (CHECKED_LINE_TYPES as readonly string[]).includes(l.lineType ?? '');
}

function ts(value?: string | null): number {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

/** Today's newest Priority pull (dataDate = the load day), if any. */
export function latestPull(batches: Batch[], today: string): Batch | undefined {
  return batches
    .filter((b) => b.kind === PRIORITY_KIND && (b.dataDate ?? '').slice(0, 10) === today)
    .sort((a, b) => ts(b.uploadedAt) - ts(a.uploadedAt))[0];
}

const CONFIG_ERRORS: Record<string, string> = {
  'bank-settings-missing': 'חסרות הגדרות שעות דפי הבנק',
};

/** The sync's configError code in Hebrew. */
export function configErrorText(code?: string | null): string | null {
  if (!code) return null;
  return CONFIG_ERRORS[code] ?? `שגיאת הגדרות: ${code}`;
}

type BankMissing = { action?: string; change?: string };

/** One short line after "משוך עכשיו מפריוריטי": what came back, what was written and identified (stage 4: the new lines go to IdentifyCustomers). */
export function syncResultLine(out: SyncOutput): string {
  const n = (v?: number) => formatNumber(v ?? 0);
  const from = out.linesFromSource ?? 0;
  if (from === 0) return 'פריוריטי לא החזיר שורות להיום.';
  const parts = [`${n(out.created)} חדשות`];
  if ((out.adopted ?? 0) > 0) parts.push(`${n(out.adopted)} שויכו לשורות קיימות מקובץ`);
  if ((out.alreadyThere ?? 0) > 0) parts.push(`${n(out.alreadyThere)} כבר היו`);
  const checked = out.checked?.length ?? 0;
  parts.push(`${n(checked)} זוהו`);
  const left = out.checksLeft?.length ?? 0;
  if (left > 0) parts.push(`${n(left)} ממתינות לזיהוי`);
  return `${from === 1 ? 'נמשכה שורה אחת' : `נמשכו ${n(from)} שורות`}: ${parts.join(' · ')}.`;
}

/** The "דפי בנק לא נטענו" task the pull opened, refreshed or closed — null when it did nothing. */
export function bankMissingLine(out: SyncOutput): string | null {
  const t = (out.bankMissingTask ?? {}) as BankMissing;
  if (t.action === 'open') return t.change === 'refreshed' ? 'המשימה ״דפי בנק לא נטענו״ עודכנה.' : 'נפתחה משימה ״דפי בנק לא נטענו״.';
  if (t.action === 'close') return 'המשימה ״דפי בנק לא נטענו״ נסגרה – השורות הגיעו.';
  return null;
}

/** A legacy file line's one chip in "שורות ישנות מקובץ": a returned cheque, an issued receipt, else its stored status as is. */
export function legacyLineChip(l: BankLine): { label: string; tone?: 'critical' | 'done' } {
  if (l.lineType === 'צ׳ק חוזר') return { label: 'צ׳ק חוזר', tone: 'critical' };
  if (l.receiptKey || l.status === 'קבלה הונפקה') return { label: 'קבלה הונפקה', tone: 'done' };
  return { label: l.status || '—' };
}