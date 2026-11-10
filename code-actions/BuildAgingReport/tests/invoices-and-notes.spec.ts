import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as aging } from '../code.ts';
import { buildWindow, computeAging, contactFor, latestSyncedAt } from '../../shared/collections-aging.ts';

const T = '2026-10-21';
const w = buildWindow(T, 3, 0); // 2026-07 … 2026-10

const inv = (invoiceNumber: string, dueDate: string, openAmount: number, extra: Record<string, unknown> = {}) => ({
  customerCode: 'C',
  invoiceNumber,
  documentType: 'חשבונית',
  invoiceDate: '2026-07-01',
  dueDate,
  amount: Math.abs(openAmount) || 100,
  openAmount,
  status: 'פתוחה',
  ...extra,
});

const invoices = [
  inv('I-10', '2026-09-15', 500, { syncedAt: '2026-10-20T04:00:00.000Z' }),
  inv('I-9', '2026-09-15', 300, { sourceDocUrl: 'files/i9.pdf' }),
  inv('I-2', '2026-09-02', 200),
  inv('CN-1', '2026-09-20', -50, { documentType: 'חשבונית זיכוי' }),
  inv('DN-1', '2026-09-10', 999, { documentType: 'תעודת משלוח' }),
  inv('I-OLD', '2026-05-01', 100),
  inv('I-LATE', '2026-12-10', 400, { syncedAt: '2026-10-21T03:15:00.000Z' }),
];

/** A CustomerNotes row (one customer + one due month). */
const note = (id: string, noteCreatedAt: string, extra: Record<string, unknown>) => ({
  id,
  customerCode: 'C',
  customerName: 'c',
  noteText: id,
  authorName: 'נינה',
  noteCreatedAt,
  noteSource: 'צוות',
  status: 'פעילה',
  ...extra,
});

