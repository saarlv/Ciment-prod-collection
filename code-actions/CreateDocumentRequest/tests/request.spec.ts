import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorld, writesSince } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};

describe('CreateDocumentRequest', () => {
  const w = makeWorld();
  let caseId = '';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    current = w.client;
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
    // a case on a product line without a logistics contact
    w.fake.tables.set('DeliveryNotes', w.fake.rows('DeliveryNotes').map((n) => (n.invoiceNumber === 'TEST-INV-004-7' ? { ...n, productLine: 'ברזל' } : n)));
    const [d] = w.fake.insert('Disputes', [
      { disputeNumber: 'TEST-DSP-X', customerCode: 'TEST-004', customerName: 'בדיקה – רמות בנייה ופיתוח', disputeType: 'תעודת משלוח חסרה', invoiceNumbers: 'TEST-INV-004-7', status: 'ממתינה לסריקה', productLine: 'ברזל', reminderCount: 0, openedAt: '2026-10-21T06:00:00.000Z', isTestFixture: true },
    ]);
    caseId = d.id;
  });
  afterAll(() => vi.useRealTimers());

  it('validates', async () => {
    expect((await invoke({}, ctx)).errors).toEqual(['חסר מזהה מקרה (disputeId)']);
    expect((await invoke({ disputeId: 'nope' }, ctx)).errors).toEqual(['המקרה nope לא נמצא']);
  });

  it('dryRun writes nothing; no logistics contact → empty recipient and the reason says so', async () => {
    const before = w.fake.calls.length;
    const dry = await invoke({ disputeId: caseId, dryRun: true }, ctx);
    expect(writesSince(w.fake, before)).toHaveLength(0);
    expect(dry.approval).toMatchObject({ kind: 'פנייה ללוגיסטיקה', recipientContact: null, status: 'ממתין' });
    expect(dry.approval.reason).toContain('אין איש לוגיסטיקה פעיל לקו ברזל');
    const r = await invoke({ disputeId: caseId }, ctx);
    expect(r).toMatchObject({ writeVerified: true, noContact: true, replaced: false });
  });

  it('a reminder is its own draft; each kind replaces only itself', async () => {
    const rem = await invoke({ disputeId: caseId, kind: 'תזכורת' }, ctx);
    expect(rem.approval.subject.startsWith('תזכורת: ')).toBe(true);
    expect(rem.approval.body).toContain('תזכורת לבקשה מ-21.10.2026 09:00');
    await invoke({ disputeId: caseId, kind: 'תזכורת' }, ctx);
    await invoke({ disputeId: caseId }, ctx);
    expect(w.fake.rows('Approvals').filter((a) => a.relatedId === caseId).map((a) => a.subject.startsWith('תזכורת'))).toEqual([false, true]);
  });
});
