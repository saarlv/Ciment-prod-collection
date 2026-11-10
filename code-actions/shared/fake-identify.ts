// Offline spec helper (never imported by a Lambda handler): a small TEST- world for IdentifyCustomers / IssueReceipt /
// GenerateReceiptPdf (plan 04.11 stage 4) – one bank line per identification rung, on the in-memory platform of
// fake-world.ts (HtmlToPdf returns a protected url per file name). The spec points its BlocksClient mock at `w.client`.
import type { Item } from './blocks/blocks-client.ts';
import { makeWorld, type World } from './fake-world.ts';

export const T = '2026-11-04'; // Wednesday
export const NOW = '2026-11-04T07:30:00.000Z'; // 09:30 Israel
export const BK = 'בדיקה – אחראית א';
const fx = { source: 'test-fixture', isTestFixture: true };

/** bankLineId of each case */
export const L = {
  companyId: 'TEST-BL-ID-01',
  alias: 'TEST-BL-ID-02',
  exactName: 'TEST-BL-ID-03',
  contact: 'TEST-BL-ID-04',
  mail: 'TEST-BL-ID-05',
  partial: 'TEST-BL-ID-06',
  ambiguous: 'TEST-BL-ID-07',
  unknown: 'TEST-BL-ID-08',
  chequeCleared: 'TEST-BL-ID-09',
  bounced: 'TEST-BL-ID-10',
} as const;

export interface IdentifyWorld extends World {
  batchId: string;
}

