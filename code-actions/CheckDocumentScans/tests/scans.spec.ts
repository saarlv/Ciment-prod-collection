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

describe('CheckDocumentScans on TEST-INV-007-2 (date-only demo clock)', () => {
  const w = makeWorld();
  let caseId = '';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    current = w.client;
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
    const r = await checkDocs({ invoiceNumbers: ['TEST-INV-007-2'], customerCode: 'TEST-007' }, ctx);
    caseId = r.invoices[0].disputeId;
    expect(r.invoices[0]).toMatchObject({ outcome: 'ממתינה לסריקה', logisticsOwnerName: 'בדיקה – לוגיסטיקה בלוקים' });
  });
  afterAll(() => vi.useRealTimers());

  it('rejects a malformed clock', async () => {
    const r = await invoke({ asOfDate: '2026-13-40' }, ctx);
    expect(r.errors[0]).toContain('asOfDate');
  });

  it('dryRun at +2 days reports reminder then escalation, writes nothing', async () => {
    const before = w.fake.calls.length;
    const r = await invoke({ asOfDate: '2026-10-23', disputeId: caseId, dryRun: true }, ctx);
    expect(r.cases[0]).toMatchObject({ steps: ['תזכורת בטיוטה', 'הוסלמה'], after: 'הוסלמה' });
    expect(writesSince(w.fake, before)).toHaveLength(0);
  });

  it('the next day (same time of day = +24h) is the reminder; a jump straight to +2 days catches up to הוסלמה once', async () => {
    const r1 = await invoke({ asOfDate: '2026-10-22', disputeId: caseId }, ctx);
    expect(r1.cases[0]).toMatchObject({ action: 'תזכורת בטיוטה', reminderCount: 1 });
    const r2 = await invoke({ asOfDate: '2026-10-23' }, ctx);
    expect(r2.cases.find((c: any) => c.disputeId === caseId)).toMatchObject({ action: 'הוסלמה', steps: ['הוסלמה'] });
    const r3 = await invoke({ asOfDate: '2026-10-23' }, ctx);
    expect(r3.cases.find((c: any) => c.disputeId === caseId)).toMatchObject({ action: 'ללא שינוי', after: 'הוסלמה' });
    expect(w.fake.rows('Interactions').filter((i) => i.type === 'הסלמה' && i.customerCode === 'TEST-007')).toHaveLength(1);
    expect(w.fake.rows('Approvals').filter((a) => a.kind === 'פנייה ללוגיסטיקה' && a.relatedId === caseId)).toHaveLength(2);
  });
});
