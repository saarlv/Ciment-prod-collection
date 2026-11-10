// Receipts: the shared enums of bank lines and customer proposals, name normalisation and the proposal lines reader.
// The old matching engine (RunMatching, then the IdentifyAndMatch / ApplyMailFinding ladder) was removed on 08.11:
// MatchProposals are customer proposals written by IdentifyCustomers, approved through IssueReceipt and marked done in
// Priority by DecideMatchProposal; invoices are allocated after the debt check (ProposeAllocation / ApplyAllocation).
import type { Item } from './blocks/blocks-client.ts';
import { str } from './collections-data.ts';

// ---------- enums (exactly as in the table artifacts) ----------
/** BankLines.status */
export const LINE_NEW = 'חדשה';
export const LINE_UNIDENTIFIED = 'לא מזוהה';
/** the receipt was marked issued in Priority */
export const LINE_ISSUED = 'קבלה הונפקה';
/** Lines whose receipt is done in Priority (nothing left to decide on the line itself). */
export const DECIDED_LINE_STATUSES = [LINE_ISSUED];

/** MatchProposals.status */
export const MP_PROPOSED = 'מוצעת';
export const MP_APPROVED = 'אושרה – לביצוע ב-Priority';
export const MP_DONE = 'בוצעה ב-Priority';
export const MP_REJECTED = 'נדחתה';
export const MP_REPLACED = 'הוחלפה';

export const BOUNCED = 'צ׳ק חוזר';
export const LINE_TYPES = ['העברה', 'צ׳ק', 'צ׳ק חוזר', 'אחר'];

/** MatchProposals.confidence */
export const C_CERTAIN = 'ודאי';
export const C_HIGH = 'גבוה';
export const C_LOW = 'נמוך';

/** BankAliases.status */
export const ALIAS_PROPOSED = 'מוצע';
export const ALIAS_APPROVED = 'מאושר';
export const ALIAS_REJECTED = 'נדחה';

// ---------- names ----------
const TEST_NAME_PREFIX = /^\s*בדיקה\s*[–—-]\s*/;
const LEGAL_TOKENS = new Set(['בעמ', 'ושות', 'שות']);

/**
 * Name for comparison: drops the test prefix (בדיקה – ), punctuation (. , - ״ ׳ " ' and the like),
 * legal suffix tokens (בע״מ / בע"מ / בעמ, ושות׳ / ושות' / ושות) and collapses spaces.
 */
export function normName(v: unknown): string {
  let s = str(v).normalize('NFC').trim().replace(TEST_NAME_PREFIX, '');
  // ״ / " and ׳ / ' (and their typographic forms) are one mark each – and dropped, so they always compare equal
  s = s.replace(/["'״׳`’‘“”.]/g, '');
  s = s.replace(/[,\-–—_/\\()]+/g, ' ');
  // whitespace collapsed; the conjunction ו at the start of a token that is not the first one is dropped
  // ("אבי ובניו" = "אבי בניו" = "אבי  ובניו")
  const tokens = s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => (i > 0 && t.length > 1 && t.startsWith('ו') ? t.slice(1) : t));
  const kept = tokens.filter((t) => !LEGAL_TOKENS.has(t));
  return (kept.length ? kept : tokens).join(' ');
}


const proposalLines = (p: Item | undefined | null): Item[] => {
  const raw = p?.allocations;
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  const lines = obj?.lines;
  return Array.isArray(lines) ? lines : [];
};
export { proposalLines };
