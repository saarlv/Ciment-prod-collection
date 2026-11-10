// The marked sample bank file of the receipts test scenarios (account TEST-ACC-1, value date = the
// previous business day). Single source of truth for BuildSampleBankFile (PDF / CSV), the seed's
// receipt emails (the amounts they mention) and the offline specs, so the file, the mails and the
// expectations never drift apart. Test data only.
import { previousBusinessDay } from './collections-dates.ts';
import { round2 } from './collections-data.ts';

export const SAMPLE_ACCOUNT = 'TEST-ACC-1';
export const SAMPLE_BANK = 'מזרחי';
/** Balance before the day's movements; closing = opening + credits (211,617, 8 lines) − debits (14,500) = 590,960.55. */
export const SAMPLE_OPENING_BALANCE = 393843.55;

export interface SampleLine {
  /** Stable key (the old seeded ids were TEST-BL-PBD-<key>). */
  key: string;
  payerName: string;
  amount: number;
  reference: string;
  lineType: 'העברה' | 'צ׳ק' | 'צ׳ק חוזר' | 'אחר';
  /** The customer the scenario expects (null = unidentified). */
  customerCode: string | null;
  scenario: string;
}

/**
 * ד.ק. השקעות pays TEST-INV-007-1 of TEST-007 (בדיקה – דקל קבלנות): 20,000 with 12,000 already received,
 * 8,000 open, alone on its due date (end of last month): the sales agent's recent mail identifies the customer, and once
 * the receipt is approved the debt check compares 8,000 with the customer's due months. Only the agent's mail mentions
 * this amount.
 */
export const DK_AMOUNT = 8000;
export const DK_INVOICE = 'TEST-INV-007-1';

/**
 * מגדלי השרון pays TEST-009 (בדיקה – מגדלי השרון) 50,000 = TEST-INV-009-5 (22,000) + TEST-INV-009-6 (28,000), the two
 * invoices with a commitment note (CustomerNotes) on their due months: the debt check compares the amount with the due
 * months and the allocation proposes the invoices. The seed's invoices and notes use these numbers.
 */
export const MIGDALEI_AMOUNT = 50000;
export const TEST009_NOTE_SPLIT: [number, number] = [22000, 28000];

/**
 * רמות בנייה ופיתוח pays TEST-004 (בדיקה – רמות בנייה ופיתוח) 28,620 = TEST-INV-004-2 (18,750, due end of month −2) +
 * TEST-INV-004-7 (9,870, due end of this month): the amount equals no single open invoice and no group of open
 * invoices sharing a due date (42,150 / 44,180 / 25,170): the debt check does not close a month, and the person enters
 * this split from the remittance mail in the allocation editor. The mail is sent by hand to the test mailbox; the seeded
 * TEST-MAIL-004 (82,880 for 004-1/3/4/6) is linked to the customer only.
 */
export const RAMOT_MAIL_AMOUNT = 28620;
export const RAMOT_MAIL_SPLIT: { invoiceNumber: string; amount: number }[] = [
  { invoiceNumber: 'TEST-INV-004-2', amount: 18750 },
  { invoiceNumber: 'TEST-INV-004-7', amount: 9870 },
];

export const SAMPLE_LINES: SampleLine[] = [
  { key: '01', payerName: 'אבי ובניו', amount: 12000, reference: 'העברה', lineType: 'העברה', customerCode: 'TEST-001', scenario: 'זיהוי דרך מייל של אבי כהן (איש קשר רשום) – ההעברה היא מהחשבון של אבי ובניו' },
  { key: '02', payerName: 'אלון יזמות בע״מ', amount: 17424, reference: 'העברה', lineType: 'העברה', customerCode: 'TEST-002', scenario: 'כרטיס לקוח: שם זהה; 3 × 5,808 עם אותו פירעון' },
  { key: '03', payerName: 'ש.ח. הנדסה בע״מ', amount: 9360, reference: 'העברה', lineType: 'העברה', customerCode: 'TEST-003', scenario: 'כינוי מאושר; שתי חשבוניות של 9,360 באותו חודש → בדיקת החוב: לברר מול הלקוח' },
  { key: '04', payerName: 'רמות בנייה ופיתוח בע״מ', amount: 82880, reference: 'העברה', lineType: 'העברה', customerCode: 'TEST-004', scenario: 'כרטיס לקוח; מייל פירוט עם 4 מספרי חשבוניות' },
  { key: '05', payerName: 'גל מתכת', amount: -14500, reference: 'צ׳ק 004512 חזר – אין כיסוי מספיק', lineType: 'צ׳ק חוזר', customerCode: 'TEST-005', scenario: 'צ׳ק חוזר → משימה דחופה' },
  { key: '06', payerName: 'י.ד. השקעות', amount: 3333, reference: 'העברה', lineType: 'העברה', customerCode: null, scenario: 'אין כרטיס, כינוי או מייל → לא מזוהה' },
  { key: '07', payerName: 'ד.ק. השקעות', amount: DK_AMOUNT, reference: 'העברה', lineType: 'העברה', customerCode: 'TEST-007', scenario: 'מייל של סוכן סימנט: דקל קבלנות העבירה דרך החברה הקשורה ד.ק. השקעות' },
  {
    key: '08',
    payerName: 'מגדלי השרון בע״מ',
    amount: MIGDALEI_AMOUNT,
    reference: 'העברה',
    lineType: 'העברה',
    customerCode: 'TEST-009',
    scenario: 'כרטיס לקוח; שתי התחייבויות לתשלום (הערות לקוח) על חודשי TEST-INV-009-5 + 009-6 (22,000 + 28,000) → בדיקת החוב מול חודשי הפירעון, ואז הפיזור',
  },
  {
    key: '09',
    payerName: 'רמות בנייה ופיתוח בע״מ',
    amount: RAMOT_MAIL_AMOUNT,
    reference: 'העברה',
    lineType: 'העברה',
    customerCode: 'TEST-004',
    scenario: 'כרטיס לקוח; החלוקה מהמייל הידני TEST-INV-004-2 (18,750) + TEST-INV-004-7 (9,870) מוזנת בעורך הפיזור',
  },
];

export interface SampleFileLine extends SampleLine {
  lineNo: number;
  valueDate: string;
  balance: number;
}

export interface SampleFile {
  account: string;
  bankName: string;
  valueDate: string;
  lines: SampleFileLine[];
  creditCount: number;
  creditTotal: number;
  debitTotal: number;
  openingBalance: number;
  closingBalance: number;
}

/** The sample statement for the bank day before asOfDate (running balance per line). */
export function sampleBankFile(asOfDate: string): SampleFile {
  const valueDate = previousBusinessDay(asOfDate);
  let balance = SAMPLE_OPENING_BALANCE;
  const lines = SAMPLE_LINES.map((l, i) => {
    balance = round2(balance + l.amount);
    return { ...l, lineNo: i + 1, valueDate, balance };
  });
  const credits = SAMPLE_LINES.filter((l) => l.amount > 0);
  return {
    account: SAMPLE_ACCOUNT,
    bankName: SAMPLE_BANK,
    valueDate,
    lines,
    creditCount: credits.length,
    creditTotal: round2(credits.reduce((s, l) => s + l.amount, 0)),
    debitTotal: round2(SAMPLE_LINES.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0)),
    openingBalance: SAMPLE_OPENING_BALANCE,
    closingBalance: balance,
  };
}
