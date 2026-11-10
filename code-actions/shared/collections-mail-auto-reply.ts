// The mail auto-reply threshold (AgentSettings mailAutoReplyAt, plan 04.11 r2 part C, stage 9), used by
// ApplyMailClassification (collections-mail-route.ts) after it wrote the reply draft of a כרטסת / חובות פתוחים email.
//
// - mailAutoReplyAt empty (the default) = OFF: every reply stays a draft for one-click approval.
// - a number (0–100): when the sender is מאומת (identification confidence 100 – the code's hard verification, never
//   Maya's) and that confidence is at or above the threshold, the draft is approved through the same decision path a
//   person's click uses (collections-approval-decision.ts → status אושר – לא נשלח, decidedBy the system actor).
//   There is still no real send in the app: "approved for auto-send" stops at אושר – לא נשלח like every approval.
// - only a reply whose every part is a statement PDF (כרטסת / חובות פתוחים) qualifies: a PDF missing / failed, another
//   type in the same email (remittance, promise, dispute, אחר …) keeps the draft for a person.
// Pure: the caller does the writes.
import { DATA_CATEGORIES, VERIFIED } from './collections-mail.ts';
import { numberSettingOrNull } from './plan-settings.ts';

export const S_MAIL_AUTO_REPLY_AT = 'mailAutoReplyAt';
/** Approvals.decidedBy of an automatic approval. */
export const AUTO_REPLY_ACTOR = 'שליחה אוטומטית (מערכת)';

/** Identification confidence of an inbound sender: 100 when the code verified it (מאומת), else 0. */
export const identificationConfidence = (verificationStatus: string) => (verificationStatus === VERIFIED ? 100 : 0);

export interface AutoReplyCheck {
  /** approve the draft automatically */
  on: boolean;
  /** the threshold read from the settings (null = empty = OFF) */
  threshold: number | null;
  confidence: number;
  /** why it is (not) approved automatically, in Hebrew */
  reason: string;
}

export function autoReplyCheck(
  settings: Map<string, string>,
  x: {
    verificationStatus: string;
    /** every category of the email */
    categories: string[];
    /** statement PDFs actually produced for the reply */
    pdfCount: number;
    /** anything else the reply carries or the email waits for (a promise proposal, a dispute, a failed route) */
    hasOtherParts: boolean;
  },
): AutoReplyCheck {
  const threshold = numberSettingOrNull(settings, S_MAIL_AUTO_REPLY_AT);
  const confidence = identificationConfidence(x.verificationStatus);
  const base = { threshold, confidence };
  if (threshold === null) return { ...base, on: false, reason: 'סף השליחה האוטומטית (mailAutoReplyAt) ריק – כבוי, הטיוטה ממתינה לאישור' };
  if (confidence < 100) return { ...base, on: false, reason: 'השולח לא מאומת – אין שליחה אוטומטית' };
  if (confidence < threshold) return { ...base, on: false, reason: `ביטחון הזיהוי ${confidence} מתחת לסף ${threshold}` };
  const statementCats = x.categories.filter((c) => DATA_CATEGORIES.includes(c));
  if (!statementCats.length || statementCats.length !== x.categories.length || x.hasOtherParts) {
    return { ...base, on: false, reason: 'המענה כולל יותר מכרטסת / חובות פתוחים – הטיוטה ממתינה לאישור' };
  }
  if (x.pdfCount < statementCats.length) return { ...base, on: false, reason: 'לא כל קובצי ה-PDF הופקו – הטיוטה ממתינה לאישור' };
  return { ...base, on: true, reason: `זיהוי ודאי (${confidence}) מעל סף השליחה האוטומטית ${threshold}` };
}
