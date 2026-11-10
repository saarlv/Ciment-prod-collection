import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as checkDocs } from '../../CheckInvoiceDocuments/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};
const NOW = Date.parse('2026-10-21T06:00:00.000Z');
const NOTE = 'בוטלה – כל התעודות נסרקו';

describe('a complete documents case cancels its pending logistics drafts', () => {
  const w = makeWorld();
  let caseId = '';
  let approvedId = '';
  const logistics = () => w.fake.rows('Approvals').filter((a) => a.kind === 'פנייה ללוגיסטיקה' && a.relatedId === caseId);

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    current = w.client;
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
    // plan 04.11 part C: the automatic chase is off by default – these tests run it switched on
    w.fake.insert('AgentSettings', [{ settingKey: 'documentChaseActive', value: 'כן', valueType: 'כן או לא' }]);
    // 4/6 → the case and the first logistics request; the next day → the reminder draft
    const r = await checkDocs({ invoiceNumbers: ['TEST-INV-004-7'], customerCode: 'TEST-004' }, ctx);
    caseId = r.invoices[0].disputeId;
    await invoke({ asOfDate: '2026-10-22', disputeId: caseId }, ctx);
    expect(logistics().map((a) => [a.status, a.subject.startsWith('תזכורת')])).toEqual([
      ['ממתין', false],
      ['ממתין', true],
    ]);
    // an older logistics draft that was already approved must never be touched
    const [approved] = w.fake.insert('Approvals', [
      { kind: 'פנייה ללוגיסטיקה', relatedTable: 'Disputes', relatedId: caseId, customerCode: 'TEST-004', status: 'אושר – לא נשלח', subject: 'ישנה', isTestFixture: true },
    ]);
    approvedId = approved.id;
    // logistics scanned the two missing notes (6/6)
    for (const n of w.fake.rows('DeliveryNotes').filter((x) => x.invoiceNumber === 'TEST-INV-004-7')) n.scanned = true;
  });
  afterAll(() => vi.useRealTimers());

  it('dryRun reports both pending drafts and writes nothing', async () => {
    const before = w.fake.calls.length;
    const r = await invoke({ disputeId: caseId, dryRun: true }, ctx);
    const pending = logistics().filter((a) => a.status === 'ממתין').map((a) => a.id);
    expect(pending).toHaveLength(2);
    expect(r.cancelledDraftIds).toEqual(pending);
    expect(r.cases[0]).toMatchObject({ action: 'חבילה מוכנה', after: 'מוכנה לשליחה ללקוח', cancelledDraftIds: pending });
    expect(writesSince(w.fake, before)).toHaveLength(0);
    expect(logistics().filter((a) => a.status === 'ממתין')).toHaveLength(2);
  });

  it('6/6: the package is prepared and both pending drafts are closed as נדחה with the note', async () => {
    const pending = logistics().filter((a) => a.status === 'ממתין').map((a) => a.id);
    const r = await invoke({ disputeId: caseId }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.cancelledDraftIds).toEqual(pending);
    expect(r.cases[0].steps).toEqual(['חבילה מוכנה', 'בוטלו טיוטות ללוגיסטיקה']);
    for (const id of pending) {
      expect(w.fake.rows('Approvals').find((a) => a.id === id)).toMatchObject({ status: 'נדחה', decisionNote: NOTE, decidedBy: 'המערכת', decidedAt: new Date(NOW).toISOString() });
    }
    // the customer package stays pending, the approved draft is untouched
    const pkg = w.fake.rows('Approvals').filter((a) => a.kind === 'מענה ללקוח' && a.relatedId === caseId);
    expect(pkg.map((a) => a.status)).toEqual(['ממתין']);
    expect(pkg[0].decisionNote ?? null).toBeNull();
    expect(w.fake.rows('Approvals').find((a) => a.id === approvedId)).toMatchObject({ status: 'אושר – לא נשלח', subject: 'ישנה' });
    expect(w.fake.rows('Approvals').find((a) => a.id === approvedId)!.decisionNote).toBeUndefined();
    // a second run changes nothing
    const again = await invoke({ disputeId: caseId }, ctx);
    expect(again.cancelledDraftIds).toEqual([]);
  });

  it('the hourly sweep cancels drafts left on a case that is ALREADY complete (live case 6044255)', async () => {
    // a case that went to מוכנה לשליחה ללקוח before the fix, with its two logistics drafts still pending
    const [done] = w.fake.insert('Disputes', [
      { disputeNumber: 'TEST-DSP-20261022-1', customerCode: 'TEST-007', disputeType: 'תעודת משלוח חסרה', invoiceNumbers: 'TEST-INV-007-2', status: 'מוכנה לשליחה ללקוח', isTestFixture: true },
    ]);
    const drafts = w.fake.insert('Approvals', [
      { kind: 'פנייה ללוגיסטיקה', relatedTable: 'Disputes', relatedId: done.id, customerCode: 'TEST-007', status: 'ממתין', subject: 'סריקת תעודות משלוח', isTestFixture: true },
      { kind: 'פנייה ללוגיסטיקה', relatedTable: 'Disputes', relatedId: done.id, customerCode: 'TEST-007', status: 'ממתין', subject: 'תזכורת: סריקת תעודות משלוח', isTestFixture: true },
      { kind: 'מענה ללקוח', relatedTable: 'Disputes', relatedId: done.id, customerCode: 'TEST-007', status: 'ממתין', subject: 'חבילה', isTestFixture: true },
    ]);
    const ids = drafts.slice(0, 2).map((a) => a.id);

    const before = w.fake.calls.length;
    const dry = await invoke({ dryRun: true }, ctx);
    expect(dry.cancelledDraftIds).toEqual(ids);
    expect(dry.cases.find((c: any) => c.disputeId === done.id)).toMatchObject({ action: 'בוטלו טיוטות ללוגיסטיקה', before: 'מוכנה לשליחה ללקוח', after: 'מוכנה לשליחה ללקוח' });
    expect(writesSince(w.fake, before)).toHaveLength(0);

    // the scheduled run (DocumentChasePipeline: scheduled=true) inside business hours (Wed 09:00 Israel)
    const r = await invoke({ scheduled: true }, ctx);
    expect(r.skipped).toBeUndefined();
    expect(r.writeVerified).toBe(true);
    expect(r.cancelledDraftIds).toEqual(ids);
    const c = r.cases.find((x: any) => x.disputeId === done.id);
    expect(c.note).toBe(`המקרה בסטטוס מוכנה לשליחה ללקוח – 2 טיוטות ללוגיסטיקה שהמתינו בוטלו (${NOTE})`);
    for (const id of ids) expect(w.fake.rows('Approvals').find((a) => a.id === id)).toMatchObject({ status: 'נדחה', decisionNote: NOTE, decidedBy: 'המערכת' });
    expect(w.fake.rows('Approvals').find((a) => a.id === drafts[2].id)!.status).toBe('ממתין');
    expect(w.fake.rows('Disputes').find((d) => d.id === done.id)!.status).toBe('מוכנה לשליחה ללקוח');

    // idempotent: the next run finds nothing to cancel and no longer lists the case
    const again = await invoke({ scheduled: true }, ctx);
    expect(again.cancelledDraftIds).toEqual([]);
    expect(again.cases.some((x: any) => x.disputeId === done.id)).toBe(false);
  });

  it('a test clock never sweeps a real case; the real clock does', async () => {
    const [real] = w.fake.insert('Disputes', [
      { disputeNumber: 'DSP-20261021-9', customerCode: '10001', disputeType: 'תעודת משלוח חסרה', invoiceNumbers: 'R-1', status: 'נסגרה', isTestFixture: false },
    ]);
    const [draft] = w.fake.insert('Approvals', [
      { kind: 'פנייה ללוגיסטיקה', relatedTable: 'Disputes', relatedId: real.id, customerCode: '10001', status: 'ממתין', isTestFixture: false },
    ]);
    const test = await invoke({ asOfDate: '2026-10-25', dryRun: true }, ctx);
    expect(test.cancelledDraftIds).toEqual([]);
    const now = await invoke({ dryRun: true }, ctx);
    expect(now.cancelledDraftIds).toEqual([draft.id]);
  });
});

