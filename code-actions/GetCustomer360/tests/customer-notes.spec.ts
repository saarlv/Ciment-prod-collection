import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

// Plan 04.11 stage 2: the card's call adds customerNotes (CustomerNotes, newest first) and openMonths (OpenMovements
// per due month + active notes), feeds the notes into the timeline, keeps every older field, and stays at TWO read rounds.
const C = 'TEST-095';

describe('GetCustomer360 – CustomerNotes and open months', () => {
  it('adds customerNotes / openMonths / feed entries; the old agingNotes / promises are gone; two read rounds', async () => {
    const fake = new FakeBlocks();
    fake.insert('Customers', [{ customerCode: C, customerName: 'בדיקה – כרטיס', source: 'test-fixture' }]);
    fake.insert('Invoices', [{ invoiceNumber: 'K-1', customerCode: C, documentType: 'חשבונית', amount: 3000, openAmount: 3000, dueDate: '2026-09-30', invoiceDate: '2026-08-30' }]);
    fake.insert('OpenMovements', [
      { movementId: 'm1', customerCode: C, dueMonth: '2026-09', amount: 3000 },
      { movementId: 'm2', customerCode: C, dueMonth: '2026-09', amount: -1000 },
      { movementId: 'm3', customerCode: C, dueMonth: '2026-10', amount: 4500 },
    ]);
    fake.insert('CustomerNotes', [
      { customerCode: C, dueMonth: '2026-09', noteType: 'התחייבות לתשלום', actionDate: '2026-11-05', amount: 2000, status: 'פעילה', outcome: 'קוימה חלקית', amountReceived: 500, amountRemaining: 1500, noteCreatedAt: '2026-11-01T08:00:00.000Z', noteText: 'משה' },
      { customerCode: C, dueMonth: '2026-10', noteType: 'אחר', customTypeLabel: 'בירור – מחיר', noteText: 'מחיר שגוי', status: 'פעילה', noteCreatedAt: '2026-11-03T08:00:00.000Z' },
      { customerCode: C, dueMonth: '2026-08', noteType: 'חזור אליי', actionDate: '2026-08-20', status: 'נסגרה – החודש התאפס', noteCreatedAt: '2026-08-15T08:00:00.000Z' },
      { customerCode: C, dueMonth: '2026-10', noteType: 'התחייבות לתשלום', actionDate: '2026-11-20', status: 'פעילה', outcome: 'פתוחה', noteCreatedAt: '2026-11-04T08:00:00.000Z' },
    ]);
    current = fake.client();
    fake.resetDepth();
    const r: any = await invoke({ customerCode: C, asOfDate: '2026-11-10' }, {});
    expect(fake.maxDepth).toBeLessThanOrEqual(2);
    expect(r.customerNotes.map((n: any) => n.noteCreatedAt)).toEqual(['2026-11-04T08:00:00.000Z', '2026-11-03T08:00:00.000Z', '2026-11-01T08:00:00.000Z', '2026-08-15T08:00:00.000Z']);
    expect(r.customerNotes[2]).toMatchObject({ status: 'פעילה', outcome: 'קוימה חלקית', amountReceived: 500, amountRemaining: 1500 });
    expect(r.openMonths).toEqual([
      { dueMonth: '2026-09', openTotal: 2000, movementCount: 2, activeNotes: 1 },
      { dueMonth: '2026-10', openTotal: 4500, movementCount: 1, activeNotes: 2 },
    ]);
    expect(r.kpis.openCommitments).toBe(1);
    const feed = r.timeline.filter((t: any) => t.relatedTable === 'CustomerNotes');
    expect(feed).toHaveLength(4);
    expect(feed[0]).toMatchObject({ kind: 'הערה', title: 'הערה (2026-10) · התחייבות לתשלום', status: 'פתוחה' });
    expect(feed.find((t: any) => t.title.includes('בירור – מחיר'))).toMatchObject({ title: 'הערה (2026-10) · בירור – מחיר: מחיר שגוי', status: 'פעילה' });
    // the old layer's fields are gone; the aging row reads the CustomerNotes
    expect(r).not.toHaveProperty('agingNotes');
    expect(r).not.toHaveProperty('promises');
    // open commitments = active and not kept (the partly kept one and the open one)
    expect(r.kpis.openPromises).toBe(2);
    expect(r.invoices).toHaveLength(1);
    expect(r.aging.months.find((m: any) => m.monthKey === '2026-09').notes.map((n: any) => n.noteType)).toEqual(['התחייבות לתשלום']);
    expect(r.aging.openPromises.map((p: any) => p.status).sort()).toEqual(['פתוחה', 'קוימה חלקית']);
  });
});