const notes = [
  note('n1', '2026-10-01T08:00:00.000Z', { dueMonth: '2026-09', noteType: 'אחר', customTypeLabel: 'בירור – מחיר' }),
  note('n2', '2026-10-05T08:00:00.000Z', { dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-03', amount: 300, outcome: 'פתוחה' }),
  note('n3', '2026-10-03T08:00:00.000Z', { dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-10-01', amount: 500, outcome: 'קוימה', amountReceived: 500 }),
  note('n4', '2026-10-04T08:00:00.000Z', { dueMonth: '2026-07', noteType: 'חזור אליי', actionDate: '2026-10-26', status: 'נסגרה ידנית' }),
  note('n5', '2026-10-02T08:00:00.000Z', { dueMonth: '2026-12', noteType: 'התחייבות לתשלום', actionDate: '2026-12-10', amount: null, balanceAtNote: 400, outcome: 'לא קוימה', amountReceived: 0, amountRemaining: 400 }),
  note('n6', '2026-09-01T08:00:00.000Z', { dueMonth: '2026-05', noteType: 'אחר' }),
];

const run = () =>
  computeAging({
    window: w,
    customers: [{ customerCode: 'C', customerName: 'c', ledgerBalance: 1450 }],
    invoices,
    notes,
    contacts: [],
    ownerMap: new Map(),
  });

describe('aging cells list their open invoices', () => {
  it('numbers the open debt rows of a cell by due date then invoice number', () => {
    const r = run().customers[0];
    const sep = r.months.find((m) => m.monthKey === '2026-09')!;
    expect(sep.invoices.map((i) => [i.index, i.invoiceNumber])).toEqual([
      [1, 'I-2'],
      [2, 'I-9'],
      [3, 'I-10'],
      [4, 'CN-1'],
    ]);
    expect(sep.invoices[1]).toMatchObject({
      documentType: 'חשבונית',
      invoiceDate: '2026-07-01',
      dueDate: '2026-09-15',
      amount: 300,
      openAmount: 300,
      status: 'פתוחה',
      sourceDocUrl: 'files/i9.pdf',
    });
    expect(sep.invoices[3]).toMatchObject({ documentType: 'חשבונית זיכוי', openAmount: -50 });
    expect(r.priorDebt.invoices.map((i) => i.invoiceNumber)).toEqual(['I-OLD']);
    expect(r.laterDebt.invoices.map((i) => [i.index, i.invoiceNumber])).toEqual([[1, 'I-LATE']]);
    expect(r.laterDebt.byMonth.find((m) => m.monthKey === '2026-12')!.invoices.map((i) => i.invoiceNumber)).toEqual(['I-LATE']);
  });

  it('keeps every existing amount and field', () => {
    const r = run().customers[0];
    const sep = r.months.find((m) => m.monthKey === '2026-09')!;
    expect(sep.amount).toBe(950);
    expect(sep.invoiceNumbers).toEqual(['I-10', 'I-9', 'I-2', 'CN-1']);
    expect([r.priorDebt.amount, r.laterDebt.amount, r.total, r.balanceMatches]).toEqual([100, 400, 1450, true]);
  });
});

describe('customer notes (CustomerNotes) by due month', () => {
  it('every note sits in the cell of its dueMonth, newest first; cellNotes = notes; invoices carry none', () => {
    const r = run().customers[0];
    const sep = r.months.find((m) => m.monthKey === '2026-09')!;
    expect(sep.notes.map((n) => n.id)).toEqual(['n2', 'n3', 'n1']);
    expect(sep.cellNotes.map((n) => n.id)).toEqual(['n2', 'n3', 'n1']);
    expect(sep.notes[0]).toMatchObject({
      id: 'n2',
      monthKey: '2026-09',
      dueMonth: '2026-09',
      noteType: 'התחייבות לתשלום',
      typeLabel: 'התחייבות לתשלום',
      actionDate: '2026-11-03',
      noteAmount: 300,
      outcome: 'פתוחה',
      status: 'פעילה',
      writtenAt: '2026-10-05T08:00:00.000Z',
      invoiceNumber: null,
      invoiceClosed: false,
    });
    expect(sep.notes[2]).toMatchObject({ noteType: 'אחר', customTypeLabel: 'בירור – מחיר', typeLabel: 'בירור – מחיר' });
    for (const i of sep.invoices) expect([i.notes, i.latestNote, i.promise]).toEqual([[], null, null]);
    // a closed note still shows in its month (history); before / after the window in חוב קודם / חוב מאוחר
    expect(r.months.find((m) => m.monthKey === '2026-07')!.notes.map((n) => [n.id, n.status])).toEqual([['n4', 'נסגרה ידנית']]);
    expect(r.priorDebt.notes.map((n) => n.id)).toEqual(['n6']);
    expect(r.laterDebt.notes.map((n) => n.id)).toEqual(['n5']);
    expect(r.laterDebt.byMonth.find((m) => m.monthKey === '2026-12')!.notes.map((n) => n.id)).toEqual(['n5']);
  });

  it('open commitments (active, not kept) mark their cell and the customer', () => {
    const r = run().customers[0];
    const sep = r.months.find((m) => m.monthKey === '2026-09')!;
    expect(sep.promises).toEqual([
      expect.objectContaining({ id: 'n2', noteId: 'n2', promisedAmount: 300, promisedDate: '2026-11-03', checkOn: '2026-11-03', status: 'פתוחה', dueMonth: '2026-09' }),
    ]);
    // no amount: what was promised is the month's balance when written
    expect(r.laterDebt.promises).toEqual([expect.objectContaining({ id: 'n5', promisedAmount: 400, status: 'לא קוימה', amountRemaining: 400 })]);
    expect(r.openPromises.map((p) => p.id)).toEqual(['n2', 'n5']);
  });

  it('an active note brings a customer without debt into the report; a closed one does not', () => {
    const res = computeAging({
      window: w,
      customers: [
        { customerCode: 'E', customerName: 'e' },
        { customerCode: 'F', customerName: 'f' },
      ],
      invoices: [],
      notes: [
        { id: 'e1', customerCode: 'E', dueMonth: '2026-10', noteType: 'אחר', noteText: 'x', status: 'פעילה', noteCreatedAt: '2026-10-01T08:00:00.000Z' },
        { id: 'f1', customerCode: 'F', dueMonth: '2026-10', noteType: 'אחר', noteText: 'y', status: 'נסגרה – החודש התאפס', noteCreatedAt: '2026-10-01T08:00:00.000Z' },
      ],
      ownerMap: new Map(),
    });
    expect(res.customers.map((c) => c.customerCode)).toEqual(['E']);
  });
});

describe('contact person and data freshness', () => {
  it('הנהלת חשבונות first, else the first contact, else Customers.apContact*, else null', () => {
    const contacts = [
      { contactKey: 'C-2', contactName: 'רון', roleFlags: 'רכש', phone: '050-2' },
      { contactKey: 'C-10', contactName: 'חן', roleFlags: 'הנהלת חשבונות', phone: '050-10', email: 'chen@x.example' },
      { contactKey: 'C-1', contactName: 'דנה', roleFlags: 'ראשי', phone: '050-1' },
    ];
    expect(contactFor(undefined, contacts)).toEqual({ name: 'חן', phone: '050-10', email: 'chen@x.example', role: 'הנהלת חשבונות' });
    expect(contactFor(undefined, [contacts[0], contacts[2]])).toMatchObject({ name: 'דנה', role: 'ראשי' });
    expect(contactFor({ apContactName: 'גלית', apContactPhone: '03-1' }, [])).toEqual({
      name: 'גלית',
      phone: '03-1',
      email: null,
      role: 'הנהלת חשבונות',
    });
    expect(contactFor({ customerName: 'x' }, [{ contactKey: 'C-9' }])).toBeNull();
  });
  it('dataAsOf = latest Invoices.syncedAt', () => {
    expect(run().dataAsOf).toBe('2026-10-21T03:15:00.000Z');
    expect(latestSyncedAt([{ syncedAt: null }, {}])).toBeNull();
  });
});

describe('BuildAgingReport output', () => {
  it('reads contacts and CustomerNotes; dataAsOf includes closed invoices; still one round trip', async () => {
    const fake = new FakeBlocks();
    fake.insert('Customers', [
      { customerCode: 'C', customerName: 'c', ledgerBalance: 800, apContactName: 'לא נבחר' },
      { customerCode: 'D', customerName: 'd', ledgerBalance: 100, apContactName: 'גלית', apContactEmail: 'g@d.example' },
    ]);
    fake.insert('CustomerContacts', [
      { contactKey: 'C-1', customerCode: 'C', contactName: 'דנה', roleFlags: 'רכש', phone: '050-1' },
      { contactKey: 'C-2', customerCode: 'C', contactName: 'חן', roleFlags: 'הנהלת חשבונות,ראשי', phone: '050-2' },
    ]);
    fake.insert('Invoices', [
      { ...invoices[0], syncedAt: '2026-10-20T04:00:00.000Z' },
      { ...invoices[1], syncedAt: '2026-10-20T04:00:00.000Z' },
      { ...inv('I-PAID', '2026-09-05', 0), syncedAt: '2026-10-21T05:00:00.000Z' },
      { customerCode: 'D', invoiceNumber: 'D-1', documentType: 'חשבונית', dueDate: '2026-10-10', amount: 100, openAmount: 100, syncedAt: '2026-10-19T04:00:00.000Z' },
    ]);
    fake.insert('CustomerNotes', [
      note('x1', '2026-10-04T08:00:00.000Z', { dueMonth: '2026-09', noteType: 'חזור אליי', actionDate: '2026-10-26' }),
      note('x2', '2026-10-05T08:00:00.000Z', { dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-10-28', amount: 500, outcome: 'קוימה' }),
    ]);
    current = fake.client();
    fake.resetDepth();
    const res = await aging({ asOfDate: T }, {});
    expect(fake.maxDepth).toBe(1);
    expect(res.dataAsOf).toBe('2026-10-21T05:00:00.000Z');
    const c = res.customers.find((x: any) => x.customerCode === 'C');
    expect(c.contact).toEqual({ name: 'חן', phone: '050-2', email: null, role: 'הנהלת חשבונות,ראשי' });
    expect(res.customers.find((x: any) => x.customerCode === 'D').contact).toMatchObject({ name: 'גלית', email: 'g@d.example' });
    const sep = c.months.find((m: any) => m.monthKey === '2026-09');
    expect(sep.invoices.map((i: any) => [i.index, i.invoiceNumber])).toEqual([
      [1, 'I-9'],
      [2, 'I-10'],
    ]);
    expect(sep.invoices[1]).toMatchObject({ latestNote: null, promise: null, notes: [] });
    // a kept commitment is history, not a marker
    expect(sep.promises).toHaveLength(0);
    expect(sep.cellNotes.map((n: any) => [n.noteText, n.noteType])).toEqual([
      ['x2', 'התחייבות לתשלום'],
      ['x1', 'חזור אליי'],
    ]);
    expect(c.months.find((m: any) => m.monthKey === '2026-07').notes).toHaveLength(0);
  });
});