describe('CheckInvoiceDocuments on a case that is now 6/6', () => {
  const w = makeWorld();
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    current = w.client;
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
  });
  afterAll(() => vi.useRealTimers());

  it('a repeated customer request after the scans cancels the pending request draft', async () => {
    const first = await checkDocs({ invoiceNumbers: ['TEST-INV-007-2'], customerCode: 'TEST-007' }, ctx);
    const caseId = first.invoices[0].disputeId;
    const reqId = first.invoices[0].approvalId;
    expect(first.cancelledDraftIds).toEqual([]);
    for (const n of w.fake.rows('DeliveryNotes').filter((x) => x.invoiceNumber === 'TEST-INV-007-2')) n.scanned = true;
    const dry = await checkDocs({ invoiceNumbers: ['TEST-INV-007-2'], customerCode: 'TEST-007', dryRun: true }, ctx);
    expect(dry.cancelledDraftIds).toEqual([reqId]);
    expect(w.fake.rows('Approvals').find((a) => a.id === reqId)!.status).toBe('ממתין');
    const r = await checkDocs({ invoiceNumbers: ['TEST-INV-007-2'], customerCode: 'TEST-007' }, ctx);
    expect(r.writeVerified).toBe(true);
    expect(r.invoices[0]).toMatchObject({ disputeId: caseId, outcome: 'חבילה מוכנה', cancelledDraftIds: [reqId] });
    expect(w.fake.rows('Approvals').find((a) => a.id === reqId)).toMatchObject({ status: 'נדחה', decisionNote: NOTE, decidedBy: 'המערכת' });
    expect(w.fake.rows('Approvals').find((a) => a.kind === 'מענה ללקוח' && a.relatedId === caseId)!.status).toBe('ממתין');
  });
});
