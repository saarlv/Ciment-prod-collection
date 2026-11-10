import { describe, expect, it, vi } from 'vitest';
import { identifyWorld, L, NOW, T } from '../../shared/fake-identify.ts';
import { writesSince } from '../../shared/fake-world.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';
import { identifyCustomers } from '../../shared/collections-identify-customers.ts';
import { issueReceipts } from '../../shared/collections-issue-receipt.ts';

const CTX = { appId: 'test', token: 't' };
async function identified() {
  const w = identifyWorld();
  current = w.client;
  await identifyCustomers(w.client, { asOfDate: T, dryRun: false }, { nowIso: NOW });
  return w;
}

describe('ExplainMatch – identification + debt check (plan 04.11 part B stage 5), read-only', () => {
  it('a certain line before approval: the identification and a preview of the debt check; nothing is written', async () => {
    const w = await identified();
    const mark = w.fake.calls.length;
    const r = await invoke({ bankLineId: L.companyId, asOfDate: T }, CTX);
    expect(writesSince(w.fake, mark)).toEqual([]);
    expect(r).toMatchObject({ ok: true, dryRun: true, explainOnly: true, customerCode: 'TEST-101' });
    expect(r.identification).toMatchObject({ identifyStatus: 'ודאי', confidence: 100 });
    expect(r.debtCheck).toMatchObject({ source: 'תחזית – יירשם אחרי אישור הקבלה', result: 'נסגר לאפס – מצטבר', months: ['2026-08', '2026-09'], matchStatus: 'פיזור מוצע – לאישור' });
    expect(r.reasoning).toContain('ודאי');
    expect(r.reasoning).toContain('נסגר לאפס');
    expect(r.reasoning).toContain('פיזור');
  });

  it('an approved receipt: the stored result (also the לברר מול הלקוח task key)', async () => {
    const w = await identified();
    await issueReceipts(w.client, { mode: 'one', bankLineIds: [L.contact], customerCode: 'TEST-106', asOfDate: T, approvedBy: 'דנה' }, { nowIso: NOW });
    const mark = w.fake.calls.length;
    const r = await invoke({ bankLineId: L.contact, asOfDate: T }, CTX);
    expect(writesSince(w.fake, mark)).toEqual([]);
    expect(r.receipt).toMatchObject({ receiptStatus: 'אושרה – לא נשלחה', debtCheckResult: 'לברר מול הלקוח' });
    expect(r.debtCheck).toMatchObject({ source: 'נשמר בקבלה', result: 'לברר מול הלקוח', taskKey: `debt-check:RCPT-${L.contact}` });
    expect(r.reasoning).toContain('לברר מול הלקוח');
  });

  it('an unknown payer: no debt check; a missing line: an error', async () => {
    await identified();
    const r = await invoke({ bankLineId: L.unknown, asOfDate: T }, CTX);
    expect(r.identification.identifyStatus).toBe('לא זוהה');
    expect(r.debtCheck).toBeNull();
    expect(r.reasoning).toContain('לא זוהה');
    const missing = await invoke({ bankLineId: 'NOPE', asOfDate: T }, CTX);
    expect(missing.ok).toBe(false);
    expect(missing.errors).toContain('שורת הבנק NOPE לא נמצאה');
  });
});