/** settings: AgentSettings rows to add (settingKey → value). */
export function identifyWorld(settings: Record<string, string> = {}): IdentifyWorld {
  const w = makeWorld();
  const { fake } = w;
  fake.insert(
    'AgentSettings',
    Object.entries(settings).map(([settingKey, value]) => ({ settingKey, value, valueType: 'מספר', isTestFixture: false })),
  );
  fake.insert('TeamMembers', [{ name: BK, role: 'מנהלת חשבונות', phone: '050-1111111', email: 'bk@ciment.test.example', active: true }]);
  const cust = (code: string, name: string, extra: Item = {}) => ({ customerCode: code, customerName: name, assignedBookkeeperName: BK, companyId: null, ...fx, ...extra });
  fake.insert('Customers', [
    cust('TEST-101', 'בדיקה – אורן בנייה', { companyId: 'TEST-513000101' }),
    cust('TEST-102', 'בדיקה – ברק תשתיות'),
    cust('TEST-103', 'בדיקה – גל שיווק בע״מ'),
    cust('TEST-104', 'בדיקה – דקל אחזקות'),
    cust('TEST-105', 'בדיקה – דקל השקעות'),
    cust('TEST-106', 'בדיקה – זוהר הנדסה'),
    cust('TEST-107', 'בדיקה – חן מערכות'),
    cust('TEST-108', 'בדיקה – טל פרויקטים'),
  ]);
  const contact = (code: string, n: number, contactName: string, email: string | null, isApContact: boolean, roleFlags = '') => ({
    contactKey: `${code}-${n}`,
    customerCode: code,
    contactName,
    email,
    phone: null,
    roleFlags,
    isApContact,
    ...fx,
  });
  fake.insert('CustomerContacts', [
    contact('TEST-101', 1, 'שרה אורני', 'sara@oren.test.example', true),
    contact('TEST-101', 2, 'אבי אורני', 'avi@oren.test.example', true, 'הנהלת חשבונות,ראשי'),
    contact('TEST-102', 1, 'דנה ברקי', 'ap@barak.test.example', true),
    contact('TEST-103', 1, 'יוסי גלי', 'yossi@gal.test.example', false), // not the AP contact → no draft
    contact('TEST-106', 1, 'רונית זוהרי', 'ap@zohar.test.example', true),
    contact('TEST-107', 1, 'עדי חני', 'ap@hen.test.example', true),
    contact('TEST-108', 1, 'משה טלי', 'ap@tal.test.example', true),
  ]);
  // the OpenMovements mirror (stage 5 debt check): TEST-101's 11,000 closes Aug + Sep cumulatively, TEST-102's 4,200 closes
  // Sep alone, every other customer has no open movement (→ לברר מול הלקוח)
  const mv = (code: string, name: string, n: number, dueMonth: string, amount: number) => ({
    movementId: `TEST-MV-${code}-${n}`,
    customerCode: code,
    customerName: name,
    docType: 'חשבונית',
    docNumber: `TEST-INV-${code}-${n}`,
    docDate: `${dueMonth}-01`,
    dueDate: `${dueMonth}-28`,
    dueMonth,
    amount,
    source: 'test-fixture',
  });
  fake.insert('OpenMovements', [
    mv('TEST-101', 'בדיקה – אורן בנייה', 1, '2026-08', 6000),
    mv('TEST-101', 'בדיקה – אורן בנייה', 2, '2026-09', 5000),
    mv('TEST-101', 'בדיקה – אורן בנייה', 3, '2026-10', 2500),
    mv('TEST-102', 'בדיקה – ברק תשתיות', 1, '2026-08', 3000),
    mv('TEST-102', 'בדיקה – ברק תשתיות', 2, '2026-09', 4200),
  ]);
  fake.insert('BankAliases', [{ bankName: 'א.ב. יזמות', customerCode: 'TEST-102', customerName: 'בדיקה – ברק תשתיות', status: 'מאושר', source: 'ידני', isTestFixture: true }]);
  fake.insert('InboundEmails', [
    {
      fromName: 'עדי חני',
      fromAddress: 'ap@hen.test.example',
      subject: 'העברה מטכנולוגיות',
      bodyText: 'שלום, העברנו היום 12,345 ₪ על חשבון החשבוניות. בברכה',
      receivedAt: '2026-11-02T08:00:00.000Z',
      customerCode: 'TEST-107',
      category: 'פירוט תשלום',
      isTestFixture: true,
    },
  ]);
  const [batch] = fake.insert('ImportBatches', [
    { fileName: 'Priority – שורות דפי בנק (בדיקה)', kind: 'שורות דפי בנק – Priority', dataDate: T, workDay: T, uploadedAt: NOW, status: 'נכתב', checkStatus: 'בבדיקה', isTestFixture: true },
  ]);
  const line = (id: string, n: number, payerName: string, amount: number, extra: Item = {}) => ({
    bankLineId: id,
    bankName: 'מזרחי',
    valueDate: T,
    amount,
    payerName,
    reference: 'העברה',
    bankAccount: 'TEST-ACC-9',
    lineType: 'העברה',
    customerCode: null,
    customerName: null,
    importBatchId: batch.id,
    status: 'חדשה',
    source: 'test-fixture',
    lineNo: n,
    checkStage: 'ממתינה לבדיקה',
    ...extra,
  });
  fake.insert('BankLines', [
    line(L.companyId, 1, 'העברה מלקוח', 11000, { reference: 'ח.פ 513000101' }),
    line(L.alias, 2, 'א.ב. יזמות', 4200),
    line(L.exactName, 3, 'גל שיווק בע״מ', 7300),
    line(L.contact, 4, 'רונית זוהרי', 5100),
    line(L.mail, 5, 'ח.מ. טכנולוגיות', 12345),
    line(L.partial, 6, 'טל פרויקטים ומבנים', 6600),
    line(L.ambiguous, 7, 'דקל', 2500),
    line(L.unknown, 8, 'פלוני אלמוני', 3141),
    line(L.chequeCleared, 9, 'פירעון צ׳ק', 7000, { lineType: 'פירעון צ׳ק', reference: 'פירעון צ׳ק 001187', checkStage: null }),
    line(L.bounced, 10, 'גל שיווק בע״מ', 8800, { lineType: 'צ׳ק חוזר', reference: 'צ׳ק 5521 חזר', checkStage: null }),
  ]);
  return { ...w, batchId: String(batch.id) };
}

export const lineRow = (w: World, id: string) => w.fake.rows('BankLines').find((l) => l.bankLineId === id)!;
export const receiptRow = (w: World, id: string) => w.fake.rows('Receipts').find((r) => r.receiptKey === `RCPT-${id}`);
export const taskRows = (w: World, key: string) => w.fake.rows('CollectionQueue').filter((t) => t.taskKey === key);
export const openTask = (w: World, key: string) => taskRows(w, key).find((t) => ['ממתין', 'בטיפול'].includes(String(t.status)));
